import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getPgPool, getSupabaseAdmin } from './supabase';
import type { UserRole } from '../src/lib/types';

const RUNTIME_SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

const DEFAULT_SESSION_TTL_MINUTES = Math.max(5, Math.min(120, Number(process.env.SESSION_TTL_MINUTES || 30)));

export interface AuthenticatedContext {
  userId: string;
  authUserId: string | null;
  organizationId: string;
  email: string;
  fullName: string;
  role: UserRole;
  mfaVerified: boolean;
  sessionJti: string | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedContext;
    }
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

interface SessionPayload {
  jti: string;
  uid: string;
  oid: string;
  email: string;
  role: UserRole;
  mfa: boolean;
  exp: number;
}

export function signSessionToken(
  payload: Omit<SessionPayload, 'exp' | 'jti'> & { jti?: string },
  ttlMinutes = DEFAULT_SESSION_TTL_MINUTES,
): { token: string; jti: string; expiresAt: string } {
  const jti = payload.jti ?? crypto.randomUUID();
  const exp = Date.now() + ttlMinutes * 60 * 1000;
  const fullPayload: SessionPayload = {
    jti,
    uid: payload.uid,
    oid: payload.oid,
    email: payload.email,
    role: payload.role,
    mfa: payload.mfa,
    exp,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return {
    token: `${encoded}.${sig}`,
    jti,
    expiresAt: new Date(exp).toISOString(),
  };
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp || !parsed.jti) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function createPersistedSession(params: {
  userId: string;
  organizationId: string;
  email: string;
  role: UserRole;
  mfaVerified: boolean;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ token: string; expiresAt: string; jti: string }> {
  const signed = signSessionToken({
    uid: params.userId,
    oid: params.organizationId,
    email: params.email,
    role: params.role,
    mfa: params.mfaVerified,
  });

  const pool = getPgPool();
  await pool.query(
    `INSERT INTO user_sessions (user_id, organization_id, token_jti, ip_address, user_agent, mfa_verified, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.userId,
      params.organizationId,
      signed.jti,
      params.ipAddress ?? '',
      (params.userAgent ?? '').slice(0, 200),
      params.mfaVerified,
      signed.expiresAt,
    ],
  );

  return signed;
}

export async function revokeSessionByJti(jti: string, organizationId: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE user_sessions SET revoked_at = NOW() WHERE token_jti = $1 AND organization_id = $2 AND revoked_at IS NULL`,
    [jti, organizationId],
  );
}

export async function writeAuditLog(params: {
  organizationId: string;
  userId: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  ipAddress?: string;
}): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `INSERT INTO audit_logs (organization_id, user_id, user_email, action, resource_type, resource_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet)`,
    [
      params.organizationId,
      params.userId,
      params.userEmail,
      params.action,
      params.resourceType,
      params.resourceId,
      params.details,
      params.ipAddress && /^[\da-fA-F:.]+$/.test(params.ipAddress) ? params.ipAddress : '127.0.0.1',
    ],
  );
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. Provide Authorization: Bearer token.' });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const pool = getPgPool();

    // 1. Check short-lived DB-tracked session token first
    const localPayload = verifySessionToken(token);
    if (localPayload) {
      const sessionRes = await pool.query(
        `SELECT s.revoked_at, s.expires_at, s.mfa_verified, u.id, u.auth_user_id, u.organization_id, u.email, u.full_name, u.role, u.is_active
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_jti = $1 AND s.organization_id = $2`,
        [localPayload.jti, localPayload.oid],
      );
      const row = sessionRes.rows[0];
      if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now() || !row.is_active) {
        res.status(401).json({ error: 'Session is expired, revoked, or inactive. Please sign in again.' });
        return;
      }
      req.auth = {
        userId: row.id,
        authUserId: row.auth_user_id ?? null,
        organizationId: row.organization_id,
        email: row.email,
        fullName: row.full_name,
        role: row.role,
        mfaVerified: Boolean(row.mfa_verified),
        sessionJti: localPayload.jti,
      };
      next();
      return;
    }

    // 2. Otherwise verify as a Supabase Auth JWT
    const supabaseAdmin = getSupabaseAdmin();
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && data?.user) {
        const userRes = await pool.query(
          `SELECT id, auth_user_id, organization_id, email, full_name, role, mfa_enabled, is_active
           FROM users
           WHERE auth_user_id = $1 OR LOWER(email) = LOWER($2)
           LIMIT 1`,
          [data.user.id, data.user.email ?? ''],
        );
        const row = userRes.rows[0];
        if (!row || !row.is_active) {
          res.status(401).json({ error: 'Account is not provisioned or inactive in MEDIIFY.' });
          return;
        }
        req.auth = {
          userId: row.id,
          authUserId: row.auth_user_id ?? data.user.id,
          organizationId: row.organization_id,
          email: row.email,
          fullName: row.full_name,
          role: row.role,
          mfaVerified: Boolean(row.mfa_enabled),
          sessionJti: null,
        };
        next();
        return;
      }
    }

    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (req.auth.role === 'admin' || allowedRoles.includes(req.auth.role)) {
      next();
      return;
    }
    res.status(403).json({
      error: `Insufficient role permissions. Required one of: ${allowedRoles.join(', ')}.`,
    });
  };
}

const rateBuckets = new Map<string, number[]>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'local'}:${req.path}`;
    const now = Date.now();
    const history = (rateBuckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (history.length >= maxRequests) {
      res.status(429).json({ error: 'Rate limit exceeded. Please wait before retrying.' });
      return;
    }
    history.push(now);
    rateBuckets.set(key, history);
    next();
  };
}
