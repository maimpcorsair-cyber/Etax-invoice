import prisma from '../config/database';
import { withRlsContext } from '../config/rls';

export type EffectivePlan = 'free' | 'starter' | 'business' | 'enterprise';
export type AccessFeature =
  | 'create_invoice'
  | 'submit_rd'
  | 'manage_certificate'
  | 'manage_rd_config'
  | 'custom_templates'
  | 'view_audit_logs'
  | 'export_excel'
  | 'export_google_sheets'
  | 'invite_users'
  | 'send_invoice_email'
  | 'billing_portal';

export type UsageLimitedResource = 'documents' | 'customers' | 'products' | 'users' | 'projects' | 'lineGroups';

export interface CompanyAccessPolicy {
  plan: EffectivePlan;
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

type PlanDefinition = Omit<CompanyAccessPolicy, 'usage' | 'subscriptionStatus' | 'isSubscriptionActive'>;

const planDefinitions: Record<EffectivePlan, PlanDefinition> = {
  free: {
    plan: 'free',
    planLabel: 'Free',
    isPaidPlan: false,
    canCreateInvoice: true,
    canSubmitToRD: false,
    canManageCertificate: false,
    canManageRDConfig: false,
    canUseCustomTemplates: false,
    canViewAuditLogs: false,
    canExportExcel: false,
    canExportGoogleSheets: false,
    canInviteUsers: false,
    canSendInvoiceEmail: false,
    canUseBillingPortal: false,
    canUseLineOa: true,
    canUseProjects: true,
    canUseProjectDriveFolders: false,
    maxUsers: 1,
    maxDocumentsPerMonth: 20,
    maxCustomers: 50,
    maxProducts: 50,
    maxProjects: 1,
    maxLineGroups: 1,
    includedTeamSeats: 1,
    extraTeamSeatMonthlyThb: null,
    extraOcrDocumentThb: null,
  },
  starter: {
    plan: 'starter',
    planLabel: 'Solo',
    isPaidPlan: true,
    canCreateInvoice: true,
    canSubmitToRD: true,
    canManageCertificate: true,
    canManageRDConfig: true,
    canUseCustomTemplates: false,
    canViewAuditLogs: false,
    canExportExcel: true,
    canExportGoogleSheets: false,
    canInviteUsers: true,
    canSendInvoiceEmail: true,
    canUseBillingPortal: true,
    canUseLineOa: true,
    canUseProjects: true,
    canUseProjectDriveFolders: false,
    maxUsers: 3,
    maxDocumentsPerMonth: 150,
    maxCustomers: 500,
    maxProducts: 500,
    maxProjects: 10,
    maxLineGroups: 3,
    includedTeamSeats: 3,
    extraTeamSeatMonthlyThb: 99,
    extraOcrDocumentThb: 1,
  },
  business: {
    plan: 'business',
    planLabel: 'Team',
    isPaidPlan: true,
    canCreateInvoice: true,
    canSubmitToRD: true,
    canManageCertificate: true,
    canManageRDConfig: true,
    canUseCustomTemplates: true,
    canViewAuditLogs: true,
    canExportExcel: true,
    canExportGoogleSheets: true,
    canInviteUsers: true,
    canSendInvoiceEmail: true,
    canUseBillingPortal: true,
    canUseLineOa: true,
    canUseProjects: true,
    canUseProjectDriveFolders: true,
    maxUsers: 8,
    maxDocumentsPerMonth: 800,
    maxCustomers: 5000,
    maxProducts: 5000,
    maxProjects: 50,
    maxLineGroups: 20,
    includedTeamSeats: 8,
    extraTeamSeatMonthlyThb: 149,
    extraOcrDocumentThb: 0.75,
  },
  enterprise: {
    plan: 'enterprise',
    planLabel: 'Enterprise',
    isPaidPlan: true,
    canCreateInvoice: true,
    canSubmitToRD: true,
    canManageCertificate: true,
    canManageRDConfig: true,
    canUseCustomTemplates: true,
    canViewAuditLogs: true,
    canExportExcel: true,
    canExportGoogleSheets: true,
    canInviteUsers: true,
    canSendInvoiceEmail: true,
    canUseBillingPortal: true,
    canUseLineOa: true,
    canUseProjects: true,
    canUseProjectDriveFolders: true,
    maxUsers: null,
    maxDocumentsPerMonth: null,
    maxCustomers: null,
    maxProducts: null,
    maxProjects: null,
    maxLineGroups: null,
    includedTeamSeats: null,
    extraTeamSeatMonthlyThb: null,
    extraOcrDocumentThb: null,
  },
};

export function getMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function getPlanDefinition(plan: EffectivePlan) {
  return planDefinitions[plan];
}

export function getAccessErrorMessage(feature: AccessFeature, plan: EffectivePlan) {
  const featureMessages: Record<AccessFeature, string> = {
    create_invoice: 'Your current plan cannot create invoices',
    submit_rd: 'Upgrade your plan to submit documents to the Revenue Department',
    manage_certificate: 'Upgrade your plan to upload and manage digital certificates',
    manage_rd_config: 'Upgrade your plan to configure RD credentials',
    custom_templates: 'Upgrade your plan to use custom document templates',
    view_audit_logs: 'Upgrade your plan to access audit logs',
    export_excel: 'Upgrade your plan to export invoice data',
    export_google_sheets: 'Upgrade your plan to export to Google Sheets',
    invite_users: 'Upgrade your plan to invite more users',
    send_invoice_email: 'Upgrade your plan to send invoice emails from the system',
    billing_portal: 'Upgrade your plan to manage billing through the customer portal',
  };

  return `${featureMessages[feature]} (${plan.toUpperCase()} plan)`;
}

export async function resolveCompanyAccessPolicy(companyId: string): Promise<CompanyAccessPolicy> {
  const { subscription, usage } = await withRlsContext(prisma, { companyId, role: 'tenant', systemMode: false }, async (tx) => {
    const [
      subscriptionRecord,
      userCount,
      customerCount,
      productCount,
      invoiceCount,
      purchaseInvoiceCount,
      intakeCount,
      projectCount,
      lineGroupCount,
    ] = await Promise.all([
      tx.companySubscription.findUnique({
        where: { companyId },
        select: { plan: true, status: true },
      }),
        tx.user.count({ where: { companyId, isActive: true } }),
        tx.customer.count({ where: { companyId, isActive: true } }),
        tx.product.count({ where: { companyId, isActive: true } }),
        tx.invoice.count({
          where: {
            companyId,
            createdAt: { gte: getMonthStart() },
          },
        }),
        tx.purchaseInvoice.count({
          where: {
            companyId,
            createdAt: { gte: getMonthStart() },
          },
        }),
        tx.documentIntake.count({
          where: {
            companyId,
            createdAt: { gte: getMonthStart() },
          },
        }),
        tx.project.count({ where: { companyId, status: { not: 'archived' } } }),
        tx.lineGroupLink.count({ where: { companyId, isActive: true } }),
      ]);

    return {
      subscription: subscriptionRecord,
      usage: {
        userCount,
        customerCount,
        productCount,
        documentsThisMonth: invoiceCount + purchaseInvoiceCount + intakeCount,
        projectCount,
        lineGroupCount,
      },
    };
  });

  const isSubscriptionActive = !subscription || ['active', 'trialing'].includes(subscription.status);
  const effectivePlan: EffectivePlan = subscription && isSubscriptionActive
    ? subscription.plan
    : 'free';
  const plan = getPlanDefinition(effectivePlan);

  return {
    ...plan,
    subscriptionStatus: subscription?.status ?? 'free',
    isSubscriptionActive,
    usage: {
      documentsThisMonth: usage.documentsThisMonth,
      users: usage.userCount,
      customers: usage.customerCount,
      products: usage.productCount,
      projects: usage.projectCount,
      lineGroups: usage.lineGroupCount,
    },
  };
}

export function hasFeatureAccess(policy: CompanyAccessPolicy, feature: AccessFeature) {
  switch (feature) {
    case 'create_invoice':
      return policy.canCreateInvoice;
    case 'submit_rd':
      return policy.canSubmitToRD;
    case 'manage_certificate':
      return policy.canManageCertificate;
    case 'manage_rd_config':
      return policy.canManageRDConfig;
    case 'custom_templates':
      return policy.canUseCustomTemplates;
    case 'view_audit_logs':
      return policy.canViewAuditLogs;
    case 'export_excel':
      return policy.canExportExcel;
    case 'export_google_sheets':
      return policy.canExportGoogleSheets;
    case 'invite_users':
      return policy.canInviteUsers;
    case 'send_invoice_email':
      return policy.canSendInvoiceEmail;
    case 'billing_portal':
      return policy.canUseBillingPortal;
    default:
      return false;
  }
}

export function getUsageLimit(policy: CompanyAccessPolicy, resource: UsageLimitedResource) {
  switch (resource) {
    case 'documents':
      return policy.maxDocumentsPerMonth;
    case 'customers':
      return policy.maxCustomers;
    case 'products':
      return policy.maxProducts;
    case 'users':
      return policy.maxUsers;
    case 'projects':
      return policy.maxProjects;
    case 'lineGroups':
      return policy.maxLineGroups;
    default:
      return null;
  }
}

export function getUsageValue(policy: CompanyAccessPolicy, resource: UsageLimitedResource) {
  switch (resource) {
    case 'documents':
      return policy.usage.documentsThisMonth;
    case 'customers':
      return policy.usage.customers;
    case 'products':
      return policy.usage.products;
    case 'users':
      return policy.usage.users;
    case 'projects':
      return policy.usage.projects;
    case 'lineGroups':
      return policy.usage.lineGroups;
    default:
      return 0;
  }
}

export function getLimitErrorMessage(resource: UsageLimitedResource, policy: CompanyAccessPolicy) {
  const labels: Record<UsageLimitedResource, string> = {
    documents: 'monthly document limit',
    customers: 'customer limit',
    products: 'product limit',
    users: 'user limit',
    projects: 'project limit',
    lineGroups: 'LINE group limit',
  };
  const limit = getUsageLimit(policy, resource);
  return `Your company has reached the ${labels[resource]} for the ${policy.planLabel} plan${limit ? ` (${limit})` : ''}`;
}
