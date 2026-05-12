import { ExternalLink, Table2 } from 'lucide-react';
import { MetricCard } from '../ui/AppChrome';

export interface MonthEndWorkspace {
  period: string;
  summary: {
    inputVat: number;
    outputVat: number;
    expenses: number;
    missingDocuments: number;
    projectCount: number;
    vatPayable: number;
  };
  tabs: {
    inputVat: Array<Record<string, unknown>>;
    outputVat: Array<Record<string, unknown>>;
    expenses: Array<Record<string, unknown>>;
    missingDocs: Array<Record<string, unknown>>;
    projectSummary: Array<Record<string, unknown>>;
  };
}

interface MonthEndWorkspacePreviewProps {
  workspace: MonthEndWorkspace;
  title: string;
  description: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  formatCurrency: (value: number) => string;
  isThai: boolean;
  showSummary?: boolean;
}

function buildMonthEndTabs(workspace: MonthEndWorkspace, isThai: boolean) {
  return [
    {
      id: 'inputVat',
      label: isThai ? 'ภาษีซื้อ' : 'Input VAT',
      columns: [
        { key: 'date', label: isThai ? 'วันที่' : 'Date', type: 'date' as const },
        { key: 'supplier', label: isThai ? 'ผู้ขาย' : 'Supplier' },
        { key: 'documentNo', label: isThai ? 'เลขเอกสาร' : 'Doc no.' },
        { key: 'project', label: isThai ? 'โปรเจค/บริษัท' : 'Project/company' },
        { key: 'category', label: isThai ? 'หมวด' : 'Category' },
        { key: 'subtotal', label: isThai ? 'ก่อน VAT' : 'Subtotal', type: 'currency' as const },
        { key: 'vat', label: 'VAT', type: 'currency' as const },
        { key: 'total', label: isThai ? 'รวม' : 'Total', type: 'currency' as const },
        { key: 'taxStatus', label: isThai ? 'สถานะภาษี' : 'Tax status' },
        { key: 'attachmentUrl', label: isThai ? 'ไฟล์' : 'File', type: 'link' as const },
      ],
      rows: workspace.tabs.inputVat,
    },
    {
      id: 'outputVat',
      label: isThai ? 'ภาษีขาย' : 'Output VAT',
      columns: [
        { key: 'date', label: isThai ? 'วันที่' : 'Date', type: 'date' as const },
        { key: 'buyer', label: isThai ? 'ลูกค้า' : 'Buyer' },
        { key: 'documentNo', label: isThai ? 'เลขเอกสาร' : 'Doc no.' },
        { key: 'project', label: isThai ? 'โปรเจค/บริษัท' : 'Project/company' },
        { key: 'status', label: isThai ? 'สถานะ' : 'Status' },
        { key: 'subtotal', label: isThai ? 'ก่อน VAT' : 'Subtotal', type: 'currency' as const },
        { key: 'vat', label: 'VAT', type: 'currency' as const },
        { key: 'total', label: isThai ? 'รวม' : 'Total', type: 'currency' as const },
        { key: 'attachmentUrl', label: isThai ? 'ไฟล์' : 'File', type: 'link' as const },
      ],
      rows: workspace.tabs.outputVat,
    },
    {
      id: 'expenses',
      label: isThai ? 'ค่าใช้จ่าย' : 'Expenses',
      columns: [
        { key: 'date', label: isThai ? 'วันที่' : 'Date', type: 'date' as const },
        { key: 'voucherNo', label: isThai ? 'เลข PV' : 'Voucher' },
        { key: 'project', label: isThai ? 'โปรเจค/บริษัท' : 'Project/company' },
        { key: 'category', label: isThai ? 'หมวด' : 'Category' },
        { key: 'description', label: isThai ? 'รายละเอียด' : 'Description' },
        { key: 'amount', label: isThai ? 'ยอด' : 'Amount', type: 'currency' as const },
        { key: 'status', label: isThai ? 'สถานะ' : 'Status' },
        { key: 'attachmentUrl', label: isThai ? 'ไฟล์' : 'File', type: 'link' as const },
      ],
      rows: workspace.tabs.expenses,
    },
    {
      id: 'missingDocs',
      label: isThai ? 'ต้องตรวจ' : 'Missing docs',
      columns: [
        { key: 'date', label: isThai ? 'วันที่' : 'Date', type: 'date' as const },
        { key: 'fileName', label: isThai ? 'ไฟล์' : 'File' },
        { key: 'project', label: isThai ? 'โปรเจค/บริษัท' : 'Project/company' },
        { key: 'source', label: isThai ? 'ที่มา' : 'Source' },
        { key: 'status', label: isThai ? 'สถานะ' : 'Status' },
        { key: 'drive', label: 'Drive' },
        { key: 'issue', label: isThai ? 'สิ่งที่ต้องทำ' : 'Issue' },
        { key: 'attachmentUrl', label: isThai ? 'เปิด' : 'Open', type: 'link' as const },
      ],
      rows: workspace.tabs.missingDocs,
    },
    {
      id: 'projectSummary',
      label: isThai ? 'สรุปโปรเจค' : 'Project summary',
      columns: [
        { key: 'project', label: isThai ? 'โปรเจค' : 'Project' },
        { key: 'status', label: isThai ? 'สถานะ' : 'Status' },
        { key: 'budget', label: isThai ? 'งบ' : 'Budget', type: 'currency' as const },
        { key: 'revenue', label: isThai ? 'รายรับ' : 'Revenue', type: 'currency' as const },
        { key: 'actual', label: isThai ? 'ใช้จริง' : 'Actual', type: 'currency' as const },
        { key: 'balance', label: isThai ? 'เหลือ' : 'Balance', type: 'currency' as const },
        { key: 'forecastProfit', label: isThai ? 'กำไรคาดการณ์' : 'Forecast profit', type: 'currency' as const },
        { key: 'files', label: isThai ? 'ไฟล์' : 'Files' },
      ],
      rows: workspace.tabs.projectSummary,
    },
  ];
}

export function MonthEndWorkspacePreview({
  workspace,
  title,
  description,
  activeTab,
  onTabChange,
  formatCurrency,
  isThai,
  showSummary = true,
}: MonthEndWorkspacePreviewProps) {
  const tabs = buildMonthEndTabs(workspace, isThai);
  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const formatCell = (value: unknown, type?: 'currency' | 'date' | 'link' | 'text') => {
    if (type === 'currency') return formatCurrency(Number(value ?? 0));
    if (type === 'date' && value) return new Date(String(value)).toLocaleDateString(isThai ? 'th-TH' : 'en-GB');
    if (value === null || value === undefined || value === '') return '-';
    return String(value);
  };

  return (
    <div className="space-y-4">
      {showSummary && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: isThai ? 'ภาษีขายเดือนนี้' : 'Output VAT', value: formatCurrency(workspace.summary.outputVat), tone: 'primary' as const },
            { label: isThai ? 'ภาษีซื้อเดือนนี้' : 'Input VAT', value: formatCurrency(workspace.summary.inputVat), tone: 'success' as const },
            { label: isThai ? 'ภาษีสุทธิ' : 'Net VAT', value: formatCurrency(workspace.summary.vatPayable), tone: workspace.summary.vatPayable > 0 ? 'warning' as const : 'success' as const },
            { label: isThai ? 'เอกสารต้องตรวจ' : 'Needs review', value: workspace.summary.missingDocuments.toLocaleString(), tone: workspace.summary.missingDocuments > 0 ? 'warning' as const : 'success' as const },
          ].map((item) => (
            <MetricCard
              key={item.label}
              label={item.label}
              value={item.value}
              detail={isThai ? `รอบ ${workspace.period}` : `Period ${workspace.period}`}
              tone={item.tone}
            />
          ))}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <Table2 className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-slate-950">{title}</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <span className="inline-flex w-fit rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
            {isThai ? 'Preview จากข้อมูล Billboy' : 'Preview from Billboy data'}
          </span>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${current.id === tab.id ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-100' : 'text-slate-500 hover:bg-white hover:text-slate-800'}`}
            >
              {tab.label}
              <span className="ml-1 text-[11px] text-slate-400">{tab.rows.length}</span>
            </button>
          ))}
        </div>
        <div className="max-h-[360px] overflow-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                {current.columns.map((column) => (
                  <th key={column.key} className="border-b border-r border-slate-200 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {current.rows.length === 0 ? (
                <tr>
                  <td colSpan={current.columns.length} className="px-4 py-8 text-center text-sm text-slate-500">
                    {isThai ? 'ยังไม่มีข้อมูลในตารางนี้' : 'No rows in this sheet yet'}
                  </td>
                </tr>
              ) : current.rows.slice(0, 40).map((row, index) => (
                <tr key={String(row.id ?? index)} className="odd:bg-white even:bg-slate-50/60">
                  {current.columns.map((column) => {
                    const value = row[column.key];
                    const href = column.type === 'link' ? String(value ?? '') : '';
                    return (
                      <td key={column.key} className="max-w-[260px] truncate border-b border-r border-slate-100 px-3 py-2 text-slate-700">
                        {column.type === 'link' && href ? (
                          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:text-primary-800">
                            {isThai ? 'เปิดไฟล์' : 'Open'}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          formatCell(value, column.type)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
