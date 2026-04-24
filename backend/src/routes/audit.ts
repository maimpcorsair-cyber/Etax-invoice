import { Router } from 'express';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { resolveCompanyAccessPolicy } from '../services/accessPolicyService';

export const auditRouter = Router();

auditRouter.get('/', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!policy.canViewAuditLogs) {
      res.status(403).json({ error: 'Upgrade to Business or Enterprise to access audit logs' });
      return;
    }

    const { page = '1', limit = '50', action, userId } = req.query;
    const pageNumber = parseInt(page as string);
    const limitNumber = parseInt(limit as string);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Record<string, unknown> = { companyId: req.user!.companyId };
    if (action) where.action = { contains: action as string };
    if (userId) where.userId = userId;

    const { logs, total } = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [items, count] = await Promise.all([
        tx.auditLog.findMany({
          where,
          skip,
          take: limitNumber,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true, email: true } } },
        }),
        tx.auditLog.count({ where }),
      ]);
      return { logs: items, total: count };
    });

    res.json({
      data: logs.map((log) => ({
        id: log.id,
        companyId: log.companyId,
        userId: log.userId,
        userName: log.user.name || log.user.email,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        details: log.details,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        language: log.language,
        createdAt: log.createdAt,
      })),
      pagination: { page: pageNumber, limit: limitNumber, total },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});
