import prisma from '../config/database';
import { withInvoiceLock } from '../config/rls';
import { logger } from '../config/logger';

const TYPE_PREFIX: Record<string, string> = {
  tax_invoice: 'INV',
  tax_invoice_receipt: 'INV',
  receipt: 'RCT',
  credit_note: 'CN',
  debit_note: 'DN',
};

export async function generateInvoiceNumber(companyId: string, type: string): Promise<string> {
  const prefix = TYPE_PREFIX[type] ?? 'DOC';
  const year = new Date().getFullYear();

  // Use advisory lock to prevent duplicate invoice numbers under concurrent creation
  return withInvoiceLock(prisma, companyId, async (tx) => {
    // Find the latest invoice number for this company and type in current year
    const latest = await tx.invoice.findFirst({
      where: {
        companyId,
        invoiceNumber: { startsWith: `${prefix}-${year}` },
      },
      orderBy: { invoiceNumber: 'desc' },
    });

    // Extract sequence from last invoice number (format: PREFIX-YYYY-NNNNNN)
    let seq = 0;
    if (latest?.invoiceNumber) {
      const parts = latest.invoiceNumber.split('-');
      const lastSeq = parts[parts.length - 1];
      seq = parseInt(lastSeq, 10) || 0;
    }

    const newSeq = seq + 1;
    return `${prefix}-${year}-${newSeq.toString().padStart(6, '0')}`;
  });
}

export function amountInWordsThai(amount: number): string {
  const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  if (amount === 0) return 'ศูนย์บาทถ้วน';

  const [intPart, decPart] = amount.toFixed(2).split('.');
  const intNum = parseInt(intPart);

  function convertGroup(n: number): string {
    if (n === 0) return '';
    const str = String(n);
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const d = parseInt(str[i]);
      const pos = str.length - i - 1;
      if (d === 0) continue;
      if (pos === 1 && d === 1) result += positions[pos];
      else if (pos === 1 && d === 2) result += 'ยี่' + positions[pos];
      else result += digits[d] + positions[pos];
    }
    return result;
  }

  let result = '';
  if (intNum >= 1_000_000) {
    result += convertGroup(Math.floor(intNum / 1_000_000)) + 'ล้าน';
    result += convertGroup(intNum % 1_000_000);
  } else {
    result += convertGroup(intNum);
  }
  result += 'บาท';

  const satang = parseInt(decPart);
  if (satang > 0) {
    result += convertGroup(satang) + 'สตางค์';
  } else {
    result += 'ถ้วน';
  }
  return result;
}

export function amountInWordsEnglish(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '') + ' ';
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred ' + convert(n % 100);
    if (n < 1_000_000) return convert(Math.floor(n / 1000)) + 'Thousand ' + convert(n % 1000);
    return convert(Math.floor(n / 1_000_000)) + 'Million ' + convert(n % 1_000_000);
  }

  const [intPart, decPart] = amount.toFixed(2).split('.');
  const satang = parseInt(decPart);
  let result = convert(parseInt(intPart)).trim() + ' Baht';
  if (satang > 0) result += ` and ${convert(satang).trim()} Satang`;
  else result += ' Only';
  return result;
}

logger.debug('invoiceService loaded');
