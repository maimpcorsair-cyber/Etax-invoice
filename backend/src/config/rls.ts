import { Prisma, PrismaClient } from '@prisma/client';
import type { AuthPayload } from '../middleware/auth';

export interface RlsContext {
  companyId?: string | null;
  userId?: string | null;
  role?: string | null;
  systemMode?: boolean;
}

export function tenantRlsContext(user: AuthPayload): RlsContext {
  return {
    companyId: user.companyId,
    userId: user.userId,
    role: user.role,
    systemMode: false,
  };
}

export function systemRlsContext(overrides: Omit<RlsContext, 'systemMode'> = {}): RlsContext {
  return {
    companyId: overrides.companyId ?? null,
    userId: overrides.userId ?? null,
    role: overrides.role ?? 'system',
    systemMode: true,
  };
}

function buildSessionStatements(ctx: RlsContext) {
  return [
    Prisma.sql`SELECT set_config('app.current_company_id', ${ctx.companyId ?? ''}, true)`,
    Prisma.sql`SELECT set_config('app.current_user_id', ${ctx.userId ?? ''}, true)`,
    Prisma.sql`SELECT set_config('app.current_role', ${ctx.role ?? ''}, true)`,
    Prisma.sql`SELECT set_config('app.system_mode', ${ctx.systemMode ? 'on' : 'off'}, true)`,
  ];
}

export async function applyRlsContext(tx: Prisma.TransactionClient, ctx: RlsContext) {
  for (const statement of buildSessionStatements(ctx)) {
    await tx.$executeRaw(statement);
  }
}

export async function withRlsContext<T>(
  prisma: PrismaClient,
  ctx: RlsContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  const timeout = parseInt(process.env.DB_TX_TIMEOUT ?? '60000', 10);
  return prisma.$transaction(async (tx) => {
    await applyRlsContext(tx, ctx);
    return fn(tx);
  }, {
    maxWait: 10_000,
    timeout,
  });
}

export async function withSystemRlsContext<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  overrides: Omit<RlsContext, 'systemMode'> = {},
) {
  return withRlsContext(prisma, systemRlsContext(overrides), fn);
}

/** Simple string hash to generate a consistent positive integer for PostgreSQL advisory lock key */
function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % 2147483647; // Keep within PostgreSQL int range
}

/**
 * Acquire an advisory lock for the duration of the transaction.
 * Uses pg_advisory_xact_lock which auto-releases at transaction end.
 *
 * companyId is hashed to create a consistent lock key per company.
 * This prevents race conditions when multiple concurrent requests try to generate
 * invoice numbers for the same company simultaneously.
 */
export async function withInvoiceLock<T>(
  prisma: PrismaClient,
  companyId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  const lockKey = hashStringToInt(companyId);
  return prisma.$transaction(async (tx) => {
    // pg_advisory_xact_lock auto-releases at commit/rollback
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
    return fn(tx);
  }, {
    maxWait: 5000,  // 5s max wait to acquire lock
    timeout: 60000,
  });
}
