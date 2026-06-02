export type Language = 'th' | 'en' | 'both';

export type UserRole = 'super_admin' | 'admin' | 'accountant' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  auth?: {
    hasPassword: boolean;
    hasGoogle: boolean;
  };
  company?: {
    nameTh: string;
    nameEn?: string | null;
    taxId: string;
  };
  line?: {
    linked: boolean;
    displayName?: string | null;
    pictureUrl?: string | null;
  };
  legal?: {
    acceptedVersion: string | null;
    currentVersion: string;
    reConsentRequired: boolean;
  };
}

export interface BankAccountProfile {
  id: string;
  label: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string | null;
  promptPayId?: string | null;
  isDefault?: boolean;
  sortOrder?: number;
}

export interface SignatureProfile {
  signatureImageUrl?: string | null;
  signerName?: string | null;
  signerTitle?: string | null;
  securityNote?: string | null;
  updatedAt?: string | null;
}

/** Subset of Company returned by GET /api/company/profile */
export interface CompanyProfile {
  nameTh: string;
  nameEn?: string;
  taxId: string;
  branchCode: string;
  branchNameTh?: string;
  addressTh: string;
  addressEn?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  electronicInvoicingReady?: boolean;
  documentBankAccounts?: BankAccountProfile[];
  documentSignatureProfile?: SignatureProfile | null;
}

export interface Company {
  id: string;
  nameTh: string;
  nameEn: string;
  taxId: string;
  branchCode: string;
  branchName: string;
  addressTh: string;
  addressEn: string;
  phone: string;
  email: string;
  website?: string;
  logoUrl?: string;
}

export interface Customer {
  id: string;
  companyId: string;
  partyRole?: CustomerPartyRole;
  customerKind?: CustomerKind;
  useCase?: CustomerUseCase;
  verificationStatus?: CustomerVerificationStatus;
  vatEvidenceStatus?: CustomerVatEvidenceStatus;
  nameTh: string;
  nameEn?: string;
  taxId: string;
  branchCode?: string;
  branchNameTh?: string;
  branchNameEn?: string;
  addressTh: string;
  addressEn?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  personalId?: string;   // เลขประจำตัว 13 หลักสำหรับบุคคลธรรมดา
  creditLimit?: number | string | null;
  creditDays?: number | null;
  isActive: boolean;
  createdAt: string;
  documents?: CustomerDocument[];
  readiness?: CustomerReadinessSummary;
}

export type CustomerPartyRole = 'customer' | 'supplier' | 'both';
export type CustomerKind = 'company' | 'individual';
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

export interface CustomerDocument {
  id: string;
  companyId: string;
  customerId: string;
  uploadedById?: string | null;
  documentType: CustomerDocumentType;
  requiredFor: CustomerUseCase | string;
  status: 'uploaded' | 'verified' | 'rejected';
  fileName: string;
  mimeType: string;
  fileSize: number;
  driveFileId?: string | null;
  driveUrl?: string | null;
  driveFolderId?: string | null;
  driveFolderUrl?: string | null;
  driveUserDrive?: boolean;
  sensitive?: boolean;
  notes?: string | null;
  uploadedAt: string;
  verifiedAt?: string | null;
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

export interface CustomerStatementEntry {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate?: string | null;
  total: number;
  signedTotal: number;
  paidAmount: number;
  outstandingAmount: number;
  runningBalance: number;
  isPaid: boolean;
  ageDays: number;
  rdSubmissionStatus?: RDSubmissionStatus;
  paymentCount: number;
}

export interface CustomerStatementSummary {
  totalDocuments: number;
  openInvoices: number;
  totalOutstanding: number;
  overdueOutstanding: number;
  currentOutstanding: number;
  totalBilled: number;
  totalCredits: number;
  totalReceived: number;
}

export interface CustomerStatementAging {
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
}

export interface CustomerStatement {
  customer: Customer;
  summary: CustomerStatementSummary;
  aging: CustomerStatementAging;
  entries: CustomerStatementEntry[];
  generatedAt: string;
}

export interface Product {
  id: string;
  companyId: string;
  code: string;
  nameTh: string;
  nameEn?: string;
  descriptionTh?: string;
  descriptionEn?: string;
  unit: string;
  unitPrice: number;
  vatType: 'vat7' | 'vatExempt' | 'vatZero';
  productType: 'product' | 'service' | 'fee' | 'shipping' | 'discount' | 'deposit';
  category?: string | null;
  accountCode?: string | null;
  unitCost?: number | null;
  defaultWhtRate?: '1' | '3' | '5' | null;
  internalNote?: string | null;
  isActive: boolean;
  // Inventory (opt-in)
  trackInventory?: boolean;
  currentStock?: number;
  reorderPoint?: number | null;
}

export type SalesChannel = 'shopee' | 'lazada' | 'tiktok' | 'line_shopping' | 'shopify' | 'woocommerce' | 'pos' | 'other';

export interface ProductChannelMapping {
  id: string;
  productId: string;
  channel: SalesChannel;
  externalSku: string;
  externalProductId?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface MarketplaceConnectionInfo {
  channel: SalesChannel;
  label: string;
  readiness: 'available' | 'coming_soon' | 'planned';
  status: 'disconnected' | 'connected' | 'error';
  shopName?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

export type CompanyDocumentType = 'por_por_20' | 'company_cert' | 'bank_book' | 'company_profile' | 'catalog' | 'other';

export interface CompanyDocument {
  id: string;
  docType: CompanyDocumentType;
  label?: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  attachByDefault: boolean;
  createdAt: string;
}

export interface InvoiceItem {
  id?: string;
  productId?: string;
  nameTh: string;
  nameEn?: string;
  descriptionTh?: string;
  descriptionEn?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  vatType: 'vat7' | 'vatExempt' | 'vatZero';
  vatAmount: number;
  amount: number;
  totalAmount: number;
}

export type InvoiceType = 'tax_invoice' | 'tax_invoice_receipt' | 'receipt' | 'credit_note' | 'debit_note';
export type InvoiceStatus = 'draft' | 'pending' | 'approved' | 'submitted' | 'rejected' | 'cancelled';
export type RDSubmissionStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'retrying';

// ── Quotation (ใบเสนอราคา) ───────────────────────────────────────────
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'converted' | 'rejected' | 'expired' | 'cancelled';

export interface QuotationItem {
  id?: string;
  productId?: string | null;
  sectionTitle?: string | null;
  nameTh: string;
  nameEn?: string | null;
  descriptionTh?: string | null;
  descriptionEn?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountAmount: number;
  vatType: 'vat7' | 'vatExempt' | 'vatZero';
  amount: number;
  vatAmount: number;
  totalAmount: number;
}

export interface Quotation {
  id: string;
  companyId: string;
  projectId?: string | null;
  quotationNumber: string;
  status: QuotationStatus;
  language: Language;
  kind: 'general' | 'service' | 'service_project' | 'boq_contract' | 'recurring_rental' | 'logistics_import_export';
  serviceDetails?: {
    scope?: string | null;
    deliverables?: string | null;
    exclusions?: string | null;
    duration?: string | null;
    warranty?: string | null;
    depositPercent?: number | null;
    revisionRounds?: number | null;
    revisionTerms?: string | null;
    contractDuration?: string | null;
    billingCycle?: string | null;
    sla?: string | null;
    cancellationTerms?: string | null;
    securityDeposit?: number | null;
    origin?: string | null;
    destination?: string | null;
    incoterms?: string | null;
    shipmentMode?: string | null;
    cargoDetails?: string | null;
    currency?: string | null;
    exchangeRate?: number | null;
    freightCharge?: number | null;
    localCharge?: number | null;
    customsFee?: number | null;
    insurance?: number | null;
    milestones?: Array<{ title: string; amount: number; dueDate?: string | null; note?: string | null }>;
  } | null;
  quotationDate: string;
  validUntil?: string | null;
  buyerId: string;
  buyer?: { id: string; nameTh: string; nameEn?: string | null; taxId: string };
  items: QuotationItem[];
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  feePercent?: number | null;
  feeLabel?: string | null;
  whtRate?: string | null;
  total: number;
  revisionRootId?: string | null;
  revisionNo?: number;
  revisionCount?: number;
  revisionHistory?: Array<{
    id: string;
    quotationNumber: string;
    status: QuotationStatus;
    revisionNo: number;
    supersededById?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  latestRevisionId?: string | null;
  supersededById?: string | null;
  supersededAt?: string | null;
  notes?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  attachmentDocumentIds?: string[];
  templateId?: string | null;
  convertedToInvoiceId?: string | null;
  convertedAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Delivery Note (ใบส่งของ) ─────────────────────────────────────────
export type DeliveryNoteStatus = 'draft' | 'issued' | 'delivered' | 'converted' | 'cancelled';

export interface DeliveryNoteItem {
  id?: string;
  productId?: string | null;
  nameTh: string;
  nameEn?: string | null;
  descriptionTh?: string | null;
  descriptionEn?: string | null;
  quantity: number;
  deliveredQty: number;
  unit: string;
  unitPrice?: number | null;
  vatType: 'vat7' | 'vatExempt' | 'vatZero';
  amount?: number | null;
}

export interface DeliveryNote {
  id: string;
  companyId: string;
  projectId?: string | null;
  deliveryNoteNumber: string;
  status: DeliveryNoteStatus;
  language: Language;
  deliveryDate: string;
  expectedDate?: string | null;
  deliveredAt?: string | null;
  buyerId: string;
  buyer?: { id: string; nameTh: string; nameEn?: string | null; taxId: string };
  items: DeliveryNoteItem[];
  shippingAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  vehicleNo?: string | null;
  trackingNo?: string | null;
  notes?: string | null;
  deliveryTerms?: string | null;
  quotationId?: string | null;
  invoiceId?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Recurring Invoice (ใบแจ้งหนี้ซ้ำ) ────────────────────────────────
export type RecurringInvoiceStatus = 'active' | 'paused' | 'ended' | 'cancelled';
export type RecurringInvoiceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringInvoiceItem {
  id?: string;
  productId?: string | null;
  nameTh: string;
  nameEn?: string | null;
  descriptionTh?: string | null;
  descriptionEn?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountAmount: number;
  vatType: 'vat7' | 'vatExempt' | 'vatZero';
}

export interface RecurringInvoiceRun {
  id: string;
  recurringInvoiceId: string;
  companyId: string;
  invoiceId?: string | null;
  scheduledFor: string;
  generatedAt: string;
  status: string;
  error?: string | null;
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: number;
    status: InvoiceStatus;
    invoiceDate: string;
  } | null;
}

export interface RecurringInvoice {
  id: string;
  companyId: string;
  projectId?: string | null;
  customerId: string;
  customer?: { id: string; nameTh: string; nameEn?: string | null; taxId: string; creditDays?: number | null };
  name: string;
  status: RecurringInvoiceStatus;
  frequency: RecurringInvoiceFrequency;
  interval: number;
  language: Language;
  invoiceType: InvoiceType;
  startDate: string;
  nextRunDate: string;
  endDate?: string | null;
  dueDays?: number | null;
  maxRuns?: number | null;
  runCount: number;
  lastRunAt?: string | null;
  discountAmount: number;
  notes?: string | null;
  paymentMethod?: string | null;
  items: RecurringInvoiceItem[];
  runs?: RecurringInvoiceRun[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  companyId: string;
  projectId?: string | null;
  project?: { id: string; code: string; name: string } | null;
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  language: Language;
  invoiceDate: string;
  dueDate?: string;
  seller: Company;
  buyer: Customer;
  items: InvoiceItem[];
  subtotal: number;
  vatAmount: number;
  discount: number;
  total: number;
  notes?: string;
  paymentMethod?: string;
  templateId?: string | null;
  documentMode?: 'ordinary' | 'electronic' | null;
  bankPaymentInfo?: string | null;
  showCompanyLogo?: boolean;
  documentLogoUrl?: string | null;
  signatureImageUrl?: string | null;
  signerName?: string | null;
  signerTitle?: string | null;
  referenceDocNumber?: string;
  referenceInvoiceId?: string;
  // Payment tracking
  isPaid: boolean;
  paidAt?: string;
  paidAmount?: number;
  rdSubmissionStatus?: RDSubmissionStatus;
  rdDocId?: string;
  rdSubmittedAt?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  // WHT (Withholding Tax / ภาษีหัก ณ ที่จ่าย / 50 ทวิ)
  whtAmount?: number;
  whtRate?: '1' | '3' | '5' | null;
  whtCertificateId?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface WhtCertificate {
  id: string;
  companyId: string;
  invoiceId?: string | null;
  certificateNumber: string;
  whtRate: '1' | '3' | '5';
  whtAmount: number;
  totalAmount: number;
  netAmount: number;
  recipientName: string;
  recipientTaxId: string;
  recipientBranch: string;
  incomeType: '1' | '2' | '4';
  paymentDate: string;
  pdfUrl?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhtSummaryData {
  period: string;
  totalCertificates: number;
  totalWithheld: number;
  totalAmount: number;
  byRate: Array<{
    rate: string;
    label: string;
    count: number;
    totalWithheld: number;
    totalAmount: number;
  }>;
  certificates: Array<{
    id: string;
    certificateNumber: string;
    whtRate: string;
    whtAmount: number;
    totalAmount: number;
    recipientName: string;
    recipientTaxId: string;
    paymentDate: string;
  }>;
}

export interface PurchaseInvoice {
  id: string;
  projectId?: string | null;
  supplierName: string;
  supplierTaxId: string;
  supplierBranch?: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  subtotal: number;
  vatAmount: number;
  total: number;
  vatType: 'vat7' | 'vatExempt' | 'vatZero';
  description?: string | null;
  category?: string | null;
  notes?: string | null;
  pdfUrl?: string | null;
  isPaid: boolean;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentIntake {
  id: string;
  projectId?: string | null;
  source: string;
  mimeType: string;
  fileSize: number;
  fileName?: string | null;
  fileUrl?: string | null;
  status: 'received' | 'processing' | 'awaiting_input' | 'awaiting_confirmation' | 'saved' | 'needs_review' | 'failed' | 'rejected' | string;
  ocrResult?: {
    documentType?: string;
    documentTypeLabel?: string;
    supplierName?: string;
    supplierTaxId?: string;
    supplierBranch?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    subtotal?: number;
    vatAmount?: number;
    total?: number;
    confidence?: 'high' | 'medium' | 'low';
    validationWarnings?: string[];
    expenseCategory?: string;
    expenseSubcategory?: string;
    taxTreatment?: string;
    postingSuggestion?: string;
    documentMetadata?: {
      buyerName?: string;
      sellerName?: string;
      description?: string;
      purchaseOrderNumber?: string;
      quotationNumber?: string;
      deliveryNoteNumber?: string;
      dueDate?: string;
    };
  } | null;
  warnings?: string[] | null;
  error?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  purchaseInvoiceId?: string | null;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseVoucherStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type AttachmentFileType = 'image' | 'pdf' | 'link';
export type EvidenceType = 'receipt' | 'chat' | 'map' | 'other';

export interface ExpenseAttachment {
  id: string;
  fileName?: string | null;
  fileType: AttachmentFileType;
  url: string;
  evidenceType: EvidenceType;
  createdAt: string;
}

export interface ExpenseItem {
  id: string;
  description: string;
  category?: string | null;
  amount: number;
  date: string;
  notes?: string | null;
  vendorName?: string | null;
  vendorTaxId?: string | null;
  whtApplicable: boolean;
  whtRate?: number | null;
  whtAmount?: number | null;
  netAmount?: number | null;
  attachments: ExpenseAttachment[];
}

export interface PettyCash {
  balance: number;
  cashierId?: string | null;
}

export interface ApprovalLog {
  id: string;
  expenseId: string;
  action: ExpenseVoucherStatus;
  byUserId: string;
  note?: string | null;
  timestamp: string;
}

export interface ExpenseVoucher {
  id: string;
  projectId?: string | null;
  project?: { id: string; code: string; name: string } | null;
  voucherNumber: string;
  status: ExpenseVoucherStatus;
  voucherDate: string;
  description?: string | null;
  notes?: string | null;
  totalAmount: number;
  canApprove?: boolean;
  budgetGuard?: {
    project: { id: string; code: string; name: string };
    budgetAmount: number;
    committedAmount: number;
    remainingAmount: number;
    overBudgetAmount: number;
    isOverBudget: boolean;
  } | null;
  itemCount?: number;
  items?: ExpenseItem[];
  approvalLogs?: ApprovalLog[];
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionNote?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VatSummaryByType {
  vat7: { totalExclVat: number; vatAmount: number; count: number };
  vatExempt: { totalExclVat: number; vatAmount: number; count: number };
  vatZero: { totalExclVat: number; vatAmount: number; count: number };
}

export interface VatSummaryData {
  period: { from: string; to: string };
  sales: {
    count: number;
    totalExclVat: number;
    outputVat: number;
    totalInclVat: number;
    byVatType: VatSummaryByType;
  };
  purchases: {
    count: number;
    totalExclVat: number;
    inputVat: number;
    totalInclVat: number;
    byVatType: VatSummaryByType;
  };
  vatPayable: number;
}

export interface Pp30Data {
  period: { year: number; month: number; label: string };
  company: { nameTh: string; nameEn?: string | null; taxId: string; branchCode?: string | null; branchNameTh?: string | null };
  sales: {
    byVatType: VatSummaryByType;
    totalExclVat: number;
    outputVat: number;
    totalInclVat: number;
  };
  purchases: {
    byVatType: VatSummaryByType;
    totalExclVat: number;
    inputVat: number;
    totalInclVat: number;
  };
  vatPayable: number;
}

export interface DocumentTemplateOption {
  id: string;
  name: string;
  type: InvoiceType;
  language: Language;
  isActive: boolean;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: 'cash' | 'transfer' | 'cheque' | 'credit_card' | 'other';
  reference?: string;
  paidAt: string;
  note?: string;
  createdBy: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  companyId: string;
  userId: string;
  userName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  language: Language;
  createdAt: string;
}

export interface InvoiceSummary {
  totalInvoices: number;
  totalRevenue: number;
  pendingCount: number;
  submittedCount: number;
  draftCount: number;
  rejectedCount: number;
}

export interface CompanyAccessPolicy {
  plan: 'free' | 'starter' | 'business' | 'enterprise';
  planLabel: string;
  subscriptionStatus: string;
  isSubscriptionActive: boolean;
  isPaidPlan: boolean;
  canCreateInvoice: boolean;
  canSubmitToRD: boolean;
  canManageCertificate: boolean;
  canManageRDConfig: boolean;
  canUseCustomTemplates: boolean;
  canViewAuditLogs: boolean;
  canExportExcel: boolean;
  canExportGoogleSheets: boolean;
  canInviteUsers: boolean;
  canSendInvoiceEmail: boolean;
  canUseBillingPortal: boolean;
  canUseLineOa: boolean;
  canUseProjects: boolean;
  canUseProjectDriveFolders: boolean;
  maxUsers: number | null;
  maxDocumentsPerMonth: number | null;
  maxCustomers: number | null;
  maxProducts: number | null;
  maxProjects: number | null;
  maxLineGroups: number | null;
  includedTeamSeats: number | null;
  extraTeamSeatMonthlyThb: number | null;
  extraOcrDocumentThb: number | null;
  usage: {
    documentsThisMonth: number;
    users: number;
    customers: number;
    products: number;
    projects: number;
    lineGroups: number;
  };
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateInvoiceDto {
  type: InvoiceType;
  language: Language;
  invoiceDate: string;
  dueDate?: string;
  customerId: string;
  items: Omit<InvoiceItem, 'id' | 'vatAmount' | 'amount' | 'totalAmount'>[];
  discount?: number;
  notes?: string;
  paymentMethod?: string;
  referenceInvoiceId?: string;
  referenceDocNumber?: string;
}
