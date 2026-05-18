import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import prisma from '../config/database';
import redis from '../config/redis';
import { logger } from '../config/logger';

/**
 * Deep health check — pings each external dependency and returns per-provider
 * status + latency. Results are cached for `CACHE_TTL_MS` to avoid hammering
 * upstream APIs when this endpoint is hit by a monitoring loop.
 *
 * Used by `/api/health/deep`. The shallow `/api/health` stays as a process-
 * level liveness probe (just "is the express app responding"); this is the
 * readiness probe that catches "Render says we're live but Gemini is down".
 */

export interface ProviderCheck {
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

export interface DeepHealthResult {
  status: 'ok' | 'degraded' | 'error';
  checkedAt: string;
  providers: Record<string, ProviderCheck>;
  /** Optional providers that returned `configured: false` — surfaced so an
   *  operator can see "Gemini is intentionally unset" vs "Gemini is broken". */
  notConfigured: string[];
}

const CACHE_TTL_MS = 60_000;
let cached: { at: number; result: DeepHealthResult } | null = null;

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; latencyMs: number; detail?: string; value?: T }> {
  const started = Date.now();
  try {
    const value = await fn();
    return { ok: true, latencyMs: Date.now() - started, value };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      detail: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }
}

async function checkPostgres(): Promise<ProviderCheck> {
  return timed(() => prisma.$queryRaw`SELECT 1`);
}

async function checkRedis(): Promise<ProviderCheck> {
  return timed(() => redis.ping());
}

async function checkOpenAI(): Promise<ProviderCheck | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  // /models is the cheapest authenticated GET on OpenAI — confirms key validity
  // without spending tokens. AbortController so a hung TLS handshake can't
  // wedge the whole health check.
  return timed(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    try {
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } finally { clearTimeout(timer); }
  });
}

async function checkGemini(): Promise<ProviderCheck | null> {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) return null;
  return timed(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } finally { clearTimeout(timer); }
  });
}

async function checkS3(): Promise<ProviderCheck | null> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket || !process.env.AWS_ACCESS_KEY_ID) return null;
  return timed(async () => {
    const client = new S3Client({
      region: process.env.S3_REGION ?? 'ap-southeast-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  });
}

async function checkLine(): Promise<ProviderCheck | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  return timed(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    try {
      // /v2/bot/info validates the channel token without sending any messages.
      const res = await fetch('https://api.line.me/v2/bot/info', {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } finally { clearTimeout(timer); }
  });
}

export async function runDeepHealthCheck(): Promise<DeepHealthResult> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.result;
  }

  // Run all checks in parallel — total latency = max(individual), not sum.
  const [pg, rds, oai, gem, s3, line] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkOpenAI(),
    checkGemini(),
    checkS3(),
    checkLine(),
  ]);

  const providers: Record<string, ProviderCheck> = {
    postgres: pg,
    redis: rds,
  };
  const notConfigured: string[] = [];
  if (oai) providers.openai = oai; else notConfigured.push('openai');
  if (gem) providers.gemini = gem; else notConfigured.push('gemini');
  if (s3) providers.s3 = s3; else notConfigured.push('s3');
  if (line) providers.line = line; else notConfigured.push('line');

  // Critical = postgres + redis. Their failure makes the app unusable.
  // Everything else degrades capability without taking the app down.
  const criticalFailed = !pg.ok || !rds.ok;
  const anyFailed = Object.values(providers).some((p) => !p.ok);
  const status: DeepHealthResult['status'] = criticalFailed ? 'error' : anyFailed ? 'degraded' : 'ok';

  if (status !== 'ok') {
    const failed = Object.entries(providers).filter(([, p]) => !p.ok).map(([n, p]) => `${n}:${p.detail ?? 'unknown'}`);
    logger.warn('[health/deep] provider failures', { status, failed });
  }

  const result: DeepHealthResult = {
    status,
    checkedAt: new Date().toISOString(),
    providers,
    notConfigured,
  };
  cached = { at: Date.now(), result };
  return result;
}
