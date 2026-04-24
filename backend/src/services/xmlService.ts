import { Builder } from 'xml2js';
import { logger } from '../config/logger';

interface InvoiceXmlData {
  invoiceNumber: string;
  invoiceDate: Date;
  type: string;
  referenceDocNumber?: string;   // เลขเอกสารอ้างอิง (สำหรับ receipt/credit/debit)
  referenceDocDate?: Date;        // วันที่เอกสารอ้างอิง (ETDA บังคับสำหรับ T03/T04/T05)
  seller: {
    taxId: string;
    branchCode: string;
    nameTh: string;
    addressTh: string;
  };
  buyer: {
    taxId: string;
    branchCode: string;
    nameTh: string;
    addressTh: string;
    personalId?: string;          // เลขบัตร ปชช. (สำหรับ Easy e-Receipt)
  };
  items: {
    nameTh: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    vatType: string;
    amount: number;
    vatAmount: number;
    totalAmount: number;
  }[];
  subtotal: number;
  vatAmount: number;
  total: number;
}

const DOC_TYPE_CODE: Record<string, string> = {
  tax_invoice: 'T02',
  tax_invoice_receipt: 'T01',   // ใบกำกับภาษี/ใบเสร็จรับเงิน (รวมใบเดียว)
  receipt: 'T03',
  credit_note: 'T04',
  debit_note: 'T05',
};

/**
 * Generates RD-compliant XML (ETDA/RD Schema v2.0)
 * Thai language only per RD requirement
 */
export function generateRDXml(data: InvoiceXmlData): string {
  const docDate = data.invoiceDate.toISOString().split('T')[0];

  // เอกสารที่ต้องมี BillingReference (อ้างอิงเอกสารเดิม)
  const needsReference = ['receipt', 'credit_note', 'debit_note'].includes(data.type);

  const xmlObj = {
    'Invoice': {
      $: {
        xmlns: 'urn:etax:names:specification:ubl:schema:xsd:Invoice-2',
        'xmlns:cbc': 'urn:etax:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
        'xmlns:cac': 'urn:etax:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      },
      'cbc:ID': data.invoiceNumber,
      'cbc:IssueDate': docDate,
      'cbc:InvoiceTypeCode': DOC_TYPE_CODE[data.type] ?? 'T02',
      'cbc:DocumentCurrencyCode': 'THB',
      // อ้างอิงเอกสารเดิม (บังคับสำหรับ receipt/credit_note/debit_note)
      // ETDA ขมธอ.3-2560: InvoiceDocumentReference ต้องมีทั้ง ID + IssueDate
      ...(needsReference && data.referenceDocNumber ? {
        'cac:BillingReference': {
          'cac:InvoiceDocumentReference': {
            'cbc:ID': data.referenceDocNumber,
            'cbc:IssueDate': (data.referenceDocDate ?? data.invoiceDate)
              .toISOString().split('T')[0],
          },
        },
      } : {}),
      'cac:AccountingSupplierParty': {
        'cac:Party': {
          // Tax ID 13 หลัก + รหัสสาขา ต้องอยู่ใน PartyIdentification ตาม ETDA
          'cac:PartyIdentification': [
            { 'cbc:ID': { $: { schemeID: 'TXID' }, _: data.seller.taxId } },
            { 'cbc:ID': { $: { schemeID: 'BRN' },  _: data.seller.branchCode } },
          ],
          'cac:PartyName': {
            'cbc:Name': data.seller.nameTh,
          },
          'cac:PostalAddress': {
            'cbc:StreetName': data.seller.addressTh,
            'cac:Country': {
              'cbc:IdentificationCode': 'TH',
            },
          },
          'cac:PartyTaxScheme': {
            'cbc:CompanyID': { $: { schemeID: 'TXID' }, _: data.seller.taxId },
            'cac:TaxScheme': {
              'cbc:ID': 'VAT',
            },
          },
          'cac:PartyLegalEntity': {
            'cbc:RegistrationName': data.seller.nameTh,
            'cbc:CompanyID': { $: { schemeID: 'TXID' }, _: data.seller.taxId },
          },
        },
      },
      'cac:AccountingCustomerParty': {
        'cac:Party': {
          // Buyer: บุคคลธรรมดาใช้ NIDN (เลข ปชช.), นิติบุคคลใช้ TXID (Tax ID 13 หลัก)
          'cac:PartyIdentification': [
            data.buyer.personalId
              ? { 'cbc:ID': { $: { schemeID: 'NIDN' }, _: data.buyer.personalId } }
              : { 'cbc:ID': { $: { schemeID: 'TXID' }, _: data.buyer.taxId } },
            ...(data.buyer.branchCode
              ? [{ 'cbc:ID': { $: { schemeID: 'BRN' }, _: data.buyer.branchCode } }]
              : []),
          ],
          'cac:PartyName': {
            'cbc:Name': data.buyer.nameTh,
          },
          'cac:PostalAddress': {
            'cbc:StreetName': data.buyer.addressTh,
            'cac:Country': {
              'cbc:IdentificationCode': 'TH',
            },
          },
          // PartyTaxScheme เฉพาะเมื่อ buyer เป็นนิติบุคคล (มี taxId 13 หลัก ไม่ใช่ NIDN)
          ...(!data.buyer.personalId && data.buyer.taxId ? {
            'cac:PartyTaxScheme': {
              'cbc:CompanyID': { $: { schemeID: 'TXID' }, _: data.buyer.taxId },
              'cac:TaxScheme': {
                'cbc:ID': 'VAT',
              },
            },
          } : {}),
          'cac:PartyLegalEntity': {
            'cbc:RegistrationName': data.buyer.nameTh,
          },
        },
      },
      'cac:TaxTotal': {
        'cbc:TaxAmount': { $: { currencyID: 'THB' }, _: data.vatAmount.toFixed(2) },
        'cac:TaxSubtotal': {
          'cbc:TaxableAmount': { $: { currencyID: 'THB' }, _: data.subtotal.toFixed(2) },
          'cbc:TaxAmount': { $: { currencyID: 'THB' }, _: data.vatAmount.toFixed(2) },
          'cac:TaxCategory': {
            'cbc:ID': 'S',
            'cbc:Percent': '7.00',
          },
        },
      },
      'cac:LegalMonetaryTotal': {
        'cbc:LineExtensionAmount': { $: { currencyID: 'THB' }, _: data.subtotal.toFixed(2) },
        'cbc:TaxExclusiveAmount': { $: { currencyID: 'THB' }, _: data.subtotal.toFixed(2) },
        'cbc:TaxInclusiveAmount': { $: { currencyID: 'THB' }, _: data.total.toFixed(2) },
        'cbc:PayableAmount': { $: { currencyID: 'THB' }, _: data.total.toFixed(2) },
      },
      'cac:InvoiceLine': data.items.map((item, idx) => ({
        'cbc:ID': String(idx + 1),
        'cbc:InvoicedQuantity': { $: { unitCode: item.unit }, _: String(item.quantity) },
        'cbc:LineExtensionAmount': { $: { currencyID: 'THB' }, _: item.amount.toFixed(2) },
        'cac:TaxTotal': {
          'cbc:TaxAmount': { $: { currencyID: 'THB' }, _: item.vatAmount.toFixed(2) },
        },
        'cac:Item': {
          'cbc:Name': item.nameTh,
        },
        'cac:Price': {
          'cbc:PriceAmount': { $: { currencyID: 'THB' }, _: item.unitPrice.toFixed(2) },
        },
      })),
    },
  };

  const builder = new Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ' },
  });

  try {
    return builder.buildObject(xmlObj);
  } catch (err) {
    logger.error('XML generation failed', err);
    throw new Error('Failed to generate RD XML');
  }
}
