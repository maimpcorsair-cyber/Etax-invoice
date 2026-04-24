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
  return prisma.$transaction(async (tx) => {
    await applyRlsContext(tx, ctx);
    return fn(tx);
  }, {
    maxWait: 10_000,
    timeout: 60_000,
  });
}

export async function withSystemRlsContext<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  overrides: Omit<RlsContext, 'systemMode'> = {},
) {
  return withRlsContext(prisma, systemRlsContext(overrides), fn);
}
