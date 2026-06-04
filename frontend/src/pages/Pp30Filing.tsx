import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Printer, Loader2, FileText, Calendar, Calculator, TrendingUp, Link2, Landmark, Wallet, AlertTriangle, CheckCircle2, Receipt, Save } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { Pp30Data, WhtSummaryData } from '../types';
import SectionSubNav from '../components/SectionSubNav';
import { ToastStack, type FeedbackToast } from '../components/ui/AppFeedback';

const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface VatFilingRecord {
  id: string;
  period: string;
  filedAt: string;
  rdReference?: string | null;
  outputVat: number;
  inputVat: number;
  vatPayable: number;
  vatRefundable: number;
  driveUrl?: string | null;
  driveFolderUrl?: string | null;
}

export default function Pp30Filing() {
  const { isThai, formatCurrency } = useLanguage();
  const { token } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const now = new Date();
  const initialYear = Number(searchParams.get('year')) || now.getFullYear();
  const initialMonth = Number(searchParams.get('month')) || now.getMonth() + 1;

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<Pp30Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'vat' | 'wht'>('vat');
  const [whtData, setWhtData] = useState<WhtSummaryData | null>(null);
  const [filings, setFilings] = useState<VatFilingRecord[]>([]);
  const [filing, setFiling] = useState(false);
  const [rdReference, setRdReference] = useState('');
  const [toasts, setToasts] = useState<FeedbackToast[]>([]);

  const pushToast = useCallback((toast: Omit<FeedbackToast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4800);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`/api/pp30?year=${year}&month=${month}`, { headers });
      const json = await res.json();
      setData(json.data ?? null);

      // Also fetch WHT summary
      try {
        const whtRes = await fetch(`/api/pp30/wht?year=${year}&month=${month}`, { headers });
        const whtJson = await whtRes.json();
        setWhtData(whtJson.data ?? null);
      } catch {
        setWhtData(null);
      }

      try {
        const filingsRes = await fetch('/api/pp30/filings', { headers });
        const filingsJson = await filingsRes.json();
        setFilings(filingsJson.data ?? []);
      } catch {
        setFilings([]);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year, month, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    setSearchParams({ year: String(year), month: String(month) }, { replace: true });
  }, [year, month, setSearchParams]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/pp30/export?year=${year}&month=${month}&format=csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pp30-${year}-${String(month).padStart(2, '0')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      pushToast({
        tone: 'error',
        title: isThai ? 'ส่งออกไม่สำเร็จ' : 'Export failed',
        description: isThai ? 'ลองใหม่อีกครั้ง หรือพิมพ์รายงานแทนชั่วคราว' : 'Try again, or print the report for now.',
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleFilePeriod() {
    setFiling(true);
    try {
      const res = await fetch('/api/pp30/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          year,
          month,
          rdReference: rdReference.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to file PP.30');
      pushToast({
        tone: 'success',
        title: isThai ? 'บันทึกแบบที่ยื่นแล้ว' : 'PP.30 filing recorded',
        description: isThai
          ? 'ระบบจะสร้าง PDF เข้า Drive และซิงก์สมุดทะเบียนภาษีให้อัตโนมัติ'
          : 'Billboy will mirror the PDF to Drive and refresh the tax register.',
      });
      setRdReference('');
      await fetchData();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: isThai ? 'บันทึกแบบที่ยื่นไม่สำเร็จ' : 'Could not record filing',
        description: (err as Error).message,
      });
    } finally {
      setFiling(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const yearOptions: number[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) yearOptions.push(y);

  const periodLabel = isThai
    ? `ภ.พ.30 ประจำเดือน ${TH_MONTHS[month - 1]} ${year + 543}`
    : `PP.30 Monthly Filing — ${EN_MONTHS[month - 1]} ${year}`;
  const periodKey = `${year}-${String(month).padStart(2, '0')}`;
  const currentFiling = filings.find((item) => item.period === periodKey) ?? null;

  const vatPayable = data?.vatPayable ?? 0;
  const mustPay = vatPayable > 0;
  const outputVat = data?.sales.outputVat ?? 0;
  const inputVat = data?.purchases.inputVat ?? 0;
  const whtTotal = whtData?.totalWithheld ?? 0;
  const filingWorkItems = [
    {
      label: isThai ? 'ภาษีขาย' : 'Output VAT',
      value: formatCurrency(outputVat),
      detail: isThai ? 'จากยอดขายในงวด' : 'Sales in period',
      icon: TrendingUp,
      tone: outputVat > 0 ? 'needs' : 'clear',
    },
    {
      label: isThai ? 'ภาษีซื้อ' : 'Input VAT',
      value: formatCurrency(inputVat),
      detail: isThai ? 'จากเอกสารซื้อที่บันทึก' : 'Recorded purchase docs',
      icon: Wallet,
      tone: inputVat > 0 ? 'clear' : 'idle',
    },
    {
      label: mustPay ? (isThai ? 'ต้องชำระ' : 'Payable') : (isThai ? 'ขอคืน' : 'Refundable'),
      value: formatCurrency(Math.abs(vatPayable)),
      detail: isThai ? 'ยอดสุทธิ ภ.พ.30' : 'Net PP.30 position',
      icon: mustPay ? AlertTriangle : CheckCircle2,
      tone: mustPay ? 'overdue' : 'clear',
    },
    {
      label: isThai ? 'หัก ณ ที่จ่าย' : 'WHT',
      value: formatCurrency(whtTotal),
      detail: isThai ? `${whtData?.totalCertificates ?? 0} ใบรับรอง` : `${whtData?.totalCertificates ?? 0} certificates`,
      icon: Receipt,
      tone: whtTotal > 0 ? 'needs' : 'idle',
    },
  ];
  const statusDotClass = (tone: string) => {
    if (tone === 'overdue') return 'bg-rose-500';
    if (tone === 'needs') return 'bg-amber-500';
    if (tone === 'clear') return 'bg-emerald-500';
    return 'bg-slate-300';
  };

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((toast) => toast.id !== id))} />
      <SectionSubNav
        items={[
          { key: 'financials', to: '/app/reports/financials', label: isThai ? 'งบการเงิน' : 'Financials', icon: TrendingUp },
          { key: 'vat', to: '/app/vat-summary', label: isThai ? 'สรุปภาษีมูลค่าเพิ่ม' : 'VAT Summary', icon: Calculator },
          { key: 'pp30', to: '/app/pp30', label: isThai ? 'ภพ.30' : 'PP30 Filing', icon: FileText },
          { key: 'wht', to: '/app/wht-certificates', label: isThai ? 'ภงด.3/53 (หัก ณ ที่จ่าย)' : 'WHT Certificates', icon: Receipt },
          { key: 'reconciliation', to: '/app/reports/reconciliation', label: isThai ? 'กระทบยอดธนาคาร' : 'Bank Reconciliation', icon: Link2 },
        ]}
        className="no-print"
      />
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .pp30-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
        }
      `}</style>

      <section className="premium-hero premium-hero-dark no-print overflow-hidden p-3.5 sm:p-6 lg:p-7">
        <div className="grid gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.75fr)] lg:items-stretch">
          <div className="min-w-0">
            <p className="premium-eyebrow">{isThai ? 'PP.30 Filing Ledger' : 'PP.30 Filing Ledger'}</p>
            <div className="mt-3 flex items-center gap-3 text-white/80 sm:mt-4">
              <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-amber-100 ring-1 ring-white/10 sm:inline-flex">
                <Landmark className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-white sm:text-3xl">
                  {isThai ? 'รายงาน ภ.พ.30' : 'PP.30 Report'}
                </h1>
                <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-white/70 sm:block">
                  {isThai
                    ? 'สรุปภาษีขาย ภาษีซื้อ และภาษีหัก ณ ที่จ่ายของงวดนี้ให้พร้อมพิมพ์หรือส่งออก'
                    : 'Review output VAT, input VAT, and withholding tax for the filing period.'}
                </p>
              </div>
            </div>
            <div className="mt-4 sm:mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
                {mustPay ? (isThai ? 'ภาษีที่ต้องชำระ' : 'VAT payable') : (isThai ? 'ภาษีที่ขอคืน' : 'VAT refundable')}
              </p>
              <p className={`mt-1 text-[clamp(2rem,4vw,2.5rem)] font-bold leading-none tabular-nums ${mustPay ? 'text-rose-100' : 'text-emerald-100'}`}>
                {formatCurrency(Math.abs(vatPayable))}
              </p>
              <div className={`mt-3 h-px w-40 ${mustPay ? 'bg-rose-200/80' : 'bg-amber-200/80'}`} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:mt-5 sm:gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 sm:px-4 sm:py-3">
                <p className="text-xs font-semibold text-white/55">{isThai ? 'ภาษีขาย' : 'Output VAT'}</p>
                <p className="mt-1 font-bold text-white tabular-nums">{formatCurrency(outputVat)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 sm:px-4 sm:py-3">
                <p className="text-xs font-semibold text-white/55">{isThai ? 'ภาษีซื้อ' : 'Input VAT'}</p>
                <p className="mt-1 font-bold text-white tabular-nums">{formatCurrency(inputVat)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 sm:p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Calendar className="h-4 w-4 text-amber-100" />
              {periodLabel}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4">
              <label className="min-w-0 text-xs font-semibold text-white/70">
                {isThai ? 'เดือน' : 'Month'}
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/15 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-amber-200">
                  {(isThai ? TH_MONTHS : EN_MONTHS).map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-semibold text-white/70">
                {isThai ? 'ปี' : 'Year'}
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/15 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-amber-200">
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{isThai ? y + 543 : y}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-3 lg:grid-cols-1">
              <button onClick={handlePrint} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-primary-900 shadow-sm transition hover:bg-amber-50 sm:px-4 sm:py-2.5">
                <Printer className="h-4 w-4" />
                {isThai ? 'พิมพ์รายงาน' : 'Print'}
              </button>
              <button onClick={handleExport} disabled={exporting} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-60 sm:px-4 sm:py-2.5">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isThai ? 'ดาวน์โหลด CSV' : 'Download CSV'}
              </button>
              <button
                onClick={() => setActiveTab(activeTab === 'wht' ? 'vat' : 'wht')}
                className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/15 sm:col-span-1 sm:px-4 sm:py-2.5"
              >
                <Receipt className="h-4 w-4" />
                {activeTab === 'wht' ? (isThai ? 'กลับไป VAT' : 'VAT Summary') : (isThai ? 'ดูหัก ณ ที่จ่าย' : 'WHT Summary')}
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/12 bg-slate-950/20 p-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className={`mt-0.5 h-4 w-4 ${currentFiling ? 'text-emerald-200' : 'text-amber-100'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">
                    {currentFiling
                      ? isThai ? 'งวดนี้บันทึกว่ายื่นแล้ว' : 'This period is recorded as filed'
                      : isThai ? 'บันทึกแบบที่ยื่นแล้ว' : 'Record filed return'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/65">
                    {currentFiling
                      ? `${isThai ? 'วันที่ยื่น' : 'Filed'} ${new Date(currentFiling.filedAt).toISOString().slice(0, 10)}${currentFiling.rdReference ? ` · ${currentFiling.rdReference}` : ''}`
                      : isThai ? 'หลังยื่นในระบบ RD แล้ว ให้บันทึกที่นี่เพื่อ snapshot และเก็บ PDF เข้า Drive' : 'After filing with RD, record it here to snapshot and mirror the PDF to Drive.'}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <input
                  value={rdReference}
                  onChange={(event) => setRdReference(event.target.value)}
                  placeholder={isThai ? 'เลขอ้างอิง/เลขรับจาก RD (ถ้ามี)' : 'RD reference / receipt no. (optional)'}
                  className="w-full rounded-xl border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-amber-200"
                />
                <button
                  type="button"
                  onClick={handleFilePeriod}
                  disabled={filing || loading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {filing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {currentFiling
                    ? isThai ? 'บันทึกซ้ำ/แก้ไข snapshot' : 'Re-file / update snapshot'
                    : isThai ? 'บันทึกว่ายื่นแล้ว' : 'Record as filed'}
                </button>
              </div>
              {currentFiling?.driveUrl && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <a href={currentFiling.driveUrl} target="_blank" rel="noreferrer" className="rounded-full bg-white/10 px-3 py-1.5 text-white ring-1 ring-white/15 hover:bg-white/15">
                    {isThai ? 'เปิด PDF ที่ยื่นแล้ว' : 'Open filed PDF'}
                  </a>
                  {currentFiling.driveFolderUrl && (
                    <a href={currentFiling.driveFolderUrl} target="_blank" rel="noreferrer" className="rounded-full bg-white/10 px-3 py-1.5 text-white ring-1 ring-white/15 hover:bg-white/15">
                      {isThai ? 'เปิดโฟลเดอร์ Drive' : 'Open Drive folder'}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          <div className="no-print grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {filingWorkItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(item.tone)}`} />
                  </div>
                  <p className="mt-3 text-xl font-bold leading-none text-slate-950 tabular-nums">{item.value}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                </div>
              );
            })}
          </div>

          {/* Header card */}
          <div className="card pp30-card border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  {isThai ? 'ผู้ประกอบการ' : 'Taxpayer'}
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {data?.company?.nameTh ?? '—'}
                </p>
                {data?.company?.nameEn && (
                  <p className="text-sm text-gray-500">{data.company.nameEn}</p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  {isThai ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID'}: <span className="font-mono">{data?.company?.taxId ?? '—'}</span>
                  {data?.company?.branchCode && (
                    <> · {isThai ? 'สาขา' : 'Branch'} <span className="font-mono">{data.company.branchCode}</span></>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  {isThai ? 'งวดภาษี' : 'Tax Period'}
                </p>
                <p className="text-lg font-bold text-primary-700">{periodLabel}</p>
              </div>
            </div>
          </div>

          <div className="no-print rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-bold text-slate-950">{isThai ? 'แบบ ภ.พ.30 ที่บันทึกว่ายื่นแล้ว' : 'Filed PP.30 records'}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {isThai ? 'ใช้ตรวจหลักฐานที่ส่ง RD แล้ว และลิงก์ PDF/Drive ที่ระบบเก็บไว้' : 'Audit trail for RD filings and the PDF/Drive evidence Billboy keeps.'}
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {filings.length} {isThai ? 'งวด' : 'periods'}
              </span>
            </div>
            {filings.length === 0 ? (
              <div className="px-5 py-6 text-sm text-slate-500">
                {isThai ? 'ยังไม่มีงวดที่บันทึกว่ายื่นแล้ว' : 'No filed periods recorded yet.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="table-header">{isThai ? 'งวด' : 'Period'}</th>
                      <th className="table-header">{isThai ? 'วันที่ยื่น' : 'Filed at'}</th>
                      <th className="table-header">{isThai ? 'เลขอ้างอิง' : 'Reference'}</th>
                      <th className="table-header text-right">{isThai ? 'ภาษีขาย' : 'Output VAT'}</th>
                      <th className="table-header text-right">{isThai ? 'ภาษีซื้อ' : 'Input VAT'}</th>
                      <th className="table-header text-right">{isThai ? 'สุทธิ' : 'Net'}</th>
                      <th className="table-header text-right">{isThai ? 'หลักฐาน' : 'Evidence'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filings.slice(0, 8).map((filingRow) => {
                      const net = filingRow.vatPayable > 0 ? filingRow.vatPayable : -filingRow.vatRefundable;
                      return (
                        <tr key={filingRow.id} className={filingRow.period === periodKey ? 'bg-primary-50/35' : undefined}>
                          <td className="table-cell font-semibold text-primary-700 tabular-nums">{filingRow.period}</td>
                          <td className="table-cell text-sm text-slate-700 tabular-nums">{new Date(filingRow.filedAt).toISOString().slice(0, 10)}</td>
                          <td className="table-cell text-sm text-slate-600">{filingRow.rdReference || '—'}</td>
                          <td className="table-cell text-right tabular-nums">{formatCurrency(filingRow.outputVat)}</td>
                          <td className="table-cell text-right tabular-nums">{formatCurrency(filingRow.inputVat)}</td>
                          <td className={`table-cell text-right font-bold tabular-nums ${net >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatCurrency(Math.abs(net))}</td>
                          <td className="table-cell text-right">
                            <div className="flex justify-end gap-2">
                              {filingRow.driveUrl ? (
                                <a href={filingRow.driveUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary-700 hover:text-primary-900">
                                  PDF
                                </a>
                              ) : (
                                <span className="text-xs text-amber-600">{isThai ? 'กำลังซิงก์' : 'Syncing'}</span>
                              )}
                              {filingRow.driveFolderUrl && (
                                <a href={filingRow.driveFolderUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                                  Drive
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sales section (Output VAT) */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm pp30-card">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-gray-900">
                {isThai ? '1. ภาษีขาย (Output VAT)' : '1. Output VAT (Sales)'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">{isThai ? 'ยอดขายแยกตามประเภทภาษีมูลค่าเพิ่ม' : 'Sales grouped by VAT treatment'}</p>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">{isThai ? 'ประเภท' : 'VAT Type'}</th>
                  <th className="table-header text-right">{isThai ? 'ยอดขายก่อน VAT' : 'Total Excl VAT'}</th>
                  <th className="table-header text-right">{isThai ? 'จำนวน VAT' : 'VAT Amount'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="table-cell font-medium">{isThai ? 'อัตรา 7%' : 'VAT 7%'}</td>
                  <td className="table-cell text-right tabular-nums">{formatCurrency(data?.sales.byVatType.vat7.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right font-semibold text-green-700">{formatCurrency(data?.sales.byVatType.vat7.vatAmount ?? 0)}</td>
                </tr>
                <tr>
                  <td className="table-cell font-medium">{isThai ? 'อัตรา 0%' : 'Zero-rated'}</td>
                  <td className="table-cell text-right tabular-nums">{formatCurrency(data?.sales.byVatType.vatZero.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right tabular-nums">{formatCurrency(data?.sales.byVatType.vatZero.vatAmount ?? 0)}</td>
                </tr>
                <tr>
                  <td className="table-cell font-medium">{isThai ? 'ยกเว้น VAT' : 'VAT Exempt'}</td>
                  <td className="table-cell text-right tabular-nums">{formatCurrency(data?.sales.byVatType.vatExempt.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right text-gray-400">—</td>
                </tr>
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-4 py-3 font-semibold text-gray-900">{isThai ? 'รวมยอดขาย' : 'Total Sales'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(data?.sales.totalExclVat ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700 tabular-nums">{formatCurrency(data?.sales.outputVat ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </div>

          {/* Purchases section (Input VAT) */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm pp30-card">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-gray-900">
                {isThai ? '2. ภาษีซื้อ (Input VAT)' : '2. Input VAT (Purchases)'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">{isThai ? 'เอกสารซื้อที่บันทึกแล้วสำหรับงวดนี้' : 'Recorded purchase documents for this period'}</p>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">{isThai ? 'ประเภท' : 'VAT Type'}</th>
                  <th className="table-header text-right">{isThai ? 'ยอดซื้อก่อน VAT' : 'Total Excl VAT'}</th>
                  <th className="table-header text-right">{isThai ? 'จำนวน VAT' : 'VAT Amount'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="table-cell font-medium">{isThai ? 'อัตรา 7%' : 'VAT 7%'}</td>
                  <td className="table-cell text-right tabular-nums">{formatCurrency(data?.purchases.byVatType.vat7.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right font-semibold text-blue-700 tabular-nums">{formatCurrency(data?.purchases.byVatType.vat7.vatAmount ?? 0)}</td>
                </tr>
                <tr>
                  <td className="table-cell font-medium">{isThai ? 'อัตรา 0%' : 'Zero-rated'}</td>
                  <td className="table-cell text-right tabular-nums">{formatCurrency(data?.purchases.byVatType.vatZero.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right tabular-nums">{formatCurrency(data?.purchases.byVatType.vatZero.vatAmount ?? 0)}</td>
                </tr>
                <tr>
                  <td className="table-cell font-medium">{isThai ? 'ยกเว้น VAT' : 'VAT Exempt'}</td>
                  <td className="table-cell text-right tabular-nums">{formatCurrency(data?.purchases.byVatType.vatExempt.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right text-gray-400">—</td>
                </tr>
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-4 py-3 font-semibold text-gray-900">{isThai ? 'รวมยอดซื้อ' : 'Total Purchases'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(data?.purchases.totalExclVat ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-700 tabular-nums">{formatCurrency(data?.purchases.inputVat ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </div>

          {/* Summary card */}
          <div className={`card pp30-card border-2 bg-white shadow-sm ${mustPay ? 'border-rose-200' : 'border-emerald-200'}`}>
            <h2 className="font-bold text-gray-900 mb-4">
              {isThai ? '3. สรุปยอดภาษี' : '3. Summary'}
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-700">{isThai ? 'ยอดขายรวม (รวม VAT)' : 'Total Sales (incl. VAT)'}</span>
                <span className="font-medium">{formatCurrency(data?.sales.totalInclVat ?? 0)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-700">{isThai ? 'ภาษีขาย (Output VAT)' : 'Output VAT'}</span>
                <span className="font-medium text-green-700">{formatCurrency(data?.sales.outputVat ?? 0)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-700">{isThai ? 'ภาษีซื้อ (Input VAT)' : 'Input VAT'}</span>
                <span className="font-medium text-blue-700">− {formatCurrency(data?.purchases.inputVat ?? 0)}</span>
              </div>
              <div className={`flex justify-between items-center py-3 mt-2 px-4 rounded-lg border ${mustPay ? 'border-rose-200 bg-white' : 'border-emerald-200 bg-white'}`}>
                <span className={`text-base font-bold ${mustPay ? 'text-red-900' : 'text-emerald-900'}`}>
                  {mustPay
                    ? (isThai ? 'ภาษีที่ต้องชำระ' : 'VAT Payable')
                    : (isThai ? 'ภาษีที่ขอคืน' : 'VAT Refundable')}
                </span>
                <span className={`text-2xl font-bold tabular-nums ${mustPay ? 'text-red-700' : 'text-emerald-700'}`}>
                  {formatCurrency(Math.abs(vatPayable))}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              {isThai
                ? 'ยื่นแบบ ภ.พ.30 ภายในวันที่ 15 ของเดือนถัดไป (หรือภายใน 23 ของเดือนถัดไปสำหรับการยื่นออนไลน์)'
                : 'File PP.30 by the 15th of the following month (23rd for e-filing).'}
            </p>
          </div>

          {/* WHT Section (shown when WHT tab is active) */}
          {activeTab === 'wht' && (
            <div className="space-y-4">
              <div className="card pp30-card border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Receipt className="w-5 h-5 text-red-600" />
                  <h2 className="font-bold text-gray-900">
                    {isThai ? 'สรุปภาษีหัก ณ ที่จ่าย' : 'Withholding Tax Summary'}
                  </h2>
                </div>
                {whtData ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3 mb-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                        <p className="text-xs text-gray-500 mb-1">{isThai ? 'จำนวนใบรับรอง' : 'Total Certificates'}</p>
                        <p className="text-2xl font-bold text-gray-900">{whtData.totalCertificates}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                        <p className="text-xs text-gray-500 mb-1">{isThai ? 'ภาษีหักรวม' : 'Total Withheld'}</p>
                        <p className="text-2xl font-bold text-red-600">{formatCurrency(whtData.totalWithheld)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                        <p className="text-xs text-gray-500 mb-1">{isThai ? 'ยอดเงินได้รวม' : 'Total Income'}</p>
                        <p className="text-2xl font-bold text-gray-700">{formatCurrency(whtData.totalAmount)}</p>
                      </div>
                    </div>
                    {/* By-rate breakdown */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full min-w-[760px]">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="table-header">{isThai ? 'อัตราภาษี' : 'Rate'}</th>
                            <th className="table-header">{isThai ? 'ประเภทเงินได้' : 'Income Type'}</th>
                            <th className="table-header text-right">{isThai ? 'จำนวนใบ' : 'Count'}</th>
                            <th className="table-header text-right">{isThai ? 'ยอดเงินได้' : 'Total Income'}</th>
                            <th className="table-header text-right">{isThai ? 'ภาษีหัก' : 'Withheld'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {whtData.byRate.filter(r => r.count > 0).map((rate) => (
                            <tr key={rate.rate}>
                              <td className="table-cell font-semibold text-red-700">{rate.rate}%</td>
                              <td className="table-cell text-sm text-gray-600">{rate.label}</td>
                              <td className="table-cell text-right tabular-nums">{rate.count}</td>
                              <td className="table-cell text-right tabular-nums">{formatCurrency(rate.totalAmount)}</td>
                              <td className="table-cell text-right font-semibold text-red-600 tabular-nums">{formatCurrency(rate.totalWithheld)}</td>
                            </tr>
                          ))}
                          {whtData.byRate.filter(r => r.count > 0).length === 0 && (
                            <tr>
                              <td colSpan={5} className="text-center py-6 text-gray-400">
                                {isThai ? 'ไม่มีข้อมูลภาษีหัก ณ ที่จ่ายในงวดนี้' : 'No WHT records for this period'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {whtData.totalCertificates > 0 && (
                      <div className="mt-4 flex gap-3">
                        <a
                          href={`/app/wht-certificates?year=${year}&month=${month}`}
                          className="btn-secondary"
                        >
                          <Receipt className="w-4 h-4" />
                          {isThai ? 'ดูใบรับรองทั้งหมด' : 'View All Certificates'}
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    {isThai ? 'กำลังโหลด...' : 'Loading...'}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
