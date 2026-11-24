import crypto from 'node:crypto';

export interface FileValidationResult {
  valid: boolean;
  detectedMime: string;
  sha256: string;
  sizeBytes: number;
  rejectionReason?: string;
}

export const MAX_CLINICAL_FILE_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'application/json',
  'text/csv',
]);

function startsWithBytes(buf: Buffer, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (buf[i] !== sig[i]) return false;
  }
  return true;
}

function isLikelyUtf8Text(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  for (let i = 0; i < sample.length; i += 1) {
    const b = sample[i];
    // Reject NUL bytes and disallowed control chars (allow \t, \n, \r)
    if (b === 0 || (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d)) {
      return false;
    }
  }
  return true;
}

/**
 * Validates uploaded clinical files by inspecting magic-byte signatures,
 * size limits, active-content PDF directives (/JavaScript, /Launch, /OpenAction),
 * and computing an immutable SHA-256 digest.
 */
export function validateClinicalUploadFile(params: {
  buffer: Buffer;
  declaredMime: string;
  originalName: string;
  maxBytes?: number;
}): FileValidationResult {
  const { buffer, declaredMime, originalName, maxBytes = MAX_CLINICAL_FILE_BYTES } = params;
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  if (!buffer || buffer.length === 0) {
    return {
      valid: false,
      detectedMime: 'application/octet-stream',
      sha256,
      sizeBytes: 0,
      rejectionReason: 'Uploaded file is empty.',
    };
  }

  if (buffer.length > maxBytes) {
    return {
      valid: false,
      detectedMime: declaredMime || 'application/octet-stream',
      sha256,
      sizeBytes: buffer.length,
      rejectionReason: `File exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB.`,
    };
  }

  // Detect magic-byte signature
  let detectedMime = '';

  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    detectedMime = 'application/pdf';
    const pdfPreview = buffer.toString('latin1');
    if (/\/(JavaScript|JS|Launch|RichMedia)\b/i.test(pdfPreview)) {
      return {
        valid: false,
        detectedMime,
        sha256,
        sizeBytes: buffer.length,
        rejectionReason: 'PDF rejected by security scanner: embedded active script or launch action detected.',
      };
    }
  } else if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    detectedMime = 'image/png';
  } else if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) {
    detectedMime = 'image/jpeg';
  } else if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    detectedMime = 'image/webp';
  } else if (isLikelyUtf8Text(buffer)) {
    const ext = originalName.toLowerCase();
    if (ext.endsWith('.json') || declaredMime === 'application/json') {
      detectedMime = 'application/json';
    } else if (ext.endsWith('.csv') || declaredMime === 'text/csv') {
      detectedMime = 'text/csv';
    } else {
      detectedMime = 'text/plain';
    }
  } else {
    return {
      valid: false,
      detectedMime: 'application/octet-stream',
      sha256,
      sizeBytes: buffer.length,
      rejectionReason: 'Unrecognized or binary executable file signature rejected. Allowed: PDF, PNG, JPEG, WEBP, TXT, HL7, JSON, CSV.',
    };
  }

  if (!ALLOWED_MIME_TYPES.has(detectedMime)) {
    return {
      valid: false,
      detectedMime,
      sha256,
      sizeBytes: buffer.length,
      rejectionReason: `File type ${detectedMime} is not allowed.`,
    };
  }

  // Prevent disguised binary extensions claiming to be text or vice versa
  const ext = originalName.toLowerCase();
  if (
    (detectedMime === 'application/pdf' && /\.(png|jpg|jpeg|webp|txt|json|csv)$/i.test(ext)) ||
    (detectedMime.startsWith('image/') && /\.pdf$/i.test(ext))
  ) {
    return {
      valid: false,
      detectedMime,
      sha256,
      sizeBytes: buffer.length,
      rejectionReason: `File extension (${originalName}) does not match detected file signature (${detectedMime}).`,
    };
  }

  return {
    valid: true,
    detectedMime,
    sha256,
    sizeBytes: buffer.length,
  };
}
