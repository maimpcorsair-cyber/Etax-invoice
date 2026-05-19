import winston from 'winston';
import { scrubString } from './sentryScrub';

// PII scrubber as a winston format. Every log line — message AND meta —
// runs through the same redaction rules as Sentry beforeSend so tax IDs,
// emails, phone numbers, and bearer tokens never reach console output or
// Render's log retention. Caller code can still log `{ taxId }` defensively
// for debug context; the format catches it before serialization.
const sanitiseInfo = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = scrubString(info.message);
  }
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp') continue;
    const value = (info as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      (info as Record<string, unknown>)[key] = scrubString(value);
    } else if (value && typeof value === 'object') {
      (info as Record<string, unknown>)[key] = sanitiseDeep(value);
    }
  }
  return info;
});

function sanitiseDeep(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(sanitiseDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitiseDeep(v);
    return out;
  }
  return value;
}

const transports: winston.transport[] = [
  new winston.transports.Console(),
];

if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  );
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    sanitiseInfo(),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level}]: ${message}${metaStr}`;
          }),
        ),
  ),
  transports,
});
