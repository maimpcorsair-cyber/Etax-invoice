import * as Sentry from '@sentry/react';
import { scrubSentryEvent } from './sentryScrub';

/**
 * Initialize Sentry for the frontend. No-op when VITE_SENTRY_DSN isn't set
 * (e.g. local dev without a Sentry project) so the build still works.
 */
export function initSentry(): void {
  // Trim DSN — Vercel/Render env-var textareas often paste a trailing
  // newline that breaks Sentry's DSN regex validation (it returns init()
  // silently, so window.__SENTRY__ shows {version} only, no hub). Trim
  // every string env var defensively for the same reason.
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
  if (!dsn) return;
  const environment = ((import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined)?.trim()) || import.meta.env.MODE;
  Sentry.init({
    dsn,
    environment,
    release: (import.meta.env.VITE_SENTRY_RELEASE as string | undefined)?.trim(),
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
    // PII scrubber — strip tax IDs, emails, phones, bearer tokens out of
    // every event before it ships. Privacy Policy commits to this; without
    // it, an unhandled exception's message could carry the exact PII we
    // promised never to send to monitoring.
    beforeSend: (event) => scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
    beforeBreadcrumb: (breadcrumb) => scrubSentryEvent(breadcrumb as unknown as Record<string, unknown>) as unknown as typeof breadcrumb,
  });
}

export { Sentry };
