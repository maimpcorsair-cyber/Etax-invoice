/**
 * rdSubmitWorker.ts
 * BullMQ worker — สำหรับ submit e-Tax Invoice ไปยัง RD
 *
 * Pipeline:
 *  1. โหลด Invoice + XML จาก DB / S3
 *  2. ลงลายมือดิจิทัล (XAdES-BES) ด้วย signatureService
 *  3. ขอ Timestamp จาก TSA (RFC 3161) ด้วย tsaService
 *  4. ส่ง signed+stamped XML ไปยัง RD API (sandbox/production)
 *  5. อัพเดทสถานะใน DB
 *  6. ส่ง email แจ้งผล
 */

import { Worker, Job } from 'bullmq';
import redis from '../../config/redis';
import prisma from '../../config/database';
import { withSystemRlsContext } from '../../config/rls';
import { sendRdSuccessEmail, sendRdFailedEmail } from '../../services/emailService';
import { sendRdResultNotification } from '../../services/notificationService';
import { generateRDXml } from '../../services/xmlService';
import { signXml }          from '../../services/signatureService';
import { requestTimestamp, embedTimestampInXml } from '../../services/tsaService';
import { submitToRD }        from '../../services/rdApiService';
import { logger } from '../../config/logger';
import { resolveCompanyRuntimeConfig } from '../../services/companyConfigService';

interface RDJobData {
  invoiceId: string;
}

const DOC_TYPE_CODE: Record<string, string> = {
  tax_invoice:         'T02',
  tax_invoice_receipt: 'T01',
  receipt:             'T03',
  credit_note:         'T04',
  debit_note:          'T05',
};

export const rdSubmitWorker = new Worker<RDJobData>(
  'rd-submission',
  async (job: Job<RDJobData>) => {
    const { invoiceId } = job.data;
    logger.info(`[RD Worker] Starting submission for invoice ${invoiceId}`);

    // ─── 1. Load invoice ────────────────────────────────────────────────────
    const invoice = await withSystemRlsContext(prisma, (tx) => tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { buyer: true, company: true, items: true },
    }), { role: 'worker' });
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
    if (invoice.status === 'cancelled') throw new Error('Invoice is cancelled');

    const runtimeConfig = resolveCompanyRuntimeConfig(invoice.company);

    await withSystemRlsContext(prisma, (tx) => tx.invoice.update({ where: { id: invoiceId }, data: { rdSubmissionStatus: 'in_progress' } }), { role: 'worker' });

    // ─── 2. Generate fresh XML ──────────────────────────────────────────────
    logger.info(`[RD Worker] Generating XML for ${invoice.invoiceNumber}`);

    // หาวันที่ของเอกสารอ้างอิง (สำหรับ T03/T04/T05)
    let referenceDocDate: Date | undefined;
    if (invoice.referenceInvoiceId) {
      const refInv = await withSystemRlsContext(prisma, (tx) => tx.invoice.findUnique({
        where: { id: invoice.referenceInvoiceId ?? undefined },
        select: { invoiceDate: true },
      }), { role: 'worker' });
      referenceDocDate = refInv?.invoiceDate;
    }

    const rawXml = generateRDXml({
      invoiceNumber:     invoice.invoiceNumber,
      invoiceDate:       invoice.invoiceDate,
      type:              invoice.type,
      referenceDocNumber: invoice.referenceDocNumber ?? undefined,
      referenceDocDate:   referenceDocDate,
      seller: {
        taxId:      invoice.company.taxId,
        branchCode: invoice.company.branchCode,
        nameTh:     invoice.company.nameTh,
        addressTh:  invoice.company.addressTh,
      },
      buyer: {
        taxId:      invoice.buyer.taxId,
        branchCode: invoice.buyer.branchCode,
        nameTh:     invoice.buyer.nameTh,
        addressTh:  invoice.buyer.addressTh,
        personalId: invoice.buyer.personalId ?? undefined,
      },
      items: invoice.items.map((item) => ({
        nameTh:      item.nameTh,
        quantity:    item.quantity,
        unit:        item.unit,
        unitPrice:   item.unitPrice,
        vatType:     item.vatType,
        amount:      item.amount,
        vatAmount:   item.vatAmount,
        totalAmount: item.totalAmount,
      })),
      subtotal:  invoice.subtotal,
      vatAmount: invoice.vatAmount,
      total:     invoice.total,
    });

    // ─── 3. Digital Signature (XAdES-BES) ──────────────────────────────────
    logger.info(`[RD Worker] Signing XML with XAdES-BES`);
    const sigResult = signXml(rawXml, {
      certPath: runtimeConfig.certPath,
      certPassword: runtimeConfig.certPassword,
    });

    // ─── 4. Timestamp (RFC 3161 TSA) ────────────────────────────────────────
    logger.info(`[RD Worker] Requesting TSA timestamp`);
    const tstResult = await requestTimestamp(sigResult.signatureId);
    const finalXml  = embedTimestampInXml(sigResult.signedXml, tstResult);

    const xmlBase64 = Buffer.from(finalXml, 'utf8').toString('base64');

    // ─── 5. Submit to RD ────────────────────────────────────────────────────
    logger.info(`[RD Worker] Submitting to RD (env=${runtimeConfig.rdEnvironment})`);
    const rdResult = await submitToRD({
      taxId:      invoice.company.taxId,
      branchId:   invoice.company.branchCode,
      docType:    DOC_TYPE_CODE[invoice.type] ?? 'T02',
      docDate:    invoice.invoiceDate.toISOString().split('T')[0],
      docNum:     invoice.invoiceNumber,
      netAmt:     invoice.subtotal,
      vatAmt:     invoice.vatAmount,
      totalAmt:   invoice.total,
      buyerTaxId: invoice.buyer.taxId,
      buyerBranchId: invoice.buyer.branchCode,
      xmlContent: xmlBase64,
    }, {
      environment: runtimeConfig.rdEnvironment,
      clientId: runtimeConfig.rdClientId,
      clientSecret: runtimeConfig.rdClientSecret,
    });

    if (!rdResult.success) {
      throw new Error(`RD rejected document: ${rdResult.message}`);
    }

    // ─── 6. Update DB ───────────────────────────────────────────────────────
    await withSystemRlsContext(prisma, (tx) => tx.invoice.update({
      where: { id: invoiceId },
      data: {
        rdSubmissionStatus: 'success',
        rdDocId:            rdResult.docId ?? rdResult.rdRefNumber,
        rdSubmittedAt:      new Date(),
        rdResponseXml:      JSON.stringify({ ...rdResult, signatureId: sigResult.signatureId, tsaUrl: tstResult.tsaUrl }),
        status:             'submitted',
      },
    }), { role: 'worker' });

    logger.info(`[RD Worker] ✅ Invoice ${invoice.invoiceNumber} submitted — rdDocId=${rdResult.docId}`);

    // ─── 7. Push notification ───────────────────────────────────────────────
    await sendRdResultNotification(invoiceId, true, invoice.invoiceNumber, invoice.createdBy)
      .catch((e: Error) => logger.warn(`Push notify failed: ${e.message}`));

    // ─── 8. Notify admin via email ──────────────────────────────────────────
    if (invoice.company.email) {
      await sendRdSuccessEmail(invoice.company.email, {
        invoiceNumber: invoice.invoiceNumber,
        total:         invoice.total,
        buyerNameTh:   invoice.buyer.nameTh,
        buyerNameEn:   invoice.buyer.nameEn,
        buyerEmail:    invoice.buyer.email,
        sellerNameTh:  invoice.company.nameTh,
        language:      invoice.language,
        pdfUrl:        invoice.pdfUrl,
        rdDocId:       rdResult.docId,
      }).catch((e: Error) => logger.warn(`Email notify failed: ${e.message}`));
    }

    return { rdDocId: rdResult.docId, isMock: rdResult.isMock };
  },
  { connection: redis, concurrency: 2 },
);

rdSubmitWorker.on('failed', async (job, err) => {
  logger.error(`[RD Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message });
  if (!job?.data.invoiceId) return;

  const maxAttempts = job.opts.attempts ?? 5;
  const isLastAttempt = job.attemptsMade >= maxAttempts;

  await withSystemRlsContext(prisma, (tx) => tx.invoice.update({
    where: { id: job.data.invoiceId },
    data: { rdSubmissionStatus: isLastAttempt ? 'failed' : 'retrying' },
  }), { role: 'worker' }).catch(() => { /* ignore */ });

  if (isLastAttempt) {
    try {
      const invoice = await withSystemRlsContext(prisma, (tx) => tx.invoice.findUnique({
        where: { id: job.data.invoiceId },
        include: { buyer: true, company: true },
      }), { role: 'worker' });

      // Push notification on final failure
      if (invoice) {
        await sendRdResultNotification(job.data.invoiceId, false, invoice.invoiceNumber, invoice.createdBy)
          .catch((e: Error) => logger.warn(`Push notify failed: ${e.message}`));
      }

      if (invoice?.company.email) {
        await sendRdFailedEmail(
          invoice.company.email,
          {
            invoiceNumber: invoice.invoiceNumber,
            total:         invoice.total,
            buyerNameTh:   invoice.buyer.nameTh,
            buyerNameEn:   invoice.buyer.nameEn,
            buyerEmail:    invoice.buyer.email,
            sellerNameTh:  invoice.company.nameTh,
            language:      invoice.language,
            pdfUrl:        invoice.pdfUrl,
          },
          err.message,
        );
      }
    } catch (emailErr) {
      logger.error('Failed to send RD failure notification email', emailErr);
    }
  }
});
