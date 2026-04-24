import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import {
  getLimitErrorMessage,
  getUsageLimit,
  getUsageValue,
  resolveCompanyAccessPolicy,
} from '../services/accessPolicyService';

export const productsRouter = Router();

const productSchema = z.object({
  code: z.string().min(1),
  nameTh: z.string().min(1),
  nameEn: z.string().optional(),
  descriptionTh: z.string().optional(),
  descriptionEn: z.string().optional(),
  unit: z.string(),
  unitPrice: z.number().min(0),
  vatType: z.enum(['vat7', 'vatExempt', 'vatZero']),
});

productsRouter.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const where: Record<string, unknown> = { companyId: req.user!.companyId, isActive: true };
    if (search) {
      where.OR = [
        { nameTh: { contains: search as string } },
        { nameEn: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } },
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
