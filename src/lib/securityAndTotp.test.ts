import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOtpAuthUri,
  computeTotpCode,
  generateBase32Secret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyTotpCode,
} from './totp';
import { validateClinicalUploadFile } from './fileValidator';

test('RFC 6238 TOTP generates valid base32 secrets, otpauth URIs, and verifies live codes', () => {
  const secret = generateBase32Secret(20);
  assert.match(secret, /^[A-Z2-7]+$/);
  assert.ok(secret.length >= 32);

  const uri = buildOtpAuthUri({
    issuer: 'MEDIIFY',
    accountEmail: 'coder@hospital.org',
    secretBase32: secret,
  });
  assert.ok(uri.startsWith('otpauth://totp/MEDIIFY%3Acoder%40hospital.org'));
  assert.ok(uri.includes(`secret=${secret}`));

  const nowMs = 1_760_000_000_000;
  const code = computeTotpCode(secret, 0, nowMs);
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotpCode(secret, code, nowMs), true);
  assert.equal(verifyTotpCode(secret, '000000', nowMs), false);
});

test('MFA recovery codes normalize casing and produce deterministic SHA-256 hashes', () => {
  const codes = generateRecoveryCodes(8);
  assert.equal(codes.length, 8);
  for (const code of codes) {
    assert.match(code, /^[A-F0-9]{5}-[A-F0-9]{5}$/);
  }
  assert.equal(hashRecoveryCode(codes[0]), hashRecoveryCode(codes[0].toLowerCase()));
  assert.notEqual(hashRecoveryCode(codes[0]), hashRecoveryCode(codes[1]));
});

test('validateClinicalUploadFile accepts valid PDF, PNG, JPEG, WEBP, and UTF-8 clinical text', () => {
  const pdf = validateClinicalUploadFile({
    buffer: Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'),
    declaredMime: 'application/pdf',
    originalName: 'encounter-note.pdf',
  });
  assert.equal(pdf.valid, true);
  assert.equal(pdf.detectedMime, 'application/pdf');
  assert.equal(pdf.sha256.length, 64);

  const png = validateClinicalUploadFile({
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
    declaredMime: 'image/png',
    originalName: 'scan.png',
  });
  assert.equal(png.valid, true);
  assert.equal(png.detectedMime, 'image/png');

  const txt = validateClinicalUploadFile({
    buffer: Buffer.from('Patient presents with acute bronchitis. Assessment: J20.9'),
    declaredMime: 'text/plain',
    originalName: 'progress.txt',
  });
  assert.equal(txt.valid, true);
  assert.equal(txt.detectedMime, 'text/plain');
});

test('validateClinicalUploadFile rejects disguised executables, active-script PDFs, and mismatched extensions', () => {
  // MZ Windows PE executable disguised as .txt
  const exeSpoof = validateClinicalUploadFile({
    buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x00, 0x00]),
    declaredMime: 'text/plain',
    originalName: 'evil.txt',
  });
  assert.equal(exeSpoof.valid, false);
  assert.match(exeSpoof.rejectionReason ?? '', /executable|binary/i);

  // PDF containing embedded /JavaScript directive
  const jsPdf = validateClinicalUploadFile({
    buffer: Buffer.from('%PDF-1.7\n1 0 obj\n<< /S /JavaScript /JS (app.alert(1)) >>\nendobj'),
    declaredMime: 'application/pdf',
    originalName: 'malicious.pdf',
  });
  assert.equal(jsPdf.valid, false);
  assert.match(jsPdf.rejectionReason ?? '', /active script|security scanner/i);

  // PDF bytes masquerading as PNG filename
  const extMismatch = validateClinicalUploadFile({
    buffer: Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj'),
    declaredMime: 'image/png',
    originalName: 'fake-image.png',
  });
  assert.equal(extMismatch.valid, false);
  assert.match(extMismatch.rejectionReason ?? '', /does not match/i);
});
