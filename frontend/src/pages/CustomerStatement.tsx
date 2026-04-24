import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock3, Download, FileText, Mail, Printer, ReceiptText, TriangleAlert } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { CustomerStatement, InvoiceType } from '../types';

const TYPE_LABELS: Record<InvoiceType, { th: string; en: string }> = {
  tax_invoice: { th: 'ใบกำกับภาษี', en: 'Tax Invoice' },
  tax_invoice_receipt: { th: 'ใบกำกับภาษี/ใบเสร็จ', en: 'Tax Inv/Receipt' },
  receipt: { th: 'ใบเสร็จรับเงิน', en: 'Receipt' },
  credit_note: { th: 'ใบลดหนี้', en: 'Credit Note' },
  debit_note: { th: 'ใบเพิ่มหนี้', en: 'Debit Note' },
};

export default function CustomerStatementPage() {
  const { id } = useParams();
  const { token } = useAuthStore();
  const { isThai, formatCurrency, formatDate } = useLanguage();
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !token) return;
    let active = true;

    async function loadStatement() {
      setLoading(true);
      setError(null);
      setInfoMessage(null);
      try {
        const res = await fetch(`/api/customers/${id}/statement`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { data?: CustomerStatement; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed to load statement');
        if (active) setStatement(json.data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load statement');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadStatement();
    return () => { active = false; };
  }, [id, token]);

  const outstandingRows = useMemo(
    () => statement?.entries.filter((entry) => entry.outstandingAmount > 0) ?? [],
    [statement],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          {isThai ? 'กำลังโหลด Statement of Account...' : 'Loading statement of account...'}
        </div>
      </div>
    );
  }

  if (error || !statement) {
    return (
      <div className="space-y-4">
        <Link to="/app/customers" className="inline-flex items-center gap-2 text-sm text-primary-700 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          {isThai ? 'กลับไปหน้าลูกค้า' : 'Back to customers'}
        </Link>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error ?? (isThai ? 'ไม่พบข้อมูล statement' : 'Statement not found')}
        </div>
      </div>
    );
  }

  const { customer, summary, aging, entries, generatedAt } = statement;

  async function handleExport() {
    if (!id || !token) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/customers/${id}/statement/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(isThai ? 'ส่งออก SOA ไม่สำเร็จ' : 'Failed to export statement');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement-${customer.taxId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setInfoMessage(isThai ? 'ส่งออก SOA เรียบร้อยแล้ว' : 'Statement exported successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleSendEmail() {
    if (!id || !token) return;
    setSendingEmail(true);
    setError(null);
    setInfoMessage(null);
    try {
      const res = await fetch(`/api/customers/${id}/statement/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lang: isThai ? 'th' : 'en' }),
      });
      const json = await res.json() as { message?: string; to?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to send email');
      setInfoMessage(
        isThai
          ? `ส่ง SOA ไปที่ ${json.to ?? customer.email ?? ''} แล้ว`
          : `Statement sent to ${json.to ?? customer.email ?? ''}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/app/customers" className="inline-flex items-center gap-2 text-sm text-primary-700 hover:underline">
        <ArrowLeft className="w-4 h-4" />
        {isThai ? 'กลับไปหน้าลูกค้า' : 'Back to customers'}
      </Link>

      {infoMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {infoMessage}
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Statement of Account
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              {isThai ? customer.nameTh : (customer.nameEn ?? customer.nameTh)}
            </h1>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              <p>{isThai ? customer.nameEn : customer.nameTh}</p>
              <p>{isThai ? 'เลขผู้เสียภาษี' : 'Tax ID'}: {customer.taxId}</p>
              <p>{isThai ? 'ออกรายงานเมื่อ' : 'Generated at'}: {formatDate(generatedAt)}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              {isThai ? 'สรุปสำหรับติดตามหนี้' : 'Receivables snapshot'}
            </p>
            <p className="mt-1">
              {isThai
                ? 'หน้านี้ใช้ดูยอดค้างชำระ ใบที่เกินกำหนด และอายุหนี้ของลูกค้ารายนี้'
                : 'Use this page to review outstanding balances, overdue invoices, and aging for this customer.'}
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="flex flex-wrap gap-2">
            <button onClick={handleSendEmail} disabled={sendingEmail || !statement.customer.email} className="btn-secondary">
              <Mail className="w-4 h-4" />
              {sendingEmail
                ? (isThai ? 'กำลังส่งอีเมล...' : 'Sending email...')
                : (isThai ? 'ส่ง SOA ทางอีเมล' : 'Email SOA')}
            </button>
            <a
              href={`/api/customers/${id}/statement/pdf${isThai ? '' : '?lang=en'}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
            >
              <Printer className="w-4 h-4" />
              {isThai ? 'เปิด SOA แบบ PDF' : 'Open SOA PDF'}
            </a>
            <button onClick={handleExport} disabled={exporting} className="btn-secondary">
              <Download className="w-4 h-4" />
              {exporting
                ? (isThai ? 'กำลังส่งออก...' : 'Exporting...')
                : (isThai ? 'ส่งออก SOA (Excel)' : 'Export SOA (Excel)')}
            </button>
          </div>
        </div>
        {!statement.customer.email && (
          <p className="text-xs text-amber-700">
            {isThai
              ? 'ลูกค้ารายนี้ยังไม่มีอีเมล จึงยังส่ง SOA จากระบบไม่ได้'
              : 'This customer does not have an email address yet, so the statement cannot be sent from the system.'}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title={isThai ? 'ยอดค้างรวม' : 'Total outstanding'}
          value={formatCurrency(summary.totalOutstanding)}
          tone="rose"
          icon={<ReceiptText className="w-5 h-5" />}
        />
        <SummaryCard
          title={isThai ? 'ยอดเกินกำหนด' : 'Overdue balance'}
          value={formatCurrency(summary.overdueOutstanding)}
          tone="amber"
          icon={<TriangleAlert className="w-5 h-5" />}
        />
        <SummaryCard
          title={isThai ? 'ใบเปิดค้าง' : 'Open invoices'}
          value={String(summary.openInvoices)}
          tone="blue"
          icon={<FileText className="w-5 h-5" />}
        />
        <SummaryCard
          title={isThai ? 'รับชำระแล้ว' : 'Collected'}
          value={formatCurrency(summary.totalReceived)}
          tone="emerald"
          icon={<Clock3 className="w-5 h-5" />}
        />
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isThai ? 'Aging Summary' : 'Aging Summary'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isThai ? 'จัดกลุ่มยอดค้างตามจำนวนวันที่เกินกำหนด' : 'Outstanding balances grouped by overdue days.'}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <AgingCard label={isThai ? 'ยังไม่เกินกำหนด' : 'Current'} value={aging.current} formatCurrency={formatCurrency} />
          <AgingCard label="1-30" value={aging.days1To30} formatCurrency={formatCurrency} />
          <AgingCard label="31-60" value={aging.days31To60} formatCurrency={formatCurrency} />
          <AgingCard label="61-90" value={aging.days61To90} formatCurrency={formatCurrency} />
          <AgingCard label="90+" value={aging.days90Plus} formatCurrency={formatCurrency} />
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isThai ? 'ใบที่ยังค้างชำระ' : 'Outstanding documents'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isThai ? 'เรียงตามใบที่ยังมียอดคงเหลือเพื่อใช้ตามเก็บเงิน' : 'Open receivables that still have a remaining balance.'}
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-header">{isThai ? 'เลขที่เอกสาร' : 'Document No.'}</th>
                <th className="table-header">{isThai ? 'ประเภท' : 'Type'}</th>
                <th className="table-header">{isThai ? 'วันที่เอกสาร' : 'Doc date'}</th>
                <th className="table-header">{isThai ? 'ครบกำหนด' : 'Due date'}</th>
                <th className="table-header text-right">{isThai ? 'ยอดคงเหลือ' : 'Outstanding'}</th>
                <th className="table-header text-right">{isThai ? 'คงค้างสะสม' : 'Running balance'}</th>
                <th className="table-header text-right">{isThai ? 'อายุหนี้' : 'Age'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {outstandingRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    {isThai ? 'ไม่มีใบค้างชำระของลูกค้ารายนี้' : 'No outstanding documents for this customer.'}
                  </td>
                </tr>
              ) : outstandingRows.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-3 pr-3 font-mono text-xs text-slate-700">{entry.invoiceNumber}</td>
                  <td className="py-3 pr-3 text-slate-600">{isThai ? TYPE_LABELS[entry.type].th : TYPE_LABELS[entry.type].en}</td>
                  <td className="py-3 pr-3 text-slate-600">{formatDate(entry.invoiceDate)}</td>
                  <td className="py-3 pr-3 text-slate-600">{entry.dueDate ? formatDate(entry.dueDate) : '-'}</td>
                  <td className="py-3 pr-3 text-right font-semibold text-rose-700">{formatCurrency(entry.outstandingAmount)}</td>
                  <td className="py-3 pr-3 text-right text-slate-700">{formatCurrency(entry.runningBalance)}</td>
                  <td className="py-3 text-right text-slate-600">
                    {entry.ageDays === 0
                      ? (isThai ? 'ยังไม่เกินกำหนด' : 'Current')
                      : isThai ? `${entry.ageDays} วัน` : `${entry.ageDays} days`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {isThai ? 'เอกสารล่าสุดทั้งหมด' : 'Recent statement activity'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isThai ? 'รวม invoice, credit note, debit note และ receipt ล่าสุดของลูกค้ารายนี้' : 'Recent invoice, credit note, debit note, and receipt activity for this customer.'}
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-header">{isThai ? 'เลขที่เอกสาร' : 'Document No.'}</th>
                <th className="table-header">{isThai ? 'ประเภท' : 'Type'}</th>
                <th className="table-header">{isThai ? 'สถานะ' : 'Status'}</th>
                <th className="table-header text-right">{isThai ? 'ยอดเอกสาร' : 'Document amount'}</th>
                <th className="table-header text-right">{isThai ? 'รับชำระแล้ว' : 'Paid'}</th>
                <th className="table-header text-right">{isThai ? 'คงเหลือ' : 'Outstanding'}</th>
                <th className="table-header text-right">{isThai ? 'คงค้างสะสม' : 'Running balance'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-3 pr-3">
                    <div className="font-mono text-xs text-slate-700">{entry.invoiceNumber}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatDate(entry.invoiceDate)}</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-600">{isThai ? TYPE_LABELS[entry.type].th : TYPE_LABELS[entry.type].en}</td>
                  <td className="py-3 pr-3 text-slate-600">{entry.status}</td>
                  <td className={`py-3 pr-3 text-right font-medium ${entry.signedTotal < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {entry.signedTotal < 0 ? '-' : ''}{formatCurrency(Math.abs(entry.signedTotal))}
                  </td>
                  <td className="py-3 pr-3 text-right text-slate-600">{formatCurrency(entry.paidAmount)}</td>
                  <td className="py-3 text-right font-semibold text-slate-800">{formatCurrency(entry.outstandingAmount)}</td>
                  <td className="py-3 text-right text-slate-600">{formatCurrency(entry.runningBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone,
  icon,
}: {
  title: string;
  value: string;
  tone: 'rose' | 'amber' | 'blue' | 'emerald';
  icon: React.ReactNode;
}) {
  const tones = {
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  } as const;

  return (
    <div className={`rounded-2xl border px-4 py-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
        </div>
        <div>{icon}</div>
      </div>
    </div>
  );
}

function AgingCard({
  label,
  value,
  formatCurrency,
}: {
  label: string;
  value: number;
  formatCurrency: (amount: number) => string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(value)}</p>
    </div>
  );
}
