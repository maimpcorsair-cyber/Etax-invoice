import { Worker, Job, Queue } from 'bullmq';
import redis from '../../config/redis';
import prisma from '../../config/database';
import { withSystemRlsContext } from '../../config/rls';
import { logger } from '../../config/logger';
import { exportCompanyWorkspaceToSheets, isSheetsConfigured, linkCell } from '../../services/googleSheetsService';

const QUEUE_NAME = 'master-sheet-sync';
const SYNC_DELAY_MS = 60_000; // 1 minute debounce

export const masterSheetQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 10 },
  },
});

/**
 * Queue a master sheet sync for a company. Default is debounced by 1 minute
 * (used for write-driven syncs — many invoice/expense changes coalesce into
 * one rebuild). Pass `immediate: true` for user-initiated "sync now" clicks
 * where the user is actively waiting on the result.
 *
 * Uses BullMQ jobId dedup — only one job per company can be queued at a time.
 */
export async function enqueueMasterSheetSync(
  companyId: string,
  options: { immediate?: boolean } = {},
): Promise<void> {
  if (!isSheetsConfigured()) return;
  try {
    await masterSheetQueue.add(
      'sync',
      { companyId },
      {
        jobId: `master-sheet-${companyId}`,
        delay: options.immediate ? 0 : SYNC_DELAY_MS,
      },
    );
  } catch (err) {
    logger.warn('[masterSheet] Failed to enqueue sync', { error: err, companyId });
  }
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

function vatLabel(vatType: string) {
  if (vatType === 'vat7') return 'VAT 7%';
  if (vatType === 'vatZero') return 'VAT 0%';
  return 'ยกเว้น VAT';
}

function taxStatusLabel(vatType: string) {
  if (vatType === 'vat7') return 'ขอคืนภาษีซื้อได้';
  if (vatType === 'vatZero') return 'VAT 0%';
  return 'ไม่มี VAT';
}

async function buildWorkspaceData(companyId: string) {
  const [company, currentUser, products, purchaseInvoices, invoices, expenses, customers, projects, documentIntakes] = await Promise.all([
    withSystemRlsContext(prisma, (tx) => tx.company.findFirst({
      where: { id: companyId },
      select: {
        nameTh: true,
        nameEn: true,
        googleWorkspaceSheetId: true,
        googleDriveOwnerUserId: true,
      },
    })),
    // Get Drive owner token for sharing
    prisma.company.findFirst({
      where: { id: companyId },
      select: { googleDriveOwnerUserId: true },
    }).then(async (c) => {
      if (!c?.googleDriveOwnerUserId) return null;
      return withSystemRlsContext(prisma, (tx) => tx.user.findFirst({
        where: { id: c.googleDriveOwnerUserId! },
        select: { email: true, googleRefreshToken: true },
      }));
    }),
    withSystemRlsContext(prisma, (tx) => tx.product.findMany({
      where: { companyId },
      orderBy: [{ isActive: 'desc' }, { nameTh: 'asc' }],
      take: 5000,
    })),
    withSystemRlsContext(prisma, (tx) => tx.purchaseInvoice.findMany({
      where: { companyId },
      include: { project: { select: { code: true, name: true } } },
      orderBy: { invoiceDate: 'desc' },
      take: 5000,
    })),
    withSystemRlsContext(prisma, (tx) => tx.invoice.findMany({
      where: { companyId, status: { in: ['approved', 'submitted', 'pending'] } },
      include: {
        project: { select: { code: true, name: true } },
        buyer: { select: { nameTh: true, nameEn: true } },
      },
      orderBy: { invoiceDate: 'desc' },
      take: 5000,
    })),
    withSystemRlsContext(prisma, (tx) => tx.expenseVoucher.findMany({
      where: { companyId },
      include: {
        items: true,
        project: { select: { code: true, name: true } },
      },
      orderBy: { voucherDate: 'desc' },
      take: 2000,
    })),
    withSystemRlsContext(prisma, (tx) => tx.customer.findMany({
      where: { companyId, isActive: true },
      include: { documents: { select: { documentType: true, status: true, s3Url: true, driveUrl: true, driveFolderUrl: true } } },
      take: 2000,
    })),
    // Projects feed the "สรุปโปรเจค" rollup tab — every active or recently
    // completed project gets a per-project revenue/cost/balance row.
    withSystemRlsContext(prisma, (tx) => tx.project.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        invoices: { select: { total: true, status: true, vatAmount: true } },
        purchaseInvoices: { select: { total: true } },
        expenseVouchers: { select: { totalAmount: true, status: true } },
      },
    })),
    // Recent document intakes power the AI Inbox tab — only show items
    // still needing action, not the already-saved ones.
    withSystemRlsContext(prisma, (tx) => tx.documentIntake.findMany({
      where: {
        companyId,
        status: { in: ['received', 'processing', 'awaiting_input', 'awaiting_confirmation', 'needs_review', 'failed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { project: { select: { code: true, name: true } } },
    })),
  ]);

  if (!company) return null;

  const companyName = company.nameTh || company.nameEn || 'Billboy';

  const productsTab = products.map((p) => ({
    code: p.code,
    nameTh: p.nameTh,
    nameEn: p.nameEn ?? '',
    type: p.productType,
    category: p.category ?? '',
    unit: p.unit,
    unitPrice: p.unitPrice,
    vat: vatLabel(p.vatType),
    unitCost: p.unitCost ?? '',
    grossMargin: p.unitCost !== null && p.unitPrice > 0
      ? `${Math.round(((p.unitPrice - p.unitCost) / p.unitPrice) * 100)}%` : '',
    accountCode: p.accountCode ?? '',
    defaultWhtRate: p.defaultWhtRate ? `${p.defaultWhtRate}%` : '',
    status: p.isActive ? 'ใช้งาน' : 'ปิดใช้งาน',
    updatedAt: formatDate(p.updatedAt),
  }));

  // attachmentLink is the column the new sheetDefs read — it's the clickable
  // HYPERLINK formula. Falls back through s3Url (system of record), driveUrl
  // (mirror), then pdfUrl (legacy field still used for sales PDFs).
  const inputVatTab = purchaseInvoices.map((pi) => ({
    date: formatDate(pi.invoiceDate),
    supplier: pi.supplierName,
    documentNo: pi.invoiceNumber ?? '',
    project: pi.project ? `${pi.project.code} ${pi.project.name}` : '',
    category: pi.category ?? '',
    subtotal: pi.subtotal,
    vat: pi.vatAmount,
    total: pi.total,
    taxStatus: taxStatusLabel(pi.vatType),
    attachmentLink: linkCell(pi.pdfUrl),
  }));

  const outputVatTab = invoices.map((inv) => {
    const buyer = inv.buyer?.nameTh || inv.buyer?.nameEn || '';
    const url = (inv as { driveUrl?: string | null }).driveUrl ?? inv.pdfUrl ?? '';
    return {
      date: formatDate(inv.invoiceDate),
      buyer,
      documentNo: inv.invoiceNumber,
      project: inv.project ? `${inv.project.code} ${inv.project.name}` : '',
      status: inv.status,
      subtotal: inv.subtotal,
      vat: inv.vatAmount,
      total: inv.total,
      attachmentLink: linkCell(url),
    };
  });

  const expensesTab = expenses.map((ev) => ({
    date: formatDate(ev.voucherDate),
    voucherNo: ev.voucherNumber,
    project: ev.project ? `${ev.project.code} ${ev.project.name}` : '',
    category: ev.items.map((i) => i.category).filter(Boolean).join(', '),
    description: ev.items.map((i) => i.description).join(', ').slice(0, 200),
    amount: Number(ev.totalAmount),
    status: ev.status,
    attachmentLink: '', // populated when expense attachments are wired through worker query
  }));

  // Split customers vs vendors so each tab is scoped to its mental model.
  // `both` shows up in both (it really is both per Prisma's `partyRole` enum).
  const buildDirectoryRow = (c: typeof customers[number]) => {
    const doc = c.documents[0] ?? null;
    const url = doc?.s3Url ?? doc?.driveUrl ?? null;
    return {
      name: c.nameTh || c.nameEn || '',
      taxId: c.taxId ?? '',
      useCase: c.useCase ?? '',
      documentType: doc?.documentType ?? '',
      status: doc?.status ?? '',
      readiness: c.verificationStatus ?? '',
      attachmentLink: linkCell(url),
      folderLink: linkCell(doc?.driveFolderUrl),
    };
  };
  const customersTab = customers
    .filter((c) => c.partyRole === 'customer' || c.partyRole === 'both')
    .map(buildDirectoryRow);
  const vendorsTab = customers
    .filter((c) => c.partyRole === 'supplier' || c.partyRole === 'both')
    .map(buildDirectoryRow);

  // Project rollup — per-project revenue, cost, balance, forecast. Replaces
  // the previously hardcoded empty array. Mirror of the dashboard's logic
  // so master + dashboard report the same numbers.
  const projectSummaryTab = projects.map((p) => {
    const revenue = p.invoices
      .filter((i) => i.status !== 'cancelled' && i.status !== 'rejected')
      .reduce((sum, i) => sum + (i.total ?? 0), 0);
    const purchaseCost = p.purchaseInvoices.reduce((sum, pi) => sum + (pi.total ?? 0), 0);
    const expenseCost = p.expenseVouchers
      .filter((ev) => ev.status !== 'rejected')
      .reduce((sum, ev) => sum + Number(ev.totalAmount ?? 0), 0);
    const actual = purchaseCost + expenseCost;
    const budget = Number((p as { budget?: unknown }).budget ?? 0);
    return {
      project: `${p.code} ${p.name}`,
      status: p.status,
      budget,
      revenue,
      actual,
      balance: budget - actual,
      forecastProfit: revenue - actual,
      files: '',
      folderLink: '',
    };
  });

  // AI Inbox — recent intakes still needing human action. Distinct from the
  // saved-and-done intakes that already appear in ขาย/ซื้อ.
  const aiInboxTab = documentIntakes.map((di) => ({
    date: formatDate(di.createdAt),
    fileName: di.fileName ?? '',
    project: di.project ? `${di.project.code} ${di.project.name}` : '',
    source: di.source ?? '',
    status: di.status,
    issue: di.error ?? '',
    attachmentLink: linkCell(di.fileUrl),
  }));

  return {
    companyName,
    existingSheetId: company.googleWorkspaceSheetId,
    userRefreshToken: currentUser?.googleRefreshToken ?? null,
    sharedWithEmails: [currentUser?.email],
    tabs: {
      products: productsTab,
      inputVat: inputVatTab,
      outputVat: outputVatTab,
      expenses: expensesTab,
      customers: customersTab,
      vendors: vendorsTab,
      missingDocs: aiInboxTab,
      projectSummary: projectSummaryTab,
    },
  };
}

export const masterSheetWorker = new Worker<{ companyId: string }>(
  QUEUE_NAME,
  async (job: Job<{ companyId: string }>) => {
    const { companyId } = job.data;
    logger.info('[masterSheet] Syncing company workspace sheet', { companyId });

    const workspaceData = await buildWorkspaceData(companyId);
    if (!workspaceData) {
      logger.warn('[masterSheet] Company not found', { companyId });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const result = await exportCompanyWorkspaceToSheets({
      period: today,
      ...workspaceData,
    });

    await withSystemRlsContext(prisma, (tx) => tx.company.update({
      where: { id: companyId },
      data: {
        googleWorkspaceSheetId: result.sheetId,
        googleWorkspaceSheetUrl: result.url,
        googleWorkspaceSheetSyncedAt: new Date(),
      },
    }));

    logger.info('[masterSheet] Sync complete', { companyId, url: result.url });
    return { url: result.url };
  },
  { connection: redis, concurrency: 2 },
);

masterSheetWorker.on('failed', (job, err) => {
  logger.error(`[masterSheet] Job ${job?.id} failed`, { error: err.message, companyId: job?.data?.companyId });
});
