import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FileText, Loader2, Search, Calendar, Receipt } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { WhtCertificate } from '../types';

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
      alert(isThai ? 'ดาวน์โหลดไม่สำเร็จ' : 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  }

  const yearOptions: number[] = [];
  for (let y = new Date().getFullYear(); y >= new Date().getFullYear() - 5; y--) yearOptions.push(y);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Receipt className="w-6 h-6 text-red-600" />
          {isThai ? 'ใบรับรองหักภาษี ณ ที่จ่าย (50 ทวิ)' : 'Withholding Tax Certificates (50 ทวิ)'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isThai
            ? 'รายการใบรับรองภาษีหัก ณ ที่จ่ายตามมาตรา 40 แห่งประมวลรัษฎากร'
            : 'List of withholding tax certificates under Section 40 of the Thai Revenue Code'}
        </p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar className="w-5 h-5 text-gray-400" />
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
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isThai ? 'ค้นหาเลขที่ใบรับรอง / ชื่อผู้รับเงิน...' : 'Search certificate number or payee name...'}
              className="input-field pl-9 w-full"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : certificates.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">{isThai ? 'ไม่มีใบรับรอง' : 'No certificates'}</p>
          <p className="text-sm mt-1">
            {isThai
              ? 'ยังไม่มีใบรับรองหักภาษีในงวดนี้'
              : 'No WHT certificates for this period'}
          </p>
          <Link to="/app/invoice-builder" className="btn-primary mt-4 inline-flex">
            <FileText className="w-4 h-4" />
            {isThai ? 'สร้างใบกำกับภาษี' : 'Create Invoice'}
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
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
                  <td className="table-cell font-mono text-sm font-semibold">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-red-400 flex-shrink-0" />
                      {cert.certificateNumber}
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="font-medium text-gray-900">{cert.recipientName}</div>
                    <div className="text-xs text-gray-500">{cert.recipientTaxId} {cert.recipientBranch !== '00000' ? `(สาขา ${cert.recipientBranch})` : ''}</div>
                  </td>
                  <td className="table-cell text-right">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                      cert.whtRate === '1' ? 'bg-blue-100 text-blue-700' :
                      cert.whtRate === '3' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {cert.whtRate}%
                    </span>
                    <div className="text-xs text-gray-500 mt-0.5">{WHT_RATE_LABELS[cert.incomeType] ?? cert.incomeType}</div>
                  </td>
                  <td className="table-cell text-right font-medium">{formatCurrency(cert.totalAmount)}</td>
                  <td className="table-cell text-right font-semibold text-red-600">{formatCurrency(cert.whtAmount)}</td>
                  <td className="table-cell text-right font-medium text-gray-700">{formatCurrency(cert.netAmount)}</td>
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
      )}

      {/* Summary footer */}
      {!loading && certificates.length > 0 && (
        <div className="card bg-red-50 border-red-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-red-600 mb-1">{isThai ? 'จำนวนใบรับรอง' : 'Total Certificates'}</p>
              <p className="text-2xl font-bold text-gray-900">{certificates.length}</p>
            </div>
            <div>
              <p className="text-xs text-red-600 mb-1">{isThai ? 'ภาษีหักรวม' : 'Total Withheld'}</p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(certificates.reduce((s, c) => s + c.whtAmount, 0))}
              </p>
            </div>
            <div>
              <p className="text-xs text-red-600 mb-1">{isThai ? 'ยอดเงินได้รวม' : 'Total Income'}</p>
              <p className="text-2xl font-bold text-gray-700">
                {formatCurrency(certificates.reduce((s, c) => s + c.totalAmount, 0))}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}