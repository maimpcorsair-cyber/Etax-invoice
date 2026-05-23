import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Download, FileText, QrCode, AlertCircle } from 'lucide-react';

// /share/invoice/<token> — buyer-facing read-only view of a single
// invoice. The seller shares the URL via LINE / email / SMS. No login,
// no signup. The JWT in the URL IS the credential — backend verifies it
// and returns invoice data scoped to its companyId claim.
//
// Stays minimal on purpose: header, summary, PDF download, PromptPay QR
// (when seller has it configured + invoice is unpaid). No edit, no
// "I've paid" button — the seller verifies their bank statement and
// marks the invoice paid in their Billboy workspace.

interface ShareData {
  invoice: {
    id: string;
    invoiceNumber: string;
    type: string;
    status: string;
    isPaid: boolean;
    language: string;
    invoiceDate: string;
    dueDate: string | null;
    subtotal: number;
    vatAmount: number;
    total: number;
    pdfUrl: string | null;
  };
  buyer: { nameTh: string; nameEn: string | null; taxId: string };
  seller: { nameTh: string; nameEn: string | null; taxId: string };
  promptPay: { qrImageDataUrl: string; target: string } | null;
  tokenExp?: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatThaiDate(iso: string): string {
  const d = new Date(iso);
  const buddhistYear = d.getFullYear() + 543;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${buddhistYear}`;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  tax_invoice: 'ใบกำกับภาษี',
  tax_invoice_receipt: 'ใบกำกับภาษี/ใบเสร็จรับเงิน',
  receipt: 'ใบเสร็จรับเงิน',
  credit_note: 'ใบลดหนี้',
  debit_note: 'ใบเพิ่มหนี้',
};

export default function InvoiceShare() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('ลิงก์ไม่ถูกต้อง');
      setLoading(false);
      return;
    }
    fetch(`/api/share/invoice/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body as ShareData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h1 className="text-xl font-semibold text-slate-900">เปิดเอกสารไม่ได้</h1>
          <p className="text-sm text-slate-600">{error ?? 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว'}</p>
          <p className="text-xs text-slate-400">กรุณาติดต่อผู้ส่งให้ออกลิงก์ใหม่</p>
        </div>
      </div>
    );
  }

  const { invoice, buyer, seller, promptPay } = data;
  const docLabel = DOC_TYPE_LABEL[invoice.type] ?? invoice.type;
  const showQr = !!promptPay && !invoice.isPaid;

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">{docLabel}</p>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">{invoice.invoiceNumber}</h1>
              <p className="text-xs text-slate-500 mt-1">ออกเมื่อ {formatThaiDate(invoice.invoiceDate)}</p>
            </div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
              invoice.isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : invoice.status === 'cancelled' ? 'bg-slate-100 text-slate-600 border border-slate-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {invoice.isPaid ? 'ชำระแล้ว' : invoice.status === 'cancelled' ? 'ยกเลิก' : 'รอชำระ'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-500 mb-1">จาก (ผู้ขาย)</p>
              <p className="font-semibold text-slate-900">{seller.nameTh}</p>
              <p className="text-xs text-slate-500">เลขผู้เสียภาษี: {seller.taxId}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">ถึง (ผู้รับ)</p>
              <p className="font-semibold text-slate-900">{buyer.nameTh}</p>
              {buyer.taxId && <p className="text-xs text-slate-500">เลขผู้เสียภาษี: {buyer.taxId}</p>}
            </div>
          </div>

          {invoice.dueDate && !invoice.isPaid && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              ครบกำหนดชำระ: <span className="font-semibold">{formatThaiDate(invoice.dueDate)}</span>
            </div>
          )}
        </div>

        {/* Amount summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">มูลค่าก่อนภาษี</span>
            <span className="font-medium text-slate-900">{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">ภาษีมูลค่าเพิ่ม (VAT)</span>
            <span className="font-medium text-slate-900">{formatCurrency(invoice.vatAmount)}</span>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="font-semibold text-slate-900">ยอดสุทธิ</span>
            <span className="text-2xl font-bold text-slate-900">{formatCurrency(invoice.total)}</span>
          </div>
        </div>

        {/* PromptPay QR */}
        {showQr && promptPay && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <QrCode className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-semibold text-slate-900">สแกนชำระเงิน (PromptPay)</h2>
            </div>
            <div className="flex flex-col items-center gap-3">
              <img
                src={promptPay.qrImageDataUrl}
                alt="PromptPay QR"
                className="w-64 h-64 border border-slate-200 rounded-xl p-2 bg-white"
              />
              <p className="text-xs text-slate-500 text-center">
                สแกนด้วยแอป mobile banking ใดก็ได้<br />
                ระบบไม่อัปเดตอัตโนมัติ ผู้ขายจะยืนยันเมื่อตรวจสอบ statement
              </p>
            </div>
          </div>
        )}

        {/* PDF button */}
        {invoice.pdfUrl ? (
          <a
            href={`/api/share/invoice/${encodeURIComponent(token ?? '')}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-slate-900 hover:bg-slate-800 text-white text-center font-semibold py-3 rounded-2xl shadow-sm transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <Download className="w-4 h-4" />
              ดาวน์โหลด PDF
            </span>
          </a>
        ) : (
          <div className="bg-slate-100 text-slate-500 text-center text-sm py-3 rounded-2xl">
            <FileText className="w-4 h-4 inline mr-1" />
            PDF กำลังจัดทำ กรุณารอสักครู่
          </div>
        )}

        <p className="text-center text-xs text-slate-400 pt-2">
          ส่งโดย Billboy · ระบบจัดการบัญชีและภาษี
        </p>
      </div>
    </div>
  );
}
