export type CustomerKind = 'company' | 'individual';
export type CustomerPartyRole = 'customer' | 'supplier' | 'both';
export type CustomerUseCase = 'general' | 'full_tax_invoice' | 'credit' | 'contract_project' | 'vendor_payee';
export type CustomerVerificationStatus = 'not_required' | 'missing' | 'partial' | 'complete';
export type CustomerVatEvidenceStatus = 'not_required' | 'missing' | 'uploaded' | 'verified';

export type CustomerDocumentType =
  | 'company_registration'
  | 'vat_certificate'
  | 'contract'
  | 'credit_agreement'
  | 'director_id'
  | 'personal_id'
  | 'bank_account'
  | 'other';

export interface CustomerReadinessDocument {
  documentType: string;
  status: string;
}

export interface CustomerReadinessInput {
  partyRole?: string | null;
  customerKind?: string | null;
  useCase?: string | null;
  nameTh?: string | null;
  taxId?: string | null;
  branchCode?: string | null;
  addressTh?: string | null;
  personalId?: string | null;
}

export interface CustomerReadinessItem {
  key: string;
  labelTh: string;
  labelEn: string;
  required: boolean;
  complete: boolean;
  documentType?: CustomerDocumentType;
}

export interface CustomerReadinessSummary {
  status: CustomerVerificationStatus;
  vatEvidenceStatus: CustomerVatEvidenceStatus;
  missingRequiredCount: number;
  recommendedMissingCount: number;
  items: CustomerReadinessItem[];
}

export const customerUseCases: CustomerUseCase[] = ['general', 'full_tax_invoice', 'credit', 'contract_project', 'vendor_payee'];
export const customerKinds: CustomerKind[] = ['company', 'individual'];
export const customerPartyRoles: CustomerPartyRole[] = ['customer', 'supplier', 'both'];

export function normalizeCustomerKind(value?: string | null, personalId?: string | null): CustomerKind {
  if (value === 'company' || value === 'individual') return value;
  return personalId ? 'individual' : 'company';
}

export function normalizeCustomerUseCase(value?: string | null): CustomerUseCase {
  return customerUseCases.includes(value as CustomerUseCase) ? value as CustomerUseCase : 'general';
}

export function normalizeCustomerPartyRole(value?: string | null, useCase?: string | null): CustomerPartyRole {
  if (value === 'customer' || value === 'supplier' || value === 'both') return value;
  return useCase === 'vendor_payee' ? 'supplier' : 'customer';
}

function hasDocument(documents: CustomerReadinessDocument[], documentType: CustomerDocumentType) {
  return documents.some((doc) => doc.documentType === documentType && doc.status !== 'rejected');
}

export function buildCustomerReadiness(
  customer: CustomerReadinessInput,
  documents: CustomerReadinessDocument[] = [],
): CustomerReadinessSummary {
  const customerKind = normalizeCustomerKind(customer.customerKind, customer.personalId);
  const useCase = normalizeCustomerUseCase(customer.useCase);
  const partyRole = normalizeCustomerPartyRole(customer.partyRole, useCase);
  const isCompany = customerKind === 'company';
  const isSupplier = partyRole === 'supplier' || partyRole === 'both' || useCase === 'vendor_payee';
  const needsVatEvidence = isCompany && ['full_tax_invoice', 'credit', 'contract_project'].includes(useCase);
  const needsRegistration = isCompany && ['credit', 'contract_project', 'vendor_payee'].includes(useCase);
  const needsContract = ['credit', 'contract_project'].includes(useCase);
  const recommendsPersonalIdEvidence = !isCompany && ['credit', 'contract_project', 'vendor_payee'].includes(useCase);
  const recommendsBankAccount = isSupplier;

  const items: CustomerReadinessItem[] = [
    {
      key: 'basic_identity',
      labelTh: isCompany ? (isSupplier ? 'ข้อมูลซัพพลายเออร์ครบถ้วน' : 'ข้อมูลบริษัทครบถ้วน') : 'ข้อมูลบุคคลครบถ้วน',
      labelEn: isCompany ? (isSupplier ? 'Supplier details complete' : 'Company details complete') : 'Individual details complete',
      required: true,
      complete: Boolean(customer.nameTh && customer.taxId?.length === 13 && customer.addressTh),
    },
  ];

  if (needsRegistration) {
    items.push({
      key: 'company_registration',
      labelTh: 'หนังสือรับรองบริษัท',
      labelEn: 'Company registration',
      required: true,
      documentType: 'company_registration',
      complete: hasDocument(documents, 'company_registration'),
    });
  }

  if (needsVatEvidence) {
    items.push({
      key: 'vat_certificate',
      labelTh: 'ภ.พ.20 / หลักฐานจด VAT',
      labelEn: 'VAT certificate',
      required: true,
      documentType: 'vat_certificate',
      complete: hasDocument(documents, 'vat_certificate'),
    });
  }

  if (needsContract) {
    items.push({
      key: 'contract_or_credit',
      labelTh: useCase === 'credit' ? 'เอกสารเปิดเครดิต/ข้อตกลงชำระเงิน' : 'สัญญาหรือเอกสารโครงการ',
      labelEn: useCase === 'credit' ? 'Credit terms document' : 'Contract or project document',
      required: true,
      documentType: useCase === 'credit' ? 'credit_agreement' : 'contract',
      complete: hasDocument(documents, useCase === 'credit' ? 'credit_agreement' : 'contract'),
    });
  }

  if (isCompany && needsContract) {
    items.push({
      key: 'director_id',
      labelTh: 'สำเนาบัตรผู้มีอำนาจลงนาม (เฉพาะถ้าจำเป็น)',
      labelEn: 'Authorized signer ID (only if needed)',
      required: false,
      documentType: 'director_id',
      complete: hasDocument(documents, 'director_id'),
    });
  }

  if (recommendsPersonalIdEvidence) {
    items.push({
      key: 'personal_id',
      labelTh: 'เอกสารยืนยันตัวตน (เฉพาะเคสสัญญา/วงเงินสูง)',
      labelEn: 'Identity evidence (contract/high-value cases only)',
      required: false,
      documentType: 'personal_id',
      complete: hasDocument(documents, 'personal_id'),
    });
  }

  if (recommendsBankAccount) {
    items.push({
      key: 'bank_account',
      labelTh: 'หลักฐานบัญชีรับเงิน / ข้อมูลจ่ายเงิน',
      labelEn: 'Bank account or payee evidence',
      required: false,
      documentType: 'bank_account',
      complete: hasDocument(documents, 'bank_account'),
    });
  }

  const requiredItems = items.filter((item) => item.required);
  const missingRequiredCount = requiredItems.filter((item) => !item.complete).length;
  const recommendedMissingCount = items.filter((item) => !item.required && !item.complete).length;
  const requiredDocItems = requiredItems.filter((item) => item.documentType);
  const anyRequiredDocsUploaded = requiredDocItems.some((item) => item.complete);

  const status: CustomerVerificationStatus = requiredItems.length <= 1 && useCase === 'general'
    ? 'not_required'
    : missingRequiredCount === 0
      ? 'complete'
      : anyRequiredDocsUploaded
        ? 'partial'
        : 'missing';

  const vatEvidenceItem = items.find((item) => item.documentType === 'vat_certificate');
  const vatEvidenceStatus: CustomerVatEvidenceStatus = !vatEvidenceItem
    ? 'not_required'
    : vatEvidenceItem.complete
      ? documents.some((doc) => doc.documentType === 'vat_certificate' && doc.status === 'verified') ? 'verified' : 'uploaded'
      : 'missing';

  return { status, vatEvidenceStatus, missingRequiredCount, recommendedMissingCount, items };
}
