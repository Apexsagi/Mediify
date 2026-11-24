import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db';
import type { UserRole } from '../src/lib/types';

const RUNTIME_SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

export interface AuthenticatedContext {
  userId: string;
  organizationId: string;
  email: string;
  fullName: string;
  role: UserRole;
  mfaVerified: boolean;
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

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

interface SessionPayload {
  uid: string;
  oid: string;
  email: string;
  role: UserRole;
  mfa: boolean;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlHours = 12): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + ttlHours * 3600 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
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
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function generateTotpCode(secretBase32: string, stepOffset = 0): string {
  const counter = Math.floor(Date.now() / 30000) + stepOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', Buffer.from(secretBase32, 'hex')).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secretHex: string, userCode: string): boolean {
  const clean = userCode.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  for (const offset of [-1, 0, 1]) {
    if (generateTotpCode(secretHex, offset) === clean) return true;
  }
  return false;
}

export function writeAuditLog(params: {
  organizationId: string;
  userId: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  ipAddress?: string;
}): void {
  db.prepare(`
    INSERT INTO audit_logs (id, organization_id, user_id, user_email, action, resource_type, resource_id, details, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `aud-${crypto.randomUUID()}`,
    params.organizationId,
    params.userId,
    params.userEmail,
    params.action,
    params.resourceType,
    params.resourceId,
    params.details,
    params.ipAddress || '127.0.0.1',
    new Date().toISOString(),
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Provide Authorization: Bearer token.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return;
  }

  const user = db
    .prepare('SELECT id, organization_id, email, full_name, role, is_active FROM users WHERE id = ? AND organization_id = ?')
    .get(payload.uid, payload.oid) as
    | { id: string; organization_id: string; email: string; full_name: string; role: UserRole; is_active: number }
    | undefined;

  if (!user || user.is_active !== 1) {
    res.status(401).json({ error: 'User account is inactive or not found.' });
    return;
  }

  req.auth = {
    userId: user.id,
    organizationId: user.organization_id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    mfaVerified: payload.mfa,
  };
  next();
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

// In-memory sliding window rate limiter for auth and AI inference routes
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
