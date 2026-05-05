import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Printer, Loader2, FileText, Calendar } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { Pp30Data, WhtSummaryData } from '../types';
import { Receipt } from 'lucide-react';

const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pp30?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setData(json.data ?? null);

      // Also fetch WHT summary
      try {
        const whtRes = await fetch(`/api/pp30/wht?year=${year}&month=${month}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const whtJson = await whtRes.json();
        setWhtData(whtJson.data ?? null);
      } catch {
        setWhtData(null);
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
      alert(isThai ? 'ส่งออกไม่สำเร็จ' : 'Export failed');
    } finally {
      setExporting(false);
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

  const vatPayable = data?.vatPayable ?? 0;
  const mustPay = vatPayable > 0;

  return (
    <div className="space-y-4">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .pp30-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
        }
      `}</style>

      {/* Header (no print) */}
      <div className="no-print flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary-600" />
            {isThai ? 'รายงาน ภ.พ.30' : 'PP.30 Report'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isThai
              ? 'สรุปการยื่นภาษีมูลค่าเพิ่มรายเดือนตามแบบ ภ.พ.30 ของกรมสรรพากร'
              : 'Monthly VAT filing summary as per Revenue Department PP.30 form'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting} className="btn-secondary">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isThai ? 'ดาวน์โหลด CSV' : 'Download CSV'}
          </button>
          <button onClick={handlePrint} className="btn-primary">
            <Printer className="w-4 h-4" />
            {isThai ? 'พิมพ์รายงาน' : 'Print'}
          </button>
          <button
            onClick={() => setActiveTab('wht')}
            className={`btn-secondary ${activeTab === 'wht' ? 'ring-2 ring-red-400' : ''}`}
          >
            <Receipt className="w-4 h-4" />
            {isThai ? 'ภาษีหัก ณ ที่จ่าย' : 'WHT Summary'}
          </button>
        </div>
      </div>

      {/* Period selector (no print) */}
      <div className="no-print card">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">{isThai ? 'งวด' : 'Period'}:</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input-field w-auto">
            {(isThai ? TH_MONTHS : EN_MONTHS).map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-field w-auto">
            {yearOptions.map((y) => (
              <option key={y} value={y}>{isThai ? y + 543 : y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          {/* Header card */}
          <div className="card pp30-card">
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

          {/* Sales section (Output VAT) */}
          <div className="card pp30-card p-0 overflow-hidden">
            <div className="px-5 py-3 bg-green-50 border-b border-green-100">
              <h2 className="font-bold text-gray-900">
                {isThai ? '1. ภาษีขาย (Output VAT)' : '1. Output VAT (Sales)'}
              </h2>
            </div>
            <table className="w-full">
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
                  <td className="table-cell text-right">{formatCurrency(data?.sales.byVatType.vat7.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right font-semibold text-green-700">{formatCurrency(data?.sales.byVatType.vat7.vatAmount ?? 0)}</td>
                </tr>
                <tr>
                  <td className="table-cell font-medium">{isThai ? 'อัตรา 0%' : 'Zero-rated'}</td>
                  <td className="table-cell text-right">{formatCurrency(data?.sales.byVatType.vatZero.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right">{formatCurrency(data?.sales.byVatType.vatZero.vatAmount ?? 0)}</td>
                </tr>
                <tr>
                  <td className="table-cell font-medium">{isThai ? 'ยกเว้น VAT' : 'VAT Exempt'}</td>
                  <td className="table-cell text-right">{formatCurrency(data?.sales.byVatType.vatExempt.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right text-gray-400">—</td>
                </tr>
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-4 py-3 font-semibold text-gray-900">{isThai ? 'รวมยอดขาย' : 'Total Sales'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(data?.sales.totalExclVat ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(data?.sales.outputVat ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Purchases section (Input VAT) */}
          <div className="card pp30-card p-0 overflow-hidden">
            <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
              <h2 className="font-bold text-gray-900">
                {isThai ? '2. ภาษีซื้อ (Input VAT)' : '2. Input VAT (Purchases)'}
              </h2>
            </div>
            <table className="w-full">
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
                  <td className="table-cell text-right">{formatCurrency(data?.purchases.byVatType.vat7.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right font-semibold text-blue-700">{formatCurrency(data?.purchases.byVatType.vat7.vatAmount ?? 0)}</td>
                </tr>
                <tr>
                  <td className="table-cell font-medium">{isThai ? 'อัตรา 0%' : 'Zero-rated'}</td>
                  <td className="table-cell text-right">{formatCurrency(data?.purchases.byVatType.vatZero.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right">{formatCurrency(data?.purchases.byVatType.vatZero.vatAmount ?? 0)}</td>
                </tr>
                <tr>
                  <td className="table-cell font-medium">{isThai ? 'ยกเว้น VAT' : 'VAT Exempt'}</td>
                  <td className="table-cell text-right">{formatCurrency(data?.purchases.byVatType.vatExempt.totalExclVat ?? 0)}</td>
                  <td className="table-cell text-right text-gray-400">—</td>
                </tr>
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-4 py-3 font-semibold text-gray-900">{isThai ? 'รวมยอดซื้อ' : 'Total Purchases'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(data?.purchases.totalExclVat ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-700">{formatCurrency(data?.purchases.inputVat ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary card */}
          <div className={`card pp30-card border-2 ${mustPay ? 'border-red-200 bg-red-50/30' : 'border-emerald-200 bg-emerald-50/30'}`}>
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
              <div className={`flex justify-between items-center py-3 mt-2 px-4 rounded-lg ${mustPay ? 'bg-red-100' : 'bg-emerald-100'}`}>
                <span className={`text-base font-bold ${mustPay ? 'text-red-900' : 'text-emerald-900'}`}>
                  {mustPay
                    ? (isThai ? 'ภาษีที่ต้องชำระ' : 'VAT Payable')
                    : (isThai ? 'ภาษีที่ขอคืน' : 'VAT Refundable')}
                </span>
                <span className={`text-2xl font-bold ${mustPay ? 'text-red-700' : 'text-emerald-700'}`}>
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
              <div className="card pp30-card border-red-200 bg-red-50/30">
                <div className="flex items-center gap-2 mb-4">
                  <Receipt className="w-5 h-5 text-red-600" />
                  <h2 className="font-bold text-gray-900">
                    {isThai ? 'สรุปภาษีหัก ณ ที่จ่าย' : 'Withholding Tax Summary'}
                  </h2>
                </div>
                {whtData ? (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-white rounded-lg p-4 text-center border border-red-100">
                        <p className="text-xs text-gray-500 mb-1">{isThai ? 'จำนวนใบรับรอง' : 'Total Certificates'}</p>
                        <p className="text-2xl font-bold text-gray-900">{whtData.totalCertificates}</p>
                      </div>
                      <div className="bg-white rounded-lg p-4 text-center border border-red-100">
                        <p className="text-xs text-gray-500 mb-1">{isThai ? 'ภาษีหักรวม' : 'Total Withheld'}</p>
                        <p className="text-2xl font-bold text-red-600">{formatCurrency(whtData.totalWithheld)}</p>
                      </div>
                      <div className="bg-white rounded-lg p-4 text-center border border-red-100">
                        <p className="text-xs text-gray-500 mb-1">{isThai ? 'ยอดเงินได้รวม' : 'Total Income'}</p>
                        <p className="text-2xl font-bold text-gray-700">{formatCurrency(whtData.totalAmount)}</p>
                      </div>
                    </div>
                    {/* By-rate breakdown */}
                    <div className="overflow-hidden rounded-lg border border-red-100">
                      <table className="w-full">
                        <thead className="bg-red-50">
                          <tr>
                            <th className="table-header">{isThai ? 'อัตราภาษี' : 'Rate'}</th>
                            <th className="table-header">{isThai ? 'ประเภทเงินได้' : 'Income Type'}</th>
                            <th className="table-header text-right">{isThai ? 'จำนวนใบ' : 'Count'}</th>
                            <th className="table-header text-right">{isThai ? 'ยอดเงินได้' : 'Total Income'}</th>
                            <th className="table-header text-right">{isThai ? 'ภาษีหัก' : 'Withheld'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-100">
                          {whtData.byRate.filter(r => r.count > 0).map((rate) => (
                            <tr key={rate.rate}>
                              <td className="table-cell font-semibold text-red-700">{rate.rate}%</td>
                              <td className="table-cell text-sm text-gray-600">{rate.label}</td>
                              <td className="table-cell text-right">{rate.count}</td>
                              <td className="table-cell text-right">{formatCurrency(rate.totalAmount)}</td>
                              <td className="table-cell text-right font-semibold text-red-600">{formatCurrency(rate.totalWithheld)}</td>
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
