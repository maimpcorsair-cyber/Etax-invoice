import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { withRlsContext } from '../config/rls';

interface AuditLogInput {
  companyId: string;
  userId: string;
  role?: string;
  systemMode?: boolean;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  language: 'th' | 'en';
}

export async function auditLog(input: AuditLogInput): Promise<void> {
  try {
    await withRlsContext(prisma, {
      companyId: input.companyId,
      userId: input.userId,
      role: input.role ?? 'system',
      systemMode: input.systemMode ?? false,
    }, async (tx) => {
      await tx.auditLog.create({
        data: {
          companyId: input.companyId,
          userId: input.userId,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          details: input.details as Prisma.InputJsonValue,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          language: input.language,
        },
      });
    });
  } catch (err) {
    logger.error('Failed to write audit log', { error: err, input });
  }
}
