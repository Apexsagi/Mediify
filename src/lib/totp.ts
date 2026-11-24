import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(byteLength = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(secretBase32: string): Buffer {
  const clean = secretBase32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

export function buildOtpAuthUri(params: {
  issuer?: string;
  accountEmail: string;
  secretBase32: string;
}): string {
  const issuer = encodeURIComponent(params.issuer ?? 'MEDIIFY');
  const label = encodeURIComponent(`${params.issuer ?? 'MEDIIFY'}:${params.accountEmail}`);
  return `otpauth://totp/${label}?secret=${params.secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function computeTotpCode(secretBase32: string, stepOffset = 0, nowMs = Date.now()): string {
  const key = decodeBase32(secretBase32);
  const counter = Math.floor(nowMs / 30000) + stepOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secretBase32: string, userCode: string, nowMs = Date.now()): boolean {
  const clean = userCode.trim();
  if (!/^\d{6}$/.test(clean) || !secretBase32) return false;
  const cleanBuf = Buffer.from(clean, 'utf8');
  for (const offset of [-1, 0, 1]) {
    const candidate = computeTotpCode(secretBase32, offset, nowMs);
    const candidateBuf = Buffer.from(candidate, 'utf8');
    if (candidateBuf.length === cleanBuf.length && crypto.timingSafeEqual(candidateBuf, cleanBuf)) {
      return true;
    }
  }
  return false;
}

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
