import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Pool, type PoolClient } from 'pg';

export const MEDICAL_RECORDS_BUCKET = 'medical-records';

export class ConfigurationRequiredError extends Error {
  statusCode = 503;
  code = 'CONFIGURATION_REQUIRED';
  missingKeys: string[];

  constructor(message: string, missingKeys: string[]) {
    super(message);
    this.missingKeys = missingKeys;
  }
}

export interface SupabaseConfigurationStatus {
  configured: boolean;
  databaseConfigured: boolean;
  supabaseAuthConfigured: boolean;
  storageConfigured: boolean;
  missingVariables: string[];
}

export function getSupabaseConfigurationStatus(): SupabaseConfigurationStatus {
  const missing: string[] = [];
  const hasDb = Boolean(process.env.DATABASE_URL?.trim());
  const hasUrl = Boolean(process.env.SUPABASE_URL?.trim());
  const hasAnon = Boolean(process.env.SUPABASE_ANON_KEY?.trim());
  const hasService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  if (!hasDb) missing.push('DATABASE_URL');
  if (!hasUrl) missing.push('SUPABASE_URL');
  if (!hasAnon) missing.push('SUPABASE_ANON_KEY');
  if (!hasService) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  return {
    configured: hasDb && hasUrl && hasService,
    databaseConfigured: hasDb,
    supabaseAuthConfigured: hasUrl && hasAnon && hasService,
    storageConfigured: hasUrl && hasService,
    missingVariables: missing,
  };
}

let pgPool: Pool | null = null;
let supabaseAdmin: SupabaseClient | null = null;

export function getPgPool(): Pool {
  const connStr = process.env.DATABASE_URL?.trim();
  if (!connStr) {
    const status = getSupabaseConfigurationStatus();
    throw new ConfigurationRequiredError(
      'Database connection not configured. Set DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.',
      status.missingVariables,
    );
  }

  if (!pgPool) {
    const useSsl =
      !connStr.includes('localhost') &&
      !connStr.includes('127.0.0.1') &&
      process.env.PGSSLMODE !== 'disable';

    pgPool = new Pool({
      connectionString: connStr,
      max: Number(process.env.PG_POOL_MAX || 15),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      ssl: useSsl ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
    });
  }

  return pgPool;
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseAdmin;
}

/**
 * Runs work inside an explicit PostgreSQL transaction and binds
 * `app.current_organization_id` locally so Row-Level Security (RLS)
 * enforces organization tenant isolation at the database engine layer.
 */
export async function withOrgTransaction<T>(
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_organization_id', $1, true)`, [organizationId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function uploadPrivateMedicalRecord(params: {
  organizationId: string;
  recordId: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  const client = getSupabaseAdmin();
  if (!client) {
    throw new ConfigurationRequiredError(
      'Private Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).',
      ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    );
  }

  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const objectPath = `${params.organizationId}/${params.recordId}/${safeName}`;

  const { error } = await client.storage
    .from(MEDICAL_RECORDS_BUCKET)
    .upload(objectPath, params.buffer, {
      contentType: params.mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to store medical document in private storage bucket: ${error.message}`);
  }

  return objectPath;
}

export async function downloadPrivateMedicalRecord(objectPath: string): Promise<Buffer> {
  const client = getSupabaseAdmin();
  if (!client) {
    throw new ConfigurationRequiredError(
      'Private Supabase Storage is not configured.',
      ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    );
  }

  const { data, error } = await client.storage.from(MEDICAL_RECORDS_BUCKET).download(objectPath);
  if (error || !data) {
    throw new Error(`Unable to retrieve medical document from private storage: ${error?.message ?? 'Missing blob'}`);
  }

  const arrBuf = await data.arrayBuffer();
  return Buffer.from(arrBuf);
}

export async function createPrivateMedicalRecordSignedUrl(
  objectPath: string,
  expiresInSeconds = 120,
): Promise<string | null> {
  const client = getSupabaseAdmin();
  if (!client || !objectPath) return null;
  const { data, error } = await client.storage
    .from(MEDICAL_RECORDS_BUCKET)
    .createSignedUrl(objectPath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
