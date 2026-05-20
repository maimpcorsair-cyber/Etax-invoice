import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { withRlsContext, tenantRlsContext, systemRlsContext, type RlsContext } from '../config/rls';

// req.txn / req.systemTxn — opt-in helpers that wrap withRlsContext so
// route handlers don't have to thread prisma + tenantRlsContext(req.user!)
// through every call. The original withRlsContext export stays in
// config/rls.ts for workers and non-Express callers.
//
// Usage in a route handler:
//   const rows = await req.txn((tx) => tx.invoice.findMany({...}));
// vs the older inline form:
//   const rows = await withRlsContext(prisma, tenantRlsContext(req.user!),
//     (tx) => tx.invoice.findMany({...}));
//
// req.txn requires authenticate to have set req.user; calling it without
// auth throws a 500-friendly error rather than silently widening scope.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      txn?: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
      systemTxn?: <T>(
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
        overrides?: Omit<RlsContext, 'systemMode'>,
      ) => Promise<T>;
    }
  }
}

export function attachRlsTxn(req: Request, _res: Response, next: NextFunction): void {
  req.txn = async (fn) => {
    if (!req.user) {
      throw new Error('req.txn requires authenticate middleware to have set req.user');
    }
    return withRlsContext(prisma, tenantRlsContext(req.user), fn);
  };

  req.systemTxn = async (fn, overrides = {}) => {
    return withRlsContext(prisma, systemRlsContext(overrides), fn);
  };

  next();
}
