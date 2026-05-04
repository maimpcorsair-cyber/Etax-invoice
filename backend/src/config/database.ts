import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const connectionLimit = parseInt(process.env.DB_POOL_SIZE ?? '20', 10);

  const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/etax_invoice');
  databaseUrl.searchParams.set('connection_limit', connectionLimit.toString());
  databaseUrl.searchParams.set('pool_timeout', '30');
  databaseUrl.searchParams.set('statement_timeout', '30000');

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl.toString(),
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });
}

export const prisma = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

prisma.$connect().then(() => logger.info('Database connected')).catch((e) => logger.error('Database connection failed', e));

export default prisma;
export { createPrismaClient };
