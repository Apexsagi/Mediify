import type { Request } from 'express';

export interface ServerConfigReport {
  nodeEnv: string;
  databaseConfigured: boolean;
  supabaseAuthConfigured: boolean;
  storageConfigured: boolean;
  sessionSecretStrong: boolean;
  sessionSecretEphemeral: boolean;
  aiProvidersConfigured: {
    gemini: boolean;
    lingsante: boolean;
    huggingface: boolean;
    openaiCompatible: boolean;
  };
  clearinghouseConfigured: boolean;
  platformAdminConfigured: boolean;
  googleOAuthEnabled: boolean;
  emailVerificationRequired: boolean;
  canonicalBaseUrl: string;
  warnings: string[];
}

export function getPlatformAdminEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = getPlatformAdminEmails();
  if (admins.length === 0) return false;
  return admins.includes(email.trim().toLowerCase());
}

export function resolveCanonicalBaseUrl(req?: Request): string {
  const candidates = [
    process.env.CUSTOM_DOMAIN_URL?.trim(),
    process.env.APP_URL?.trim(),
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch {
      // Skip malformed URL env entries
    }
  }

  if (req) {
    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
    if (host && /^[a-zA-Z0-9.:-]+$/.test(host)) {
      const normalizedProto = proto === 'http' ? 'http' : 'https';
      return `${normalizedProto}://${host}`;
    }
  }

  return 'https://mediify.vercel.app';
}

export function validateServerConfiguration(): ServerConfigReport {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const hasDb = Boolean(process.env.DATABASE_URL?.trim());
  const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL?.trim());
  const hasAnonKey = Boolean(process.env.SUPABASE_ANON_KEY?.trim());
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  const sessionSecret = process.env.SESSION_SECRET?.trim() || '';
  const sessionSecretStrong = sessionSecret.length >= 32;
  const sessionSecretEphemeral = sessionSecret.length < 16;

  const gemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const lingsante = Boolean(process.env.LINGSANTE_API_URL?.trim() && process.env.LINGSANTE_API_KEY?.trim());
  const huggingface = Boolean(process.env.HUGGINGFACE_API_TOKEN?.trim());
  const openaiCompatible = Boolean(
    process.env.OPENAI_COMPATIBLE_API_URL?.trim() && process.env.OPENAI_COMPATIBLE_API_KEY?.trim(),
  );
  const clearinghouseConfigured = Boolean(
    process.env.CLEARINGHOUSE_API_URL?.trim() &&
      process.env.CLEARINGHOUSE_CLIENT_ID?.trim() &&
      process.env.CLEARINGHOUSE_CLIENT_SECRET?.trim(),
  );
  const platformAdminConfigured = getPlatformAdminEmails().length > 0;

  const warnings: string[] = [];
  if (!hasDb || !hasSupabaseUrl || !hasServiceRole) {
    warnings.push('Supabase/PostgreSQL connection variables (DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) incomplete.');
  }
  if (sessionSecretEphemeral) {
    warnings.push('SESSION_SECRET is missing or <16 chars; ephemeral signing secret rotates across restarts/serverless cold starts.');
  } else if (!sessionSecretStrong) {
    warnings.push('SESSION_SECRET should be at least 32 characters for production HMAC signing.');
  }
  if (!gemini && !lingsante && !huggingface && !openaiCompatible) {
    warnings.push('No AI inference credentials configured; clinical extraction/OCR routes will report unconfigured status.');
  }
  if (!platformAdminConfigured) {
    warnings.push('PLATFORM_ADMIN_EMAILS is unset; global marketing lead inbox routes (/api/admin/leads) remain locked.');
  }

  return {
    nodeEnv,
    databaseConfigured: hasDb,
    supabaseAuthConfigured: hasSupabaseUrl && hasAnonKey && hasServiceRole,
    storageConfigured: hasSupabaseUrl && hasServiceRole,
    sessionSecretStrong,
    sessionSecretEphemeral,
    aiProvidersConfigured: {
      gemini,
      lingsante,
      huggingface,
      openaiCompatible,
    },
    clearinghouseConfigured,
    platformAdminConfigured,
    googleOAuthEnabled: process.env.GOOGLE_OAUTH_ENABLED === 'true' && hasSupabaseUrl && hasAnonKey && hasServiceRole,
    emailVerificationRequired: process.env.EMAIL_VERIFICATION_REQUIRED === 'true',
    canonicalBaseUrl: resolveCanonicalBaseUrl(),
    warnings,
  };
}
