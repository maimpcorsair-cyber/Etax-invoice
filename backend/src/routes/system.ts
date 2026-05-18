import { Router } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';

export const systemRouter = Router();

systemRouter.use(requireRole('super_admin'));

function issueTenantToken(user: { id: string; companyId: string; role: string; email: string }) {
  return jwt.sign(
    { userId: user.id, companyId: user.companyId, role: user.role, email: user.email },
    process.env.JWT_SECRET!,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as any },
  );
}

function serializeTenantUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  companyId: string;
  passwordHash?: string | null;
  googleSub?: string | null;
  company: {
    nameTh: string;
    nameEn: string | null;
    taxId: string;
  };
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    auth: {
      hasPassword: !!user.passwordHash,
      hasGoogle: !!user.googleSub,
    },
    company: {
      nameTh: user.company.nameTh,
      nameEn: user.company.nameEn,
      taxId: user.company.taxId,
    },
  };
}

systemRouter.get('/overview', async (_req, res) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      companyCount,
      userCount,
      customerCount,
      invoiceCount,
      companies,
      subscriptions,
      transactions,
      coupons,
      pendingSignups,
      intakesLast24h,
      activeUsersLast7d,
      intakeByCompanyLast7d,
    ] = await Promise.all([
      prisma.company.count(),
      withSystemRlsContext(prisma, (tx) => tx.user.count()),
      withSystemRlsContext(prisma, (tx) => tx.customer.count()),
      withSystemRlsContext(prisma, (tx) => tx.invoice.count()),
      withSystemRlsContext(prisma, (tx) => tx.company.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          nameTh: true,
          taxId: true,
          users: {
            select: { id: true, role: true },
          },
          _count: {
            select: {
              customers: true,
              invoices: true,
              products: true,
            },
          },
        },
      })),
      withSystemRlsContext(prisma, (tx) => tx.companySubscription.findMany()),
      withSystemRlsContext(prisma, (tx) => tx.billingTransaction.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          pendingSignup: {
            select: {
              companyNameTh: true,
              adminEmail: true,
              paymentMethod: true,
            },
          },
        },
      })),
      withSystemRlsContext(prisma, (tx) => tx.coupon.findMany({
        orderBy: { updatedAt: 'desc' },
      })),
      withSystemRlsContext(prisma, (tx) => tx.pendingSignup.findMany({
        orderBy: { createdAt: 'desc' },
      })),
      // Operational metrics for the owner dashboard
      withSystemRlsContext(prisma, (tx) => tx.documentIntake.groupBy({
        by: ['status', 'source'],
        where: { createdAt: { gte: dayAgo } },
        _count: { _all: true },
      })),
      withSystemRlsContext(prisma, (tx) => tx.user.count({
        where: { lastLoginAt: { gte: weekAgo } },
      })),
      withSystemRlsContext(prisma, (tx) => tx.documentIntake.groupBy({
        by: ['companyId'],
        where: { createdAt: { gte: weekAgo } },
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      })),
    ]);

    const companyDetails = await Promise.all(
      companies.map(async (company) => {
        const totals = await withSystemRlsContext(prisma, (tx) => tx.invoice.aggregate({
          where: {
            companyId: company.id,
            status: { not: 'cancelled' },
          },
          _sum: { total: true },
        }));

        const latestInvoice = await withSystemRlsContext(prisma, (tx) => tx.invoice.findFirst({
          where: { companyId: company.id },
          orderBy: { invoiceDate: 'desc' },
          select: {
            invoiceNumber: true,
            invoiceDate: true,
            total: true,
            status: true,
          },
        }));

        return {
          id: company.id,
          nameTh: company.nameTh,
          taxId: company.taxId,
          customerCount: company._count.customers,
          invoiceCount: company._count.invoices,
          productCount: company._count.products,
          userCount: company.users.length,
          adminCount: company.users.filter((user) => ['admin', 'super_admin'].includes(user.role)).length,
          totalRevenue: totals._sum.total ?? 0,
          latestInvoice,
        };
      }),
    );

    // Roll up intake stats: total + per-status + per-source for last 24h.
    // Failure rate = (failed + error) / total — surfaces "OCR is silently
    // breaking" before users complain on LINE.
    const intakeStats24h = intakesLast24h.reduce(
      (acc, row) => {
        const c = row._count._all;
        acc.total += c;
        acc.byStatus[row.status] = (acc.byStatus[row.status] ?? 0) + c;
        acc.bySource[row.source] = (acc.bySource[row.source] ?? 0) + c;
        return acc;
      },
      { total: 0, byStatus: {} as Record<string, number>, bySource: {} as Record<string, number> },
    );
    const failedCount = (intakeStats24h.byStatus.failed ?? 0) + (intakeStats24h.byStatus.error ?? 0);
    const intakeFailureRate24h = intakeStats24h.total > 0 ? failedCount / intakeStats24h.total : 0;

    // Map top-10 intake counts to company name + tax ID for the table.
    const topIntakeCompanyIds = intakeByCompanyLast7d.map((row) => row.companyId);
    const topIntakeCompanies = topIntakeCompanyIds.length > 0
      ? await withSystemRlsContext(prisma, (tx) => tx.company.findMany({
          where: { id: { in: topIntakeCompanyIds } },
          select: { id: true, nameTh: true, taxId: true },
        }))
      : [];
    const topIntakeCompanyMap = new Map(topIntakeCompanies.map((c) => [c.id, c]));
    const topIntakeUsage = intakeByCompanyLast7d.map((row) => ({
      companyId: row.companyId,
      nameTh: topIntakeCompanyMap.get(row.companyId)?.nameTh ?? '(unknown)',
      taxId: topIntakeCompanyMap.get(row.companyId)?.taxId ?? '',
      intakeCount: row._count._all,
    }));

    const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'active');
    const monthlyRecurringRevenue = activeSubscriptions.reduce((sum, subscription) => {
      if (subscription.plan === 'starter') return sum + 790;
      if (subscription.plan === 'business') return sum + 1990;
      return sum;
    }, 0);
    const paidTransactions = transactions.filter((transaction) => ['paid', 'activated'].includes(transaction.status));
    const totalCollected = paidTransactions.reduce((sum, transaction) => sum + transaction.totalAmount, 0);
    const paymentChannelSummary = transactions.reduce<Record<string, { count: number; amount: number }>>((acc, transaction) => {
      const current = acc[transaction.channel] ?? { count: 0, amount: 0 };
      current.count += 1;
      current.amount += transaction.totalAmount;
      acc[transaction.channel] = current;
      return acc;
    }, {});
    const planSummary = subscriptions.reduce<Record<string, number>>((acc, subscription) => {
      acc[subscription.plan] = (acc[subscription.plan] ?? 0) + 1;
      return acc;
    }, {});
    const expiringSubscriptions = subscriptions
      .filter((subscription) => subscription.currentPeriodEnd)
      .sort((left, right) => (left.currentPeriodEnd?.getTime() ?? 0) - (right.currentPeriodEnd?.getTime() ?? 0))
      .slice(0, 12)
      .map((subscription) => ({
        id: subscription.id,
        companyId: subscription.companyId,
        plan: subscription.plan,
        status: subscription.status,
        billingInterval: subscription.billingInterval,
        currentPeriodEnd: subscription.currentPeriodEnd,
        stripeCustomerId: subscription.stripeCustomerId,
      }));

    res.json({
      data: {
        companyCount,
        userCount,
        customerCount,
        invoiceCount,
        activeSubscriptionCount: activeSubscriptions.length,
        monthlyRecurringRevenue,
        annualRecurringRevenue: monthlyRecurringRevenue * 12,
        totalCollected,
        pendingSignupCount: pendingSignups.filter((signup) => ['pending', 'paid'].includes(signup.status)).length,
        pendingPromptPayCount: transactions.filter((transaction) => transaction.channel === 'promptpay_qr' && transaction.status === 'awaiting_payment').length,
        couponCount: coupons.length,
        activeCouponCount: coupons.filter((coupon) => coupon.active).length,
        planSummary,
        expiringSubscriptions,
        paymentChannels: Object.entries(paymentChannelSummary).map(([channel, value]) => ({
          channel,
          count: value.count,
          amount: Number(value.amount.toFixed(2)),
        })),
        recentTransactions: transactions.slice(0, 12).map((transaction) => ({
          id: transaction.id,
          channel: transaction.channel,
          status: transaction.status,
          totalAmount: transaction.totalAmount,
          couponCode: transaction.couponCode,
          externalReference: transaction.externalReference,
          createdAt: transaction.createdAt,
          pendingSignup: transaction.pendingSignup,
        })),
        recentSignups: pendingSignups.slice(0, 12).map((signup) => ({
          id: signup.id,
          companyNameTh: signup.companyNameTh,
          adminEmail: signup.adminEmail,
          plan: signup.plan,
          status: signup.status,
          paymentMethod: signup.paymentMethod,
          totalAmount: signup.totalAmount,
          createdAt: signup.createdAt,
        })),
        coupons: coupons.slice(0, 12).map((coupon) => ({
          id: coupon.id,
          code: coupon.code,
          name: coupon.name,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          redeemedCount: coupon.redeemedCount,
          maxRedemptions: coupon.maxRedemptions,
          active: coupon.active,
        })),
        companies: companyDetails,
        operational: {
          intakeLast24h: {
            total: intakeStats24h.total,
            byStatus: intakeStats24h.byStatus,
            bySource: intakeStats24h.bySource,
            failureRate: Number(intakeFailureRate24h.toFixed(4)),
          },
          activeUsersLast7d,
          topIntakeUsageLast7d: topIntakeUsage,
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch system overview',
      detail: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    });
  }
});

// Per-company drill-down for the Owner Plane. Returns enough detail to
// answer "what is going on with this tenant?" without needing to log in as
// them. Reads through withSystemRlsContext so RLS is bypassed for the
// super_admin scope (the requireRole guard on the router enforces that).
systemRouter.get('/companies/:id', async (req, res) => {
  const companyId = req.params.id;
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const company = await prisma.company.findFirst({
      where: { id: companyId },
      select: {
        id: true, nameTh: true, nameEn: true, taxId: true, branchCode: true,
        phone: true, email: true, createdAt: true,
      },
    });
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    const [
      users,
      subscription,
      invoiceStats,
      invoiceByStatus,
      latestInvoice,
      intakesByStatus,
      intakesByDay,
      recentTransactions,
      certificateInfo,
    ] = await Promise.all([
      withSystemRlsContext(prisma, (tx) => tx.user.findMany({
        where: { companyId },
        select: {
          id: true, email: true, name: true, role: true,
          lastLoginAt: true, isActive: true, createdAt: true,
        },
        orderBy: { lastLoginAt: 'desc' },
      })),
      withSystemRlsContext(prisma, (tx) => tx.companySubscription.findFirst({
        where: { companyId },
      })),
      withSystemRlsContext(prisma, (tx) => tx.invoice.aggregate({
        where: { companyId, status: { not: 'cancelled' } },
        _sum: { total: true },
        _count: { _all: true },
      })),
      withSystemRlsContext(prisma, (tx) => tx.invoice.groupBy({
        by: ['status'],
        where: { companyId },
        _count: { _all: true },
      })),
      withSystemRlsContext(prisma, (tx) => tx.invoice.findFirst({
        where: { companyId },
        orderBy: { invoiceDate: 'desc' },
        select: { invoiceNumber: true, invoiceDate: true, total: true, status: true },
      })),
      withSystemRlsContext(prisma, (tx) => tx.documentIntake.groupBy({
        by: ['status'],
        where: { companyId, createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      })),
      withSystemRlsContext(prisma, (tx) => tx.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "document_intakes"
        WHERE "companyId" = ${companyId} AND "createdAt" >= ${thirtyDaysAgo}
        GROUP BY 1 ORDER BY 1 ASC
      `),
      withSystemRlsContext(prisma, (tx) => tx.billingTransaction.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true, channel: true, status: true, totalAmount: true,
          couponCode: true, externalReference: true, createdAt: true,
        },
      })),
      // Cert is encrypted at rest; just surface presence + filename hash so the
      // owner sees "uploaded vs dev cert" without exposing key material.
      prisma.company.findFirst({
        where: { id: companyId },
        select: { certificatePath: true },
      }),
    ]);

    res.json({
      data: {
        company,
        users: users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        })),
        subscription: subscription ? {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          billingInterval: subscription.billingInterval,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          stripeCustomerId: subscription.stripeCustomerId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
        } : null,
        invoices: {
          totalRevenue: invoiceStats._sum.total ?? 0,
          totalCount: invoiceStats._count._all,
          byStatus: invoiceByStatus.reduce<Record<string, number>>((acc, row) => {
            acc[row.status] = row._count._all;
            return acc;
          }, {}),
          latest: latestInvoice ? {
            ...latestInvoice,
            invoiceDate: latestInvoice.invoiceDate.toISOString(),
          } : null,
        },
        intakes30d: {
          byStatus: intakesByStatus.reduce<Record<string, number>>((acc, row) => {
            acc[row.status] = row._count._all;
            return acc;
          }, {}),
          byDay: intakesByDay.map((row) => ({
            day: row.day.toISOString().slice(0, 10),
            count: Number(row.count),
          })),
        },
        recentTransactions: recentTransactions.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
        })),
        certificate: {
          configured: !!certificateInfo?.certificatePath,
          isDev: certificateInfo?.certificatePath?.includes('test-company.p12') ?? false,
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch company detail',
      detail: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    });
  }
});

// Magic-link audit log query for the Owner Plane. Filterable by company,
// intake, lineUserId, mutation-only. Paginated 50 rows at a time.
systemRouter.get('/audit/intake-access', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const filters: Record<string, unknown> = {};
    if (typeof req.query.companyId === 'string') filters.companyId = req.query.companyId;
    if (typeof req.query.intakeId === 'string') filters.intakeId = req.query.intakeId;
    if (typeof req.query.lineUserId === 'string') filters.lineUserId = req.query.lineUserId;
    if (req.query.mutationsOnly === '1') filters.isMutation = true;

    const rows = await withSystemRlsContext(prisma, (tx) => tx.intakeAccessLog.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }));
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }));

    // 24h summary alongside the page for quick "what's happening" read.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total24h, mutations24h, uniqueIntakes24h] = await Promise.all([
      withSystemRlsContext(prisma, (tx) => tx.intakeAccessLog.count({
        where: { ...filters, createdAt: { gte: dayAgo } },
      })),
      withSystemRlsContext(prisma, (tx) => tx.intakeAccessLog.count({
        where: { ...filters, isMutation: true, createdAt: { gte: dayAgo } },
      })),
      withSystemRlsContext(prisma, (tx) => tx.intakeAccessLog.groupBy({
        by: ['intakeId'],
        where: { ...filters, createdAt: { gte: dayAgo } },
      })),
    ]);

    res.json({
      data: {
        items,
        nextCursor: hasMore ? items[items.length - 1]?.id : null,
        summary24h: {
          total: total24h,
          mutations: mutations24h,
          uniqueIntakes: uniqueIntakes24h.length,
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch audit log',
      detail: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    });
  }
});

systemRouter.get('/session', (req, res) => {
  res.json({
    data: {
      mode: 'owner',
      role: req.user!.role,
      userId: req.user!.userId,
      companyId: req.user!.companyId,
    },
  });
});

systemRouter.post('/tenants/:companyId/switch', async (req, res) => {
  try {
    const company = await withSystemRlsContext(prisma, (tx) => tx.company.findUnique({
      where: { id: req.params.companyId },
      select: { id: true },
    }), { role: req.user!.role, userId: req.user!.userId });

    if (!company) {
      res.status(404).json({ error: 'Tenant company not found' });
      return;
    }

    const tenantUser = await withSystemRlsContext(prisma, (tx) => tx.user.findFirst({
      where: {
        companyId: company.id,
        isActive: true,
        role: { in: ['admin', 'accountant', 'viewer'] },
      },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' },
      ],
      include: { company: true },
    }), { role: req.user!.role, userId: req.user!.userId });

    if (!tenantUser) {
      res.status(404).json({ error: 'This tenant has no active non-owner user to switch into' });
      return;
    }

    res.json({
      data: {
        token: issueTenantToken(tenantUser),
        user: serializeTenantUser(tenantUser),
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to switch tenant session' });
  }
});
