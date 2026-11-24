// In-memory session token store (avoids localStorage/sessionStorage for XSS resilience)
let activeBearerToken: string | null = null;

export function setSessionToken(token: string | null): void {
  activeBearerToken = token;
}

export function getSessionToken(): string | null {
  return activeBearerToken;
}

export function getBearerHeaders(): HeadersInit {
  return activeBearerToken ? { Authorization: `Bearer ${activeBearerToken}` } : {};
}

export class ApiError extends Error {
  status: number;
  code?: string;
  missingVariables?: string[];

  constructor(message: string, status: number, code?: string, missingVariables?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.missingVariables = missingVariables;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (activeBearerToken) {
    headers.set('Authorization', `Bearer ${activeBearerToken}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const resp = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  const contentType = resp.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await resp.json() : await resp.text();

  if (!resp.ok) {
    const obj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
    const errMsg = obj && 'error' in obj ? String(obj.error) : `Request failed (${resp.status})`;
    const code = obj && 'code' in obj ? String(obj.code) : undefined;
    const missingVariables =
      obj && Array.isArray(obj.missingVariables)
        ? obj.missingVariables.map((v) => String(v))
        : undefined;
    throw new ApiError(errMsg, resp.status, code, missingVariables);
  }

  return data as T;
}

export async function fetchAuthenticatedBlobUrl(apiPath: string): Promise<{ blobUrl: string; mimeType: string }> {
  const resp = await fetch(`/api${apiPath}`, {
    headers: getBearerHeaders(),
  });
  if (!resp.ok) {
    throw new ApiError(`Failed to load protected document (${resp.status})`, resp.status);
  }
  const mimeType = resp.headers.get('content-type') || 'application/octet-stream';
  const blob = await resp.blob();
  return {
    blobUrl: URL.createObjectURL(blob),
    mimeType,
  };
}
