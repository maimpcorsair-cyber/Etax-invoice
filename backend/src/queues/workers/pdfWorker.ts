import { Worker, Job } from 'bullmq';
import redis from '../../config/redis';
import prisma from '../../config/database';
import { withSystemRlsContext } from '../../config/rls';
import { buildHtmlForCompany, generatePdfFromHtml } from '../../services/pdfService';
import { generateRDXml } from '../../services/xmlService';
import { uploadToStorage } from '../../services/storageService';
import { logger } from '../../config/logger';

interface PdfJobData {
  invoiceId: string;
  language: 'th' | 'en' | 'both';
}

export const pdfWorker = new Worker<PdfJobData>(
  'invoice-processing',
  async (job: Job<PdfJobData>) => {
    const { invoiceId, language } = job.data;
    logger.info(`Processing PDF for invoice ${invoiceId}`);

    const invoice = await withSystemRlsContext(prisma, (tx) => tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        buyer: true,
        company: true,
      },
    }), { role: 'worker' });

    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

    await job.updateProgress(10);

    const sellerSnap = invoice.seller as {
      nameTh?: string | null;
      nameEn?: string | null;
      taxId?: string | null;
      branchCode?: string | null;
      branchNameTh?: string | null;
      addressTh?: string | null;
      addressEn?: string | null;
      phone?: string | null;
      email?: string | null;
      logoUrl?: string | null;
      documentPreferences?: {
        templateId?: string | null;
        documentMode?: 'ordinary' | 'electronic' | null;
        bankPaymentInfo?: string | null;
        showCompanyLogo?: boolean | null;
        documentLogoUrl?: string | null;
        signatureImageUrl?: string | null;
        signerName?: string | null;
        signerTitle?: string | null;
      };
    } | null;

    const html = await buildHtmlForCompany({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      type: invoice.type,
      language,
      seller: {
        nameTh: sellerSnap?.nameTh ?? invoice.company.nameTh,
        nameEn: sellerSnap?.nameEn ?? invoice.company.nameEn,
        taxId: sellerSnap?.taxId ?? invoice.company.taxId,
        branchCode: sellerSnap?.branchCode ?? invoice.company.branchCode,
        branchNameTh: sellerSnap?.branchNameTh ?? invoice.company.branchNameTh,
        addressTh: sellerSnap?.addressTh ?? invoice.company.addressTh,
        addressEn: sellerSnap?.addressEn ?? invoice.company.addressEn,
        phone: sellerSnap?.phone ?? invoice.company.phone,
        email: sellerSnap?.email ?? invoice.company.email,
        logoUrl: sellerSnap?.logoUrl ?? invoice.company.logoUrl,
      },
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
        discount: item.discount,
        vatType: item.vatType,
        amount: item.amount,
        vatAmount: item.vatAmount,
        totalAmount: item.totalAmount,
      })),
      subtotal: invoice.subtotal,
      vatAmount: invoice.vatAmount,
      discount: invoice.discount,
      total: invoice.total,
      notes: invoice.notes,
      paymentMethod: invoice.paymentMethod,
      templateId: sellerSnap?.documentPreferences?.templateId ?? null,
      documentMode: sellerSnap?.documentPreferences?.documentMode ?? 'electronic',
      bankPaymentInfo: sellerSnap?.documentPreferences?.bankPaymentInfo ?? null,
      showCompanyLogo: sellerSnap?.documentPreferences?.showCompanyLogo ?? true,
      documentLogoUrl: sellerSnap?.documentPreferences?.documentLogoUrl ?? null,
      signatureImageUrl: sellerSnap?.documentPreferences?.signatureImageUrl ?? null,
      signerName: sellerSnap?.documentPreferences?.signerName ?? null,
      signerTitle: sellerSnap?.documentPreferences?.signerTitle ?? null,
    }, invoice.companyId);
    const pdfBuffer = await generatePdfFromHtml(html);

    await job.updateProgress(50);

    const xmlStr = generateRDXml({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      type: invoice.type,
      seller: {
        taxId: invoice.company.taxId,
        branchCode: invoice.company.branchCode,
        nameTh: invoice.company.nameTh,
        addressTh: invoice.company.addressTh,
      },
      buyer: {
        taxId: invoice.buyer.taxId,
        branchCode: invoice.buyer.branchCode,
        nameTh: invoice.buyer.nameTh,
        addressTh: invoice.buyer.addressTh,
      },
      items: invoice.items.map((i) => ({
        nameTh: i.nameTh,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        vatType: i.vatType,
        amount: i.amount,
        vatAmount: i.vatAmount,
        totalAmount: i.totalAmount,
      })),
      subtotal: invoice.subtotal,
      vatAmount: invoice.vatAmount,
      total: invoice.total,
    });

    await job.updateProgress(70);

    const pdfKey = `invoices/${invoice.companyId}/${invoice.invoiceNumber}.pdf`;
    const xmlKey = `invoices/${invoice.companyId}/${invoice.invoiceNumber}.xml`;

    const [pdfUrl, xmlUrl] = await Promise.all([
      uploadToStorage(pdfKey, pdfBuffer, 'application/pdf'),
      uploadToStorage(xmlKey, Buffer.from(xmlStr, 'utf-8'), 'application/xml'),
    ]);

    // Always save the file URLs
    await withSystemRlsContext(prisma, (tx) => tx.invoice.update({
      where: { id: invoiceId },
      data: { pdfUrl, xmlUrl },
    }), { role: 'worker' });
    // Advance status to 'pending' ONLY if still in 'draft'
    // (don't overwrite 'approved'/'submitted' set by queueRdSubmission for T01/T02/T03)
    await withSystemRlsContext(prisma, (tx) => tx.invoice.updateMany({
      where: { id: invoiceId, status: 'draft' },
      data: { status: 'pending' },
    }), { role: 'worker' });

    await job.updateProgress(100);
    logger.info(`PDF/XML generated for invoice ${invoiceId}`);

    return { pdfUrl, xmlUrl };
  },
  { connection: redis, concurrency: 5 },
);

pdfWorker.on('failed', (job, err) => {
  logger.error(`PDF job ${job?.id} failed`, { error: err.message, invoiceId: job?.data?.invoiceId });
});

pdfWorker.on('completed', (job) => {
  logger.info(`PDF job ${job.id} completed`, { invoiceId: job.data.invoiceId });
});
