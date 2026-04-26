import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle, XCircle, FileText, Loader2, ShieldCheck } from 'lucide-react';

interface VerifyData {
  invoiceNumber: string;
  type: string;
  invoiceDate: string;
  total: number;
  status: string;
  sellerName: string;
  sellerTaxId: string;
  buyerName: string;
  pdfUrl?: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  tax_invoice: 'ใบกำกับภาษี',
  tax_invoice_receipt: 'ใบกำกับภาษี/ใบเสร็จรับเงิน',
  receipt: 'ใบเสร็จรับเงิน',
  credit_note: 'ใบลดหนี้',
  debit_note: 'ใบเพิ่มหนี้',
};

export default function InvoiceVerify() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<VerifyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/invoices/verify/${id}`)
      .then((r) => r.json())
      .then((json: { data?: VerifyData; error?: string }) => {
        if (json.data) setData(json.data);
        else setError(json.error ?? 'ไม่พบเอกสาร');
      })
      .catch(() => setError('ไม่สามารถเชื่อมต่อได้'))
      .finally(() => setLoading(false));
  }, [id]);

  const verifyUrl = `${window.location.origin}/invoices/verify/${id}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-primary-700 px-5 py-4 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-white" />
          <div>
            <p className="text-white font-bold text-sm">ตรวจสอบเอกสาร e-Tax</p>
            <p className="text-primary-200 text-xs">e-Tax Invoice Verification</p>
          </div>
        </div>

        <div className="p-5">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              <p className="text-sm text-gray-500">กำลังตรวจสอบ...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <XCircle className="w-12 h-12 text-red-500" />
              <p className="font-semibold text-gray-800">ไม่พบเอกสาร</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          )}

          {data && !loading && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                <p className="font-semibold text-green-700 text-sm">เอกสารถูกต้องและออกโดยระบบ</p>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 text-sm">
                <Row label="เลขที่เอกสาร" value={data.invoiceNumber} bold />
                <Row label="ประเภท" value={TYPE_LABEL[data.type] ?? data.type} />
                <Row label="วันที่ออก" value={new Date(data.invoiceDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })} />
                <Row label="ยอดรวม" value={new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(data.total)} bold />
                <Row label="ผู้ออกเอกสาร" value={data.sellerName} />
                <Row label="เลขประจำตัวผู้เสียภาษี" value={data.sellerTaxId} />
                <Row label="ผู้รับ" value={data.buyerName} />
              </div>

              <div className="flex flex-col items-center gap-2 pt-2">
                <p className="text-xs text-gray-500">QR Code ยืนยันเอกสาร</p>
                <div className="p-2 border border-gray-200 rounded-xl bg-white">
                  <QRCodeSVG value={verifyUrl} size={120} level="M" />
                </div>
              </div>

              {data.pdfUrl && (
                <a
                  href={data.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  ดาวน์โหลด PDF
                </a>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 text-center">
          <Link to="/" className="text-xs text-gray-400 hover:text-gray-600">
            e-Tax Invoice System · etax-invoice.vercel.app
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-3 px-3 py-2">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <span className={`text-right text-xs ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{value}</span>
    </div>
  );
}
