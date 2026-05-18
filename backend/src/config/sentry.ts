import * as Sentry from '@sentry/node';
import { logger } from './logger';

let initialized = false;

/**
 * Initialize Sentry error tracking. Safe to call multiple times — only the
 * first call wires up the SDK. When SENTRY_DSN is not set (e.g. local dev
 * without a Sentry project), this is a no-op so the app still runs.
 *
 * Call once at the very top of the entrypoint (index.ts / worker.ts) BEFORE
 * importing anything that might throw at module-load time, so Sentry sees
 * those early errors too.
 */
export function initSentry(role: 'web' | 'worker'): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    logger.info('[Sentry] SENTRY_DSN not set — error tracking disabled');
    initialized = true;
    return;
  }
  try {
    Sentry.init({
      dsn,
      environment: (process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development').trim(),
      release: process.env.SENTRY_RELEASE?.trim(),
      // Sample rates conservative by default — performance traces and
      // session replay are paid features we don't need yet. Errors are
      // always captured at 100%.
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0'),
      // Sentry SDK v8+: ignore expected/noisy errors so the quota isn't
      // burned on benign noise.
      ignoreErrors: [
        // BullMQ retry exceptions that we deliberately throw to trigger
        // backoff are already logged.
        'Job has been retried',
        // LINE reply-token expired — happens organically when OCR takes
        // longer than 30s, we already show a friendly message to the user.
        /invalid_reply_token/i,
        /reply token expired/i,
      ],
      initialScope: {
        tags: {
          role,
          service: role === 'web' ? 'etax-invoice-api' : 'etax-invoice-worker',
        },
      },
    });
    logger.info('[Sentry] initialized', { role, environment: process.env.NODE_ENV });
  } catch (err) {
    logger.warn('[Sentry] init failed — continuing without error tracking', { err });
  }
  initialized = true;
}

/**
 * Capture an exception with optional context. Safe to call when Sentry isn't
 * configured (no-op). Use this from BullMQ worker.on('failed') handlers and
 * other places where we want to record an error WITHOUT throwing.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN?.trim()) return;
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // never let Sentry itself crash the app
  }
}

export { Sentry };
