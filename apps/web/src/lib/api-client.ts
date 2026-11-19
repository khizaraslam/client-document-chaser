export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
    public readonly details: unknown[] = [],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

const API_BASE =
  typeof window !== 'undefined'
    ? '/api/v1'
    : process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001/api/v1';

let refreshPromise: Promise<boolean> | null = null;

async function attemptSessionRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    const csrf = getCookieValue('cdc_csrf');
    const headers: Record<string, string> = {};
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }

    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers,
      credentials: 'include',
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { skipAuthRefresh?: boolean } = {},
): Promise<T> {
  const { skipAuthRefresh, headers, ...rest } = options;
  const method = (rest.method || 'GET').toUpperCase();
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const reqHeaders = new Headers(headers);
  if (
    rest.body &&
    !(rest.body instanceof FormData) &&
    !reqHeaders.has('Content-Type')
  ) {
    reqHeaders.set('Content-Type', 'application/json');
  }

  if (isMutating) {
    const csrf = getCookieValue('cdc_csrf');
    if (csrf) {
      reqHeaders.set('X-CSRF-Token', csrf);
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    method,
    headers: reqHeaders,
    credentials: 'include',
  });

  if (
    response.status === 401 &&
    !skipAuthRefresh &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/register') &&
    !path.startsWith('/auth/refresh')
  ) {
    const refreshed = await attemptSessionRefresh();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, skipAuthRefresh: true });
    }
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      payload?.errorCode || 'REQUEST_FAILED',
      payload?.message || `Request failed with status ${response.status}`,
      Array.isArray(payload?.details) ? payload.details : [],
    );
  }

  return payload as T;
}
