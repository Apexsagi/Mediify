// In-memory session token store (avoids localStorage/sessionStorage for XSS resilience)
let activeBearerToken: string | null = null;

export function setSessionToken(token: string | null): void {
  activeBearerToken = token;
}

export function getSessionToken(): string | null {
  return activeBearerToken;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
    const errMsg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${resp.status})`;
    throw new ApiError(errMsg, resp.status);
  }

  return data as T;
}
