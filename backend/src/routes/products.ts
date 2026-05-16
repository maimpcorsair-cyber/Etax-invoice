import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import {
  getLimitErrorMessage,
  getUsageLimit,
  getUsageValue,
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from '../services/accessPolicyService';
import { exportCompanyWorkspaceToSheets } from '../services/googleSheetsService';

export const productsRouter = Router();

const productSchema = z.object({
  code: z.string().trim().min(1),
  nameTh: z.string().trim().min(1),
  nameEn: z.string().trim().optional().nullable(),
  descriptionTh: z.string().trim().optional().nullable(),
  descriptionEn: z.string().trim().optional().nullable(),
  unit: z.string().trim().min(1),
  unitPrice: z.number().min(0),
  vatType: z.enum(['vat7', 'vatExempt', 'vatZero']),
  productType: z.enum(['product', 'service', 'fee', 'shipping', 'discount', 'deposit']).default('product'),
  category: z.string().trim().optional().nullable(),
  accountCode: z.string().trim().optional().nullable(),
  unitCost: z.number().min(0).optional().nullable(),
  defaultWhtRate: z.enum(['1', '3', '5']).optional().nullable(),
  internalNote: z.string().trim().optional().nullable(),
});

function productTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    product: 'สินค้า',
    service: 'บริการ',
    shipping: 'ค่าขนส่ง',
    fee: 'ค่าธรรมเนียม',
    deposit: 'มัดจำ',
    discount: 'ส่วนลด',
  };
  return labels[type ?? ''] ?? 'สินค้า';
}

function vatLabel(type?: string | null) {
  if (type === 'vat7') return 'VAT 7%';
  if (type === 'vatZero') return 'VAT 0%';
  if (type === 'vatExempt') return 'ยกเว้น VAT';
  return type ?? '';
}

function productSheetRows(products: Array<{
  id: string;
  code: string;
  nameTh: string;
  nameEn: string | null;
  productType: string;
  category: string | null;
  unit: string;
  unitPrice: number;
  vatType: string;
  unitCost: number | null;
  accountCode: string | null;
  defaultWhtRate: string | null;
  isActive: boolean;
  updatedAt: Date;
}>) {
  return products.map((product) => {
    const unitCost = product.unitCost ?? 0;
    const grossMargin = product.unitCost !== null && product.unitPrice > 0
      ? `${Math.round(((product.unitPrice - unitCost) / product.unitPrice) * 100)}%`
      : '';
    return {
      id: product.id,
      code: product.code,
      nameTh: product.nameTh,
      nameEn: product.nameEn ?? '',
      type: productTypeLabel(product.productType),
      category: product.category ?? '',
      unit: product.unit,
      unitPrice: product.unitPrice,
      vat: vatLabel(product.vatType),
      unitCost: product.unitCost ?? '',
      grossMargin,
      accountCode: product.accountCode ?? '',
      defaultWhtRate: product.defaultWhtRate ? `${product.defaultWhtRate}%` : '',
      status: product.isActive ? 'ใช้งาน' : 'ปิดใช้งาน',
      updatedAt: product.updatedAt.toISOString(),
    };
  });
}

productsRouter.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const where: Record<string, unknown> = { companyId: req.user!.companyId, isActive: true };
    if (search) {
      where.OR = [
        { nameTh: { contains: search as string } },
        { nameEn: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } },
        { category: { contains: search as string, mode: 'insensitive' } },
        { productType: { contains: search as string, mode: 'insensitive' } },
        { accountCode: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    const products = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.product.findMany({ where, orderBy: { nameTh: 'asc' } });
    });
    res.json({ data: products });
  } catch {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

productsRouter.post('/export/sheets', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'export_google_sheets')) {
      res.status(403).json({ error: 'Upgrade to Business or Enterprise to export to Google Sheets' });
      return;
    }

    const [company, currentUser, products] = await Promise.all([
      prisma.company.findUnique({
        where: { id: req.user!.companyId },
        select: { nameTh: true, nameEn: true, googleWorkspaceSheetId: true },
      }),
      prisma.user.findUnique({ where: { id: req.user!.userId }, select: { email: true, googleRefreshToken: true } }),
      withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => tx.product.findMany({
        where: { companyId: req.user!.companyId },
        orderBy: [{ isActive: 'desc' }, { nameTh: 'asc' }],
        take: 5000,
      })),
    ]);

    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const result = await exportCompanyWorkspaceToSheets({
      period: today,
      companyName: company.nameTh || company.nameEn || 'Billboy',
      sharedWithEmails: [currentUser?.email],
      userRefreshToken: currentUser?.googleRefreshToken ?? null,
      existingSheetId: company.googleWorkspaceSheetId,
      tabs: {
        products: productSheetRows(products),
        inputVat: [],
        outputVat: [],
        expenses: [],
        customerEvidence: [],
        missingDocs: [],
        projectSummary: [],
      },
    });

    await prisma.company.update({
      where: { id: req.user!.companyId },
      data: {
        googleWorkspaceSheetId: result.sheetId,
        googleWorkspaceSheetUrl: result.url,
        googleWorkspaceSheetSyncedAt: new Date(),
      },
    });

    res.json({ data: { url: result.url } });
  } catch (err) {
    res.status(500).json({ error: 'Google Sheets product export failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

productsRouter.post('/', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    const limit = getUsageLimit(policy, 'products');
    if (limit !== null && getUsageValue(policy, 'products') >= limit) {
      res.status(403).json({ error: getLimitErrorMessage('products', policy) });
      return;
    }

    const body = productSchema.parse(req.body);
    const product = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.product.create({ data: { ...body, companyId: req.user!.companyId } });
    });
    res.status(201).json({ data: product });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to create product' });
  }
});

productsRouter.put('/:id', async (req, res) => {
  try {
    const body = productSchema.partial().parse(req.body);
    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.product.updateMany({ where: { id: req.params.id, companyId: req.user!.companyId }, data: body });
    });
    if (updated.count === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json({ message: 'Product updated' });
  } catch {
    res.status(500).json({ error: 'Failed to update product' });
  }
});
