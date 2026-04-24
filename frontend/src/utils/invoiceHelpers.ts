import type { InvoiceItem } from '../types';

export const VAT_RATE = 0.07;

/** Read language from localStorage — used before React hooks are available */
export function isThai_fallback(): boolean {
  return (
    localStorage.getItem('etax_language') === 'th' ||
    !localStorage.getItem('etax_language')
  );
}

export function emptyItem(): InvoiceItem {
  return {
    nameTh: '',
    nameEn: '',
    quantity: 1,
    unit: isThai_fallback() ? 'ชิ้น' : 'pcs',
    unitPrice: 0,
    discount: 0,
    vatType: 'vat7',
    vatAmount: 0,
    amount: 0,
    totalAmount: 0,
  };
}

export function translateZodMessage(msg: string): string {
  if (/String must contain at least 1 character/i.test(msg)) return 'ต้องไม่เว้นว่าง';
  if (/Number must be greater than 0/i.test(msg)) return 'ต้องมากกว่า 0';
  if (/Number must be greater than or equal to 0/i.test(msg)) return 'ต้องไม่ติดลบ';
  if (/Number must be less than or equal to 100/i.test(msg)) return 'ต้องไม่เกิน 100';
  if (/Expected number, received string/i.test(msg)) return 'ต้องเป็นตัวเลข';
  if (/Expected string, received/i.test(msg)) return 'ต้องเป็นข้อความ';
  if (/Required/i.test(msg)) return 'ต้องระบุค่า';
  if (/Invalid enum value/i.test(msg)) return 'ค่าที่เลือกไม่ถูกต้อง';
  if (/Array must contain at least 1 element/i.test(msg)) return 'ต้องมีอย่างน้อย 1 รายการ';
  return msg;
}

export function calculateItem(item: InvoiceItem): InvoiceItem {
  const gross = item.quantity * item.unitPrice;
  const discountAmt = item.discount > 0 ? (gross * item.discount) / 100 : 0;
  const amount = gross - discountAmt;
  const vatAmount = item.vatType === 'vat7' ? amount * VAT_RATE : 0;
  return { ...item, amount, vatAmount, totalAmount: amount + vatAmount };
}
