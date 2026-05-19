import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, Link2, TrendingUp, Calculator, FileText, Receipt } from 'lucide-react';
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

  return (
    <div className="space-y-6">
      <SectionSubNav
        items={[
          { key: 'financials', to: '/app/reports/financials', label: isThai ? 'งบการเงิน' : 'Financials', icon: TrendingUp },
          { key: 'vat', to: '/app/vat-summary', label: isThai ? 'สรุปภาษีมูลค่าเพิ่ม' : 'VAT Summary', icon: Calculator },
          { key: 'pp30', to: '/app/pp30', label: isThai ? 'ภพ.30' : 'PP30 Filing', icon: FileText },
          { key: 'wht', to: '/app/wht-certificates', label: isThai ? 'ภงด.3/53' : 'WHT', icon: Receipt },
          { key: 'reconciliation', to: '/app/reports/reconciliation', label: isThai ? 'กระทบยอดธนาคาร' : 'Bank Reconciliation', icon: Link2 },
        ]}
      />
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          {isThai ? 'กระทบยอดธนาคาร (Bank Reconciliation)' : 'Bank Reconciliation'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isThai
            ? 'อัปโหลด CSV จากธนาคาร — ระบบจะแนะนำว่ารายการไหนตรงกับใบกำกับ/ใบกำกับซื้อใด'
            : 'Upload a bank statement CSV — the system suggests which invoice or purchase invoice each transaction matches.'}
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700">
              {isThai ? 'ไฟล์ CSV จากธนาคาร' : 'Bank statement CSV'}
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
            />
            <p className="mt-1 text-xs text-slate-500">
              {isThai
                ? 'รองรับ CSV ที่มีหัว Date / Description / Debit / Credit (ส่วนใหญ่ธนาคารไทย export ในรูปนี้)'
                : 'CSV with columns Date / Description / Debit / Credit (most Thai banks export this shape).'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || parsing}
            className="btn-primary text-sm disabled:opacity-60"
          >
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isThai ? 'อัปโหลดและจับคู่' : 'Upload & match'}
          </button>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
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
        <section className="rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
                    <td className="px-4 py-3 align-top text-right text-emerald-700">
                      {txn.credit > 0 ? formatCurrency(txn.credit) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-right text-rose-600">
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
                            <div className="text-xs text-slate-500 truncate">
                              {top.partyName} · {formatCurrency(top.total)} · {top.invoiceDate}
                            </div>
                            <div className="text-[10px] text-slate-400">
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
        </section>
      )}
    </div>
  );
}
