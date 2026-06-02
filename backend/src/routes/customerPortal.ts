import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { withSystemRlsContext } from '../config/rls';
import { generatePdf, buildHtmlForCompany, type PdfInvoiceData } from '../services/pdfService';
import {
  buildCustomerPortalUrl,
  signCustomerPortalToken,
  verifyCustomerPortalToken,
  type CustomerPortalTokenPayload,
} from '../services/customerPortalToken';
import { sendCustomerPortalLinkEmail } from '../services/emailService';

// Customer Portal — read-only view of issued documents (invoices,
// quotations, delivery notes) for the buyer who received them. The
// portal is unauthenticated by app login; magic-link via email is the
// credential. No password, no signup, no separate account row.
//
// Mounted unauthenticated at /api/customer-portal — every endpoint either
// is the magic-link request itself (POST /request-link) or pulls the
// session payload from a signed JWT in the Authorization header.

export const customerPortalRouter = Router();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      portal?: CustomerPortalTokenPayload;
    }
  }
}

// ── Auth middleware for portal endpoints ─────────────────────────────

function requirePortalSession(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Customer portal session required' });
    return;
  }
  const payload = verifyCustomerPortalToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired portal session' });
    return;
  }
  req.portal = payload;
  next();
}

// ── POST /request-link ───────────────────────────────────────────────
// Body: { email }. Look up matching customers across tenants, build a
// magic-link token per match, send all of them in a single email. Always
// returns 200 (don't leak email existence). Rate-limited via the global
// /api/ Redis limiter.

const requestLinkSchema = z.object({
  email: z.string().email(),
});

customerPortalRouter.post('/request-link', async (req, res) => {
  try {
    const body = requestLinkSchema.parse(req.body);
    const normalisedEmail = body.email.trim().toLowerCase();

    // Skip system mode — we want the unauthenticated route to find rows
    // by email across all tenants. RLS policies on customers don't gate
    // this lookup (companyId filter is what scopes other routes).
    const matches = await withSystemRlsContext(prisma, (tx) => tx.customer.findMany({
      where: { email: normalisedEmail, isActive: true },
      include: {
        company: { select: { id: true, nameTh: true, nameEn: true } },
      },
      take: 10, // sanity bound
    }), { role: 'customer-portal' });

    if (matches.length === 0) {
      // Quiet success — caller cannot tell if the email exists.
      logger.info('[customer-portal] request-link with no matching customer', { emailHash: simpleHash(normalisedEmail) });
      res.json({ data: { sent: 1 } });
      return;
    }

    const baseUrl = process.env.FRONTEND_URL ?? process.env.APP_URL ?? 'https://etax-invoice.vercel.app';
    const links = matches.map((match) => {
      const token = signCustomerPortalToken({
        customerId: match.id,
        companyId: match.companyId,
        email: normalisedEmail,
      });
      return {
        sellerNameTh: match.company.nameTh,
        sellerNameEn: match.company.nameEn ?? match.company.nameTh,
        portalUrl: buildCustomerPortalUrl(baseUrl, token),
      };
    });

    await sendCustomerPortalLinkEmail({
      toEmail: normalisedEmail,
      links,
    }).catch((err) => {
      logger.error('[customer-portal] send link email failed', { err: err instanceof Error ? err.message : String(err) });
    });

    res.json({ data: { sent: 1 } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid email', details: err.issues });
      return;
    }
    logger.error('[customer-portal] request-link failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to send portal link' });
  }
});

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

// ── GET /me ──────────────────────────────────────────────────────────

customerPortalRouter.get('/me', requirePortalSession, async (req, res) => {
  try {
    const { customerId, companyId } = req.portal!;
    const customer = await withSystemRlsContext(prisma, (tx) => tx.customer.findFirst({
      where: { id: customerId, companyId },
      include: {
        company: { select: { id: true, nameTh: true, nameEn: true, taxId: true, logoUrl: true } },
      },
    }), { role: 'customer-portal' });
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    res.json({
      data: {
        customer: {
          id: customer.id,
          nameTh: customer.nameTh,
          nameEn: customer.nameEn,
          taxId: customer.taxId,
          email: customer.email,
        },
        company: customer.company,
        sessionExp: req.portal!.exp,
      },
    });
  } catch (err) {
    logger.error('[customer-portal] me failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// ── GET /documents ───────────────────────────────────────────────────
// Returns the buyer's invoices + quotations + delivery notes from the
// seller company. Read-only — no drafts shown.

customerPortalRouter.get('/documents', requirePortalSession, async (req, res) => {
  try {
    const { customerId, companyId } = req.portal!;
    const result = await withSystemRlsContext(prisma, async (tx) => {
      const [invoices, quotations, deliveryNotes] = await Promise.all([
        tx.invoice.findMany({
          where: {
            companyId,
            buyerId: customerId,
            status: { notIn: ['draft', 'cancelled'] },
          },
          orderBy: { invoiceDate: 'desc' },
          select: {
            id: true, invoiceNumber: true, type: true, status: true,
            invoiceDate: true, dueDate: true, total: true, isPaid: true,
          },
          take: 100,
        }),
        tx.quotation.findMany({
          where: {
            companyId,
            buyerId: customerId,
            supersededById: null,
            status: { notIn: ['draft', 'cancelled'] },
          },
          orderBy: { quotationDate: 'desc' },
          select: {
            id: true, quotationNumber: true, status: true,
            quotationDate: true, validUntil: true, total: true,
            convertedToInvoiceId: true,
          },
          take: 100,
        }),
        tx.deliveryNote.findMany({
          where: {
            companyId,
            buyerId: customerId,
            status: { notIn: ['draft', 'cancelled'] },
          },
          orderBy: { deliveryDate: 'desc' },
          select: {
            id: true, deliveryNoteNumber: true, status: true,
            deliveryDate: true, carrierName: true, trackingNo: true, trackingUrl: true,
          },
          take: 100,
        }),
      ]);
      return { invoices, quotations, deliveryNotes };
    }, { role: 'customer-portal' });

    res.json({ data: result });
  } catch (err) {
    logger.error('[customer-portal] list documents failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// ── GET /invoices/:id ────────────────────────────────────────────────

customerPortalRouter.get('/invoices/:id', requirePortalSession, async (req, res) => {
  try {
    const { customerId, companyId } = req.portal!;
    const invoice = await withSystemRlsContext(prisma, (tx) => tx.invoice.findFirst({
      where: {
        id: req.params.id,
        companyId,
        buyerId: customerId,
        status: { notIn: ['draft', 'cancelled'] },
      },
      include: { items: true, buyer: true },
    }), { role: 'customer-portal' });
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    res.json({ data: invoice });
  } catch (err) {
    logger.error('[customer-portal] get invoice failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to get invoice' });
  }
});

// ── GET /invoices/:id/pdf ────────────────────────────────────────────

customerPortalRouter.get('/invoices/:id/pdf', requirePortalSession, async (req, res) => {
  try {
    const { customerId, companyId } = req.portal!;
    const invoice = await withSystemRlsContext(prisma, (tx) => tx.invoice.findFirst({
      where: {
        id: req.params.id,
        companyId,
        buyerId: customerId,
        status: { notIn: ['draft', 'cancelled'] },
      },
      include: { items: true, buyer: true },
    }), { role: 'customer-portal' });
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const pdfData: PdfInvoiceData = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      type: invoice.type,
      language: invoice.language as 'th' | 'en' | 'both',
      seller: invoice.seller as PdfInvoiceData['seller'],
      buyer: {
        nameTh: invoice.buyer.nameTh,
        nameEn: invoice.buyer.nameEn,
        taxId: invoice.buyer.taxId,
        branchCode: invoice.buyer.branchCode,
        addressTh: invoice.buyer.addressTh,
        addressEn: invoice.buyer.addressEn,
      },
      items: invoice.items.map((item) => ({
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        vatType: item.vatType,
        amount: item.amount,
        vatAmount: item.vatAmount,
        totalAmount: item.totalAmount,
      })),
      subtotal: invoice.subtotal,
      vatAmount: invoice.vatAmount,
      discountAmount: invoice.discountAmount,
      total: invoice.total,
      notes: invoice.notes,
      paymentMethod: invoice.paymentMethod,
    };

    // buildHtmlForCompany pulls PromptPay QR + theme + electronic-mode QR
    const html = await buildHtmlForCompany(pdfData, companyId);
    const pdf = await generatePdf({ ...pdfData, templateHtml: html });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(pdf);
  } catch (err) {
    logger.error('[customer-portal] invoice pdf failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to generate invoice PDF' });
  }
});

// ── GET /quotations/:id ──────────────────────────────────────────────

customerPortalRouter.get('/quotations/:id', requirePortalSession, async (req, res) => {
  try {
    const { customerId, companyId } = req.portal!;
    const quotation = await withSystemRlsContext(prisma, (tx) => tx.quotation.findFirst({
      where: {
        id: req.params.id,
        companyId,
        buyerId: customerId,
        status: { notIn: ['draft', 'cancelled'] },
      },
      include: { items: true, buyer: true },
    }), { role: 'customer-portal' });
    if (!quotation) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }
    res.json({ data: quotation });
  } catch (err) {
    logger.error('[customer-portal] get quotation failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to get quotation' });
  }
});

// ── GET /delivery-notes/:id ──────────────────────────────────────────

customerPortalRouter.get('/delivery-notes/:id', requirePortalSession, async (req, res) => {
  try {
    const { customerId, companyId } = req.portal!;
    const note = await withSystemRlsContext(prisma, (tx) => tx.deliveryNote.findFirst({
      where: {
        id: req.params.id,
        companyId,
        buyerId: customerId,
        status: { notIn: ['draft', 'cancelled'] },
      },
      include: { items: true, buyer: true },
    }), { role: 'customer-portal' });
    if (!note) {
      res.status(404).json({ error: 'Delivery note not found' });
      return;
    }
    res.json({ data: note });
  } catch (err) {
    logger.error('[customer-portal] get delivery note failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to get delivery note' });
  }
});
