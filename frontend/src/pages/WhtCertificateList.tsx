import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FileText, Loader2, Search, Calendar, Receipt, Calculator, TrendingUp, Link2, BadgePercent, Landmark } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { WhtCertificate } from '../types';
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

const WHT_RATE_LABELS: Record<string, string> = {
  '1': 'มาตรา 40(1) — ค่าจ้าง',
  '2': 'มาตรา 40(2) — ค่าเช่า/ดอกเบี้ย',
  '4': 'มาตรา 40(4) — ค่าบริการ/นายหน้า',
};

export default function WhtCertificateList() {
  const { isThai, formatCurrency } = useLanguage();
  const { token } = useAuthStore();
  const [searchParams] = useSearchParams();

  const initialYear = Number(searchParams.get('year')) || new Date().getFullYear();
  const initialMonth = Number(searchParams.get('month')) || new Date().getMonth() + 1;

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [certificates, setCertificates] = useState<WhtCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<FeedbackToast[]>([]);

  const pushToast = useCallback((toast: Omit<FeedbackToast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4800);
  }, []);

  const fetchCerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (search) params.set('search', search);
      const res = await fetch(`/api/wht-certificates?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setCertificates(json.data ?? []);
    } catch {
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  }, [year, month, search, token]);

  useEffect(() => { fetchCerts(); }, [fetchCerts]);

  async function handleDownloadPdf(certId: string) {
    setDownloadingId(certId);
    try {
      const res = await fetch(`/api/wht-certificates/${certId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WHT-${certId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      pushToast({
        tone: 'error',
        title: isThai ? 'ดาวน์โหลดไม่สำเร็จ' : 'Download failed',
        description: isThai ? 'ไฟล์ 50 ทวิยังไม่พร้อมหรือเซิร์ฟเวอร์ตอบกลับผิดพลาด' : 'The WHT PDF may not be ready or the server returned an error.',
      });
    } finally {
      setDownloadingId(null);
    }
  }

  const yearOptions: number[] = [];
  for (let y = new Date().getFullYear(); y >= new Date().getFullYear() - 5; y--) yearOptions.push(y);
  const totalWithheld = certificates.reduce((sum, cert) => sum + cert.whtAmount, 0);
  const totalIncome = certificates.reduce((sum, cert) => sum + cert.totalAmount, 0);
  const totalNet = certificates.reduce((sum, cert) => sum + cert.netAmount, 0);
  const pdfReadyCount = certificates.filter((cert) => Boolean(cert.pdfUrl)).length;
  const rate3Count = certificates.filter((cert) => cert.whtRate === '3').length;
  const rate5Count = certificates.filter((cert) => cert.whtRate === '5').length;
  const selectedPeriodLabel = `${isThai ? TH_MONTHS[month - 1] : EN_MONTHS[month - 1]} ${isThai ? year + 543 : year}`;
  const workItems = [
    {
      label: isThai ? 'จำนวนใบรับรอง' : 'Certificates',
      value: certificates.length.toLocaleString(),
      status: certificates.length > 0 ? (isThai ? 'พร้อมยื่น' : 'Ready') : (isThai ? 'ไม่มีรายการ' : 'None'),
      dot: certificates.length > 0 ? 'bg-primary-500' : 'bg-slate-300',
      icon: Receipt,
    },
    {
      label: isThai ? 'PDF พร้อมดาวน์โหลด' : 'PDF ready',
      value: pdfReadyCount.toLocaleString(),
      status: pdfReadyCount === certificates.length ? (isThai ? 'ครบ' : 'Complete') : (isThai ? 'ตรวจ' : 'Review'),
      dot: certificates.length === 0 ? 'bg-slate-300' : pdfReadyCount === certificates.length ? 'bg-emerald-500' : 'bg-amber-500',
      icon: Download,
    },
    {
      label: isThai ? 'อัตรา 3%' : 'Rate 3%',
      value: rate3Count.toLocaleString(),
      status: isThai ? 'บริการ' : 'Services',
      dot: rate3Count > 0 ? 'bg-amber-500' : 'bg-slate-300',
      icon: BadgePercent,
    },
    {
      label: isThai ? 'อัตรา 5%' : 'Rate 5%',
      value: rate5Count.toLocaleString(),
      status: isThai ? 'ค่าเช่า' : 'Rent/other',
      dot: rate5Count > 0 ? 'bg-rose-500' : 'bg-slate-300',
      icon: Calculator,
    },
  ];

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
      />

      <section className="premium-hero premium-hero-dark overflow-hidden p-3.5 sm:p-6 lg:p-7">
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-end">
          <div className="min-w-0">
            <div className="premium-eyebrow bg-white/10 text-white ring-1 ring-white/20">
              {isThai ? 'Withholding Tax Ledger' : 'Withholding Tax Ledger'}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 sm:mt-4">
              <div className="hidden h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:flex">
                <Landmark className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white sm:text-3xl">
                  {isThai ? 'ใบรับรองหักภาษี ณ ที่จ่าย (50 ทวิ)' : 'Withholding Tax Certificates'}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-white/70">
                  {isThai
                    ? 'รวมภาษีหัก ณ ที่จ่าย รายการผู้รับเงิน และไฟล์ 50 ทวิประจำงวด'
                    : 'Track withheld tax, payees, rates, and 50 ทวิ certificate files for the selected period.'}
                </p>
              </div>
            </div>

            <div className="mt-4 sm:mt-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">
                {isThai ? 'ภาษีหักรวม' : 'Total withheld'}
              </p>
              <div className="mt-2 max-w-2xl border-b border-[rgba(201,168,76,0.7)] pb-2 sm:pb-3">
                <p className="font-sarabun text-[2rem] font-bold leading-none text-white tabular-nums sm:text-[clamp(2rem,4vw,2.5rem)]">
                  {formatCurrency(totalWithheld)}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/75 sm:mt-4 sm:gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                  {isThai ? 'เงินได้รวม' : 'Income'} <strong className="text-white tabular-nums">{formatCurrency(totalIncome)}</strong>
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                  {isThai ? 'งวด' : 'Period'} <strong className="text-white tabular-nums">{selectedPeriodLabel}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl bg-white/10 p-3 text-white ring-1 ring-white/15 backdrop-blur-sm sm:p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">
              {isThai ? 'Report period' : 'Report period'}
            </p>
            <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <label className="min-w-0 text-xs font-semibold text-white/70">
                <span className="block">{isThai ? 'เดือน' : 'Month'}</span>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm">
                  {(isThai ? TH_MONTHS : EN_MONTHS).map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-semibold text-white/70">
                <span className="block">{isThai ? 'ปี' : 'Year'}</span>
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/15 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm">
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{isThai ? y + 543 : y}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {workItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold leading-none text-slate-950 tabular-nums sm:text-lg">{item.value}</p>
                    <p className="mt-1 truncate text-sm font-medium text-slate-600">{item.label}</p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                  <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                  {item.status}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="h-5 w-5 text-slate-400" />
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isThai ? 'ค้นหาเลขที่ใบรับรอง / ชื่อผู้รับเงิน...' : 'Search certificate number or payee name...'}
              className="input-field w-full pl-9"
            />
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : certificates.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-500 shadow-sm">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">{isThai ? 'ไม่มีใบรับรอง' : 'No certificates'}</p>
          <p className="text-sm mt-1">
            {isThai
              ? 'ยังไม่มีใบรับรองหักภาษีในงวดนี้'
              : 'No WHT certificates for this period'}
          </p>
          <Link to="/app/invoices/new" className="btn-primary mt-4 inline-flex">
            <FileText className="w-4 h-4" />
            {isThai ? 'สร้างใบกำกับภาษี' : 'Create Invoice'}
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">{isThai ? 'ทะเบียนใบรับรองหัก ณ ที่จ่าย' : 'WHT certificate ledger'}</p>
              <p className="text-xs text-slate-500">{isThai ? 'ตรวจผู้รับเงิน อัตราภาษี และดาวน์โหลด 50 ทวิจากตารางนี้' : 'Review payees, tax rates, and download 50 ทวิ certificates from this ledger'}</p>
            </div>
            <p className="text-sm font-semibold text-slate-700 tabular-nums">
              {isThai ? 'ยอดสุทธิ' : 'Net paid'} {formatCurrency(totalNet)}
            </p>
          </div>
          <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{isThai ? 'เลขที่ใบรับรอง' : 'Certificate No.'}</th>
                <th className="table-header">{isThai ? 'ผู้รับเงินได้' : 'Payee'}</th>
                <th className="table-header text-right">{isThai ? 'อัตรา' : 'Rate'}</th>
                <th className="table-header text-right">{isThai ? 'ยอดเงินได้' : 'Income'}</th>
                <th className="table-header text-right">{isThai ? 'ภาษีหัก' : 'WHT'}</th>
                <th className="table-header text-right">{isThai ? 'ยอดสุทธิ' : 'Net'}</th>
                <th className="table-header text-center">{isThai ? 'ดาวน์โหลด' : 'Download'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {certificates.map((cert) => (
                <tr key={cert.id} className="hover:bg-gray-50">
                  <td className="table-cell text-sm font-semibold text-primary-700 tabular-nums">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-primary-600 flex-shrink-0" />
                      {cert.certificateNumber}
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="font-medium text-gray-900">{cert.recipientName}</div>
                    <div className="text-xs text-gray-500">{cert.recipientTaxId} {cert.recipientBranch !== '00000' ? `(สาขา ${cert.recipientBranch})` : ''}</div>
                  </td>
                  <td className="table-cell text-right">
                    <span className={`inline-flex rounded-full border bg-white px-2 py-1 text-xs font-semibold ${
                      cert.whtRate === '1' ? 'border-primary-100 text-primary-700' :
                      cert.whtRate === '3' ? 'border-amber-200 text-amber-700' :
                      'border-rose-200 text-rose-700'
                    }`}>
                      {cert.whtRate}%
                    </span>
                    <div className="text-xs text-gray-500 mt-0.5">{WHT_RATE_LABELS[cert.incomeType] ?? cert.incomeType}</div>
                  </td>
                  <td className="table-cell text-right font-semibold tabular-nums">{formatCurrency(cert.totalAmount)}</td>
                  <td className="table-cell text-right font-semibold text-rose-600 tabular-nums">{formatCurrency(cert.whtAmount)}</td>
                  <td className="table-cell text-right font-semibold text-gray-700 tabular-nums">{formatCurrency(cert.netAmount)}</td>
                  <td className="table-cell text-center">
                    <button
                      onClick={() => handleDownloadPdf(cert.id)}
                      disabled={downloadingId === cert.id}
                      className="btn-secondary p-2"
                      title={isThai ? 'ดาวน์โหลด PDF' : 'Download PDF'}
                    >
                      {downloadingId === cert.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {!loading && certificates.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 text-center sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">{isThai ? 'จำนวนใบรับรอง' : 'Total Certificates'}</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{certificates.length}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">{isThai ? 'ภาษีหักรวม' : 'Total Withheld'}</p>
              <p className="text-2xl font-bold text-rose-600 tabular-nums">
                {formatCurrency(totalWithheld)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">{isThai ? 'ยอดเงินได้รวม' : 'Total Income'}</p>
              <p className="text-2xl font-bold text-gray-700 tabular-nums">
                {formatCurrency(totalIncome)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
