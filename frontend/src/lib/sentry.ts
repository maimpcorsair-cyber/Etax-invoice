import * as Sentry from '@sentry/react';

/**
 * Initialize Sentry for the frontend. No-op when VITE_SENTRY_DSN isn't set
 * (e.g. local dev without a Sentry project) so the build still works.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    // Errors at 100%, traces sampled conservatively (paid feature anyway).
    tracesSampleRate: 0,
    // Replay & performance are paid features — disabled by default.
    integrations: [],
    ignoreErrors: [
      // Common browser noise we can't fix
      'ResizeObserver loop completed with undelivered notifications',
      'ResizeObserver loop limit exceeded',
      // Network blips when user goes offline (not our bug)
      'NetworkError',
      'Failed to fetch',
      'Load failed',
    ],
  });
}

export { Sentry };
