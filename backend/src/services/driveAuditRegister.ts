type NullableString = string | null | undefined;

export interface EvidenceLinkInput {
  driveUrl?: NullableString;
  s3Url?: NullableString;
  fileUrl?: NullableString;
  pdfUrl?: NullableString;
  url?: NullableString;
}

export interface PartyDocumentInput extends EvidenceLinkInput {
  documentType?: NullableString;
  status?: NullableString;
  driveFolderUrl?: NullableString;
}

export interface PartyDirectoryInput {
  nameTh?: NullableString;
  nameEn?: NullableString;
  taxId?: NullableString;
  useCase?: NullableString;
  verificationStatus?: NullableString;
  partyRole?: NullableString;
  documents?: PartyDocumentInput[];
}

export interface PartyDirectoryRow {
  name: string;
  taxId: string;
  useCase: string;
  documentType: string;
  status: string;
  readiness: string;
  attachmentUrl: string | null;
  folderUrl: string | null;
}

export interface ProjectRollupInput {
  code: string;
  name: string;
  status: string;
  budgetAmount?: unknown;
  driveFolderUrl?: NullableString;
  invoices?: Array<{ total?: number | null; status?: NullableString }>;
  purchaseInvoices?: Array<{ total?: number | null }>;
  expenseVouchers?: Array<{ totalAmount?: unknown; status?: NullableString }>;
  documentIntakes?: Array<{ driveUrl?: NullableString; driveSyncStatus?: NullableString }>;
}

export interface ProjectRollupRow {
  project: string;
  status: string;
  budget: number;
  revenue: number;
  actual: number;
  balance: number;
  forecastProfit: number;
  files: string;
  folderUrl: string | null;
}

export function preferredDriveFirstUrl(input: EvidenceLinkInput | null | undefined): string | null {
  if (!input) return null;
  return input.driveUrl ?? input.s3Url ?? input.fileUrl ?? input.pdfUrl ?? input.url ?? null;
}

function partyMatchesRole(partyRole: NullableString, targetRole: 'customer' | 'supplier') {
  if (partyRole === 'both') return true;
  return partyRole === targetRole;
}

export function buildPartyDirectoryRows(
  parties: PartyDirectoryInput[],
  targetRole: 'customer' | 'supplier',
): PartyDirectoryRow[] {
  return parties
    .filter((party) => partyMatchesRole(party.partyRole, targetRole))
    .flatMap((party) => {
      const base = {
        name: party.nameTh || party.nameEn || '',
        taxId: party.taxId ?? '',
        useCase: party.useCase ?? '',
        readiness: party.verificationStatus ?? '',
      };
      const docs = party.documents ?? [];
      if (docs.length === 0) {
        return [{
          ...base,
          documentType: '',
          status: '',
          attachmentUrl: null,
          folderUrl: null,
        }];
      }
      return docs.map((doc) => ({
        ...base,
        documentType: doc.documentType ?? '',
        status: doc.status ?? '',
        attachmentUrl: preferredDriveFirstUrl(doc),
        folderUrl: doc.driveFolderUrl ?? null,
      }));
    });
}

export function buildProjectRollupRows(projects: ProjectRollupInput[]): ProjectRollupRow[] {
  return projects.map((project) => {
    const invoices = project.invoices ?? [];
    const purchaseInvoices = project.purchaseInvoices ?? [];
    const expenseVouchers = project.expenseVouchers ?? [];
    const documentIntakes = project.documentIntakes ?? [];
    const revenue = invoices
      .filter((invoice) => invoice.status !== 'cancelled' && invoice.status !== 'rejected')
      .reduce((sum, invoice) => sum + (invoice.total ?? 0), 0);
    const purchaseCost = purchaseInvoices.reduce((sum, purchase) => sum + (purchase.total ?? 0), 0);
    const expenseCost = expenseVouchers
      .filter((voucher) => voucher.status !== 'rejected')
      .reduce((sum, voucher) => sum + Number(voucher.totalAmount ?? 0), 0);
    const actual = purchaseCost + expenseCost;
    const budget = Number(project.budgetAmount ?? 0);
    const syncedFiles = documentIntakes.filter((item) => item.driveUrl || item.driveSyncStatus === 'synced').length;
    const totalFiles = documentIntakes.length;

    return {
      project: `${project.code} ${project.name}`,
      status: project.status,
      budget,
      revenue,
      actual,
      balance: budget - actual,
      forecastProfit: revenue - actual,
      files: totalFiles > 0 ? `${syncedFiles}/${totalFiles} synced` : '',
      folderUrl: project.driveFolderUrl ?? null,
    };
  });
}
