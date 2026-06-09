import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, Link2, TrendingUp, Calculator, FileText, Receipt, Banknote } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import SectionSubNav from '../components/SectionSubNav';

// Bank reconciliation MVP UI — upload CSV, see auto-matched suggestions,
// confirm/reject. Matches are persisted via /api/reconciliation/match
// which creates Payment rows for invoices and flips isPaid on purchases.

interface Suggestion {
  kind: 'invoice' | 'purchase';
  id: string;
  invoiceNumber: string;
  partyName: string;
  total: number;
  invoiceDate: string;
  score: number;
}

interface Txn {
  rowIndex: number;
  date: string;
  description: string;
  debit: number;
  credit: number;
  suggestions: Suggestion[];
}

export default function Reconciliation() {
  const { i18n } = useTranslation();
  const { formatCurrency } = useLanguage();
  const token = useAuthStore((s) => s.token);
  const isThai = i18n.language === 'th';

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [matchedRows, setMatchedRows] = useState<Set<number>>(new Set());
  const [busyRow, setBusyRow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ transactionCount: number; autoMatchedCount: number } | null>(null);

  async function handleUpload() {
    if (!file || !token) return;
    setParsing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/reconciliation/parse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setTxns(json.data.transactions);
      setSummary({ transactionCount: json.data.transactionCount, autoMatchedCount: json.data.autoMatchedCount });
      setMatchedRows(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed');
    } finally {
      setParsing(false);
    }
  }

  async function confirmMatch(txn: Txn, sug: Suggestion) {
    if (!token || busyRow === txn.rowIndex) return;
    setBusyRow(txn.rowIndex);
    try {
      const amount = txn.credit > 0 ? txn.credit : txn.debit;
      const res = await fetch('/api/reconciliation/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          kind: sug.kind,
          documentId: sug.id,
          amount,
          paidAt: txn.date,
          reference: txn.description.slice(0, 200),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMatchedRows((prev) => new Set(prev).add(txn.rowIndex));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Match failed');
    } finally {
      setBusyRow(null);
    }
  }

  const txnsForSummary = txns ?? [];
  const totalCredit = txnsForSummary.reduce((sum, txn) => sum + txn.credit, 0);
  const totalDebit = txnsForSummary.reduce((sum, txn) => sum + txn.debit, 0);
  const suggestedCount = txnsForSummary.filter((txn) => txn.suggestions.length > 0).length;
  const confirmedCount = matchedRows.size;
  const workItems = [
    {
      label: isThai ? 'รายการในไฟล์' : 'Statement lines',
      value: String(summary?.transactionCount ?? txnsForSummary.length),
      icon: FileSpreadsheet,
      dot: summary ? 'bg-primary-500' : 'bg-slate-300',
      status: summary ? (isThai ? 'พร้อมตรวจ' : 'Ready') : (isThai ? 'รอไฟล์ CSV' : 'Awaiting CSV'),
    },
    {
      label: isThai ? 'แนะนำจับคู่อัตโนมัติ' : 'Suggested matches',
      value: String(summary?.autoMatchedCount ?? suggestedCount),
      icon: Link2,
      dot: suggestedCount > 0 || (summary?.autoMatchedCount ?? 0) > 0 ? 'bg-amber-500' : 'bg-slate-300',
      status: isThai ? 'ให้ยืนยัน' : 'Review',
    },
    {
      label: isThai ? 'ยืนยันแล้ว' : 'Confirmed',
      value: String(confirmedCount),
      icon: CheckCircle2,
      dot: confirmedCount > 0 ? 'bg-emerald-500' : 'bg-slate-300',
      status: confirmedCount > 0 ? (isThai ? 'บันทึกแล้ว' : 'Posted') : (isThai ? 'ยังไม่มี' : 'None yet'),
    },
    {
      label: isThai ? 'เงินเข้า / เงินออก' : 'Cash in / out',
      value: `${formatCurrency(totalCredit)} / ${formatCurrency(totalDebit)}`,
      icon: Banknote,
      dot: totalCredit || totalDebit ? 'bg-emerald-500' : 'bg-slate-300',
      status: isThai ? 'ตามไฟล์ CSV' : 'From CSV',
    },
  ];

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <SectionSubNav
        items={[
          { key: 'financials', to: '/app/reports/financials', label: isThai ? 'งบการเงิน' : 'Financials', icon: TrendingUp },
          { key: 'vat', to: '/app/vat-summary', label: isThai ? 'สรุปภาษีมูลค่าเพิ่ม' : 'VAT Summary', icon: Calculator },
          { key: 'pp30', to: '/app/pp30', label: isThai ? 'ภพ.30' : 'PP30 Filing', icon: FileText },
          { key: 'wht', to: '/app/wht-certificates', label: isThai ? 'ภงด.3/53' : 'WHT', icon: Receipt },
          { key: 'reconciliation', to: '/app/reports/reconciliation', label: isThai ? 'กระทบยอดธนาคาร' : 'Bank Reconciliation', icon: Link2 },
        ]}
      />

      <section className="workspace-command">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.7fr)] lg:items-stretch">
          <div className="min-w-0">
            <p className="premium-eyebrow">{isThai ? 'Bank Match Ledger' : 'Bank Match Ledger'}</p>
            <h1 className="mt-3 text-xl font-bold leading-tight text-slate-950 sm:text-3xl">
              {isThai ? 'กระทบยอดธนาคาร' : 'Bank Reconciliation'}
            </h1>
            <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-slate-600 sm:block">
              {isThai
                ? 'อัปโหลด statement แล้วให้ Billboy แนะนำว่าเงินเข้า/เงินออกตรงกับเอกสารใด ก่อนกดยืนยันบันทึกการชำระเงิน'
                : 'Upload a statement, let Billboy suggest matching documents, then confirm each payment posting.'}
            </p>
            <div className="mt-4 sm:mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isThai ? 'จับคู่ยืนยันแล้ว' : 'Confirmed matches'}</p>
              <p className="mt-1 text-[2.15rem] font-bold leading-none tabular-nums text-primary-800 sm:text-[2.5rem]">
                {confirmedCount}
              </p>
              <div className="mt-3 h-px w-40 bg-slate-200" />
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:mt-5 sm:gap-3">
                <div className="border-t border-slate-200 px-1 py-3">
                  <p className="text-xs font-semibold text-slate-500">{isThai ? 'เงินเข้า' : 'Cash in'}</p>
                  <p className="mt-1 font-bold text-slate-950 tabular-nums">{formatCurrency(totalCredit)}</p>
                </div>
                <div className="border-t border-slate-200 px-1 py-3">
                  <p className="text-xs font-semibold text-slate-500">{isThai ? 'เงินออก' : 'Cash out'}</p>
                  <p className="mt-1 font-bold text-rose-600 tabular-nums">{formatCurrency(totalDebit)}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="workspace-command-rail">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {isThai ? 'ไฟล์ CSV จากธนาคาร' : 'Bank statement CSV'}
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-primary-700 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-primary-800"
            />
            <p className="mt-3 hidden text-xs leading-5 text-slate-600 sm:block">
              {isThai
                ? 'รองรับ CSV ที่มีหัว Date / Description / Debit / Credit'
                : 'Supports CSV columns Date / Description / Debit / Credit.'}
            </p>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || parsing}
              className="btn-primary mt-4 w-full justify-center px-4 py-2.5 text-sm disabled:opacity-60"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isThai ? 'อัปโหลดและจับคู่' : 'Upload & match'}
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {workItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 sm:h-10 sm:w-10">
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.dot}`} />
              </div>
              <p className="mt-3 truncate text-xl font-bold leading-none tabular-nums text-slate-950 sm:mt-4 sm:text-2xl">{item.value}</p>
              <div className="mt-2 min-w-0">
                <p className="truncate text-sm font-semibold text-slate-700">{item.label}</p>
                <p className="mt-1 truncate text-xs font-medium text-slate-500">{item.status}</p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-900 shadow-sm">
          <FileSpreadsheet className="mt-0.5 h-4 w-4" />
          <div>
            <div className="font-semibold">
              {isThai
                ? `พบ ${summary.transactionCount} รายการ · จับคู่อัตโนมัติ ${summary.autoMatchedCount} รายการ`
                : `${summary.transactionCount} transactions found · ${summary.autoMatchedCount} auto-matched`}
            </div>
            <div className="text-xs">{isThai ? 'กดยืนยันรายการที่ตรงเพื่อบันทึกการชำระเงิน' : 'Confirm matches below to record the payments.'}</div>
          </div>
        </div>
      )}

      {txns && txns.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{isThai ? 'รายการ statement ที่ต้องตรวจ' : 'Statement lines to review'}</h2>
          </div>
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">{isThai ? 'วันที่' : 'Date'}</th>
                <th className="px-4 py-3 text-left">{isThai ? 'รายละเอียด' : 'Description'}</th>
                <th className="px-4 py-3 text-right">{isThai ? 'รับเข้า' : 'Credit (In)'}</th>
                <th className="px-4 py-3 text-right">{isThai ? 'จ่ายออก' : 'Debit (Out)'}</th>
                <th className="px-4 py-3 text-left">{isThai ? 'จับคู่แนะนำ' : 'Suggested match'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {txns.map((txn) => {
                const matched = matchedRows.has(txn.rowIndex);
                const top = txn.suggestions[0];
                return (
                  <tr key={txn.rowIndex} className={matched ? 'bg-emerald-50/40' : ''}>
                    <td className="px-4 py-3 align-top whitespace-nowrap font-mono text-xs">{txn.date}</td>
                    <td className="px-4 py-3 align-top text-slate-700">{txn.description}</td>
                    <td className="px-4 py-3 align-top text-right tabular-nums text-emerald-700">
                      {txn.credit > 0 ? formatCurrency(txn.credit) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-right tabular-nums text-rose-600">
                      {txn.debit > 0 ? formatCurrency(txn.debit) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {matched ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                          <CheckCircle2 className="h-4 w-4" />
                          {isThai ? 'ยืนยันแล้ว' : 'Confirmed'}
                        </span>
                      ) : top ? (
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-mono text-slate-600">{top.invoiceNumber}</div>
                            <div className="truncate text-xs text-slate-500">
                              {top.partyName} · {formatCurrency(top.total)} · {top.invoiceDate}
                            </div>
                            <div className="text-xs leading-tight text-slate-400">
                              {isThai ? 'ความมั่นใจ' : 'confidence'} {Math.round(top.score * 100)}%
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => confirmMatch(txn, top)}
                            disabled={busyRow === txn.rowIndex}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {busyRow === txn.rowIndex ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                            {isThai ? 'ยืนยัน' : 'Confirm'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{isThai ? 'ไม่พบคู่ที่ตรง' : 'No match'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </section>
      )}
    </div>
  );
}
