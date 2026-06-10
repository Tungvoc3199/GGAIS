import { auth } from './firebase';

declare global {
  interface Window {
    __lhpSecureFetchInstalled?: boolean;
  }
}

function isApiRequest(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
  } catch {
    return url.startsWith('/api/');
  }
}

export function isOfflineDemoMode(): boolean {
  return typeof window !== 'undefined'
    && window.localStorage.getItem('lhp_use_local_simulation') === 'true';
}

export async function getSecureApiHeaders(initial?: HeadersInit): Promise<Headers> {
  const headers = new Headers(initial);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!headers.has('Authorization') && auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Authorization') && isOfflineDemoMode()) {
    headers.set('x-demo-mode', 'true');
  }

  return headers;
}

export async function secureApiPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: await getSecureApiHeaders(),
    body: JSON.stringify(body)
  });

  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || `API lỗi HTTP ${response.status}`);
  }

  return payload as T;
}

export function installSecureApiFetchInterceptor(): void {
  if (typeof window === 'undefined' || window.__lhpSecureFetchInstalled) {
    return;
  }

  window.__lhpSecureFetchInstalled = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (!isApiRequest(input)) {
      return nativeFetch(input, init);
    }

    const requestHeaders = input instanceof Request ? input.headers : undefined;
    const mergedHeaders = new Headers(requestHeaders);
    new Headers(init.headers).forEach((value, key) => mergedHeaders.set(key, value));

    return nativeFetch(input, {
      ...init,
      headers: await getSecureApiHeaders(mergedHeaders)
    });
  };
}
