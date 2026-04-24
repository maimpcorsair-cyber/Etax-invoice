import { Router } from 'express';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';

export const systemRouter = Router();

systemRouter.use(requireRole('super_admin'));

systemRouter.get('/overview', async (_req, res) => {
  try {
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

    const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'active');
    const monthlyRecurringRevenue = activeSubscriptions.reduce((sum, subscription) => {
      if (subscription.plan === 'starter') return sum + 990;
      if (subscription.plan === 'business') return sum + 2490;
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
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch system overview' });
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
