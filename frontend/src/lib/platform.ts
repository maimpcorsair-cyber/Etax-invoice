export type AppPlane = 'app' | 'ops';
export type AppSurface = AppPlane | 'apex';
export type AuthHandoffUser = {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'accountant' | 'viewer';
  companyId: string;
  auth?: {
    hasPassword: boolean;
    hasGoogle: boolean;
  };
  company?: {
    nameTh: string;
    nameEn?: string | null;
    taxId: string;
  };
};

export type AuthHandoffPayload = {
  token: string;
  user: AuthHandoffUser;
};

const AUTH_HANDOFF_PARAM = 'authHandoff';

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function withPort(hostname: string, port: string, protocol: string) {
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
}

export function detectSurface(hostname = window.location.hostname, pathname = window.location.pathname): AppSurface {
  if (hostname.startsWith('ops.')) {
    return 'ops';
  }
  if (hostname.startsWith('app.')) {
    return 'app';
  }
  if (pathname === '/ops' || pathname.startsWith('/ops/')) {
    return 'ops';
  }
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    return 'app';
  }
  return 'apex';
}

export function detectPlane(hostname = window.location.hostname, pathname = window.location.pathname): AppPlane {
  return detectSurface(hostname, pathname) === 'ops' ? 'ops' : 'app';
}

function inferSiblingOrigin(plane: AppPlane) {
  const { hostname, port, protocol, origin } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return plane === 'ops'
      ? withPort('ops.localhost', port, protocol)
      : withPort('app.localhost', port, protocol);
  }

  if (hostname.startsWith('ops.')) {
    return plane === 'ops' ? origin : withPort(hostname.replace(/^ops\./, 'app.'), port, protocol);
  }

  if (hostname.startsWith('app.')) {
    return plane === 'app' ? origin : withPort(hostname.replace(/^app\./, 'ops.'), port, protocol);
  }

  return origin;
}

function inferApexOrigin() {
  const { hostname, port, protocol, origin } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1' || !hostname.includes('.')) {
    return withPort('localhost', port, protocol);
  }

  if (hostname.startsWith('ops.') || hostname.startsWith('app.')) {
    return withPort(hostname.replace(/^(ops|app)\./, ''), port, protocol);
  }

  return origin;
}

export function getPlaneOrigin(plane: AppPlane) {
  const configured = plane === 'ops' ? import.meta.env.VITE_OPS_ORIGIN : import.meta.env.VITE_APP_ORIGIN;
  if (configured) {
    return trimTrailingSlash(configured);
  }
  return trimTrailingSlash(inferSiblingOrigin(plane));
}

export function getApexOrigin() {
  const configured = import.meta.env.VITE_APEX_ORIGIN;
  if (configured) {
    return trimTrailingSlash(configured);
  }
  return trimTrailingSlash(inferApexOrigin());
}

export function getPlanePath(path: string, plane: AppPlane) {
  return `${getPlaneOrigin(plane)}${path.startsWith('/') ? path : `/${path}`}`;
}

function encodeAuthHandoff(payload: AuthHandoffPayload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary);
}

function decodeAuthHandoff(encoded: string) {
  const binary = window.atob(encoded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as AuthHandoffPayload;
}

export function buildPlaneUrl(path: string, plane: AppPlane, auth?: AuthHandoffPayload) {
  const url = new URL(getPlanePath(path, plane));

  if (auth) {
    url.searchParams.set(AUTH_HANDOFF_PARAM, encodeAuthHandoff(auth));
  }

  return url.toString();
}

export function readAuthHandoff(search = window.location.search) {
  const params = new URLSearchParams(search);
  const encoded = params.get(AUTH_HANDOFF_PARAM);

  if (!encoded) {
    return null;
  }

  try {
    return decodeAuthHandoff(encoded);
  } catch {
    return null;
  }
}

export function stripAuthHandoff(url = window.location.href) {
  const nextUrl = new URL(url);
  nextUrl.searchParams.delete(AUTH_HANDOFF_PARAM);

  const search = nextUrl.searchParams.toString();
  return `${nextUrl.pathname}${search ? `?${search}` : ''}${nextUrl.hash}`;
}
