import { useAuthStore } from '../store/authStore';

// Thin fetch wrapper used as an opt-in alternative to per-call fetch().
// Pulls the bearer token from the Zustand auth store at call time (so a
// fresh login is picked up without a page reload) and surfaces a typed
// ApiError on non-2xx so the caller can switch on status.
//
// Existing pages still use raw fetch — adopt this gradually. Designed to
// be drop-in: replace
//   const res = await fetch('/api/foo', { headers: { Authorization: \`Bearer ${token}\` } });
//   if (!res.ok) throw new Error(...);
//   const json = await res.json();
// with
//   const json = await api.get<typeof shape>('/foo');

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  // Pass false to skip the Authorization header for public endpoints.
  authenticated?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

async function request<T>(method: Method, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.authenticated !== false) {
    const token = useAuthStore.getState().token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    signal: opts.signal,
  });

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON response — leave parsed as raw text
  }

  if (!res.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string'
        ? parsed.error
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, parsed, message);
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, body, opts),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, body, opts),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, undefined, opts),
};
