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
  personalId?: string;   // เลขบัตรประชาชน 13 หลัก (Easy e-Receipt)
  isActive: boolean;
  createdAt: string;
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
  isActive: boolean;
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

export interface Invoice {
  id: string;
  companyId: string;
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
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface PurchaseInvoice {
  id: string;
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
  source: string;
  mimeType: string;
  fileSize: number;
  fileName?: string | null;
  fileUrl?: string | null;
  status: 'received' | 'processing' | 'saved' | 'needs_review' | 'failed' | string;
  ocrResult?: {
    documentType?: string;
    documentTypeLabel?: string;
    supplierName?: string;
    supplierTaxId?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    total?: number;
    confidence?: 'high' | 'medium' | 'low';
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
  maxUsers: number | null;
  maxDocumentsPerMonth: number | null;
  maxCustomers: number | null;
  maxProducts: number | null;
  usage: {
    documentsThisMonth: number;
    users: number;
    customers: number;
    products: number;
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
