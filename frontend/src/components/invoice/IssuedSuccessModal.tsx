import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle, Download, X, ExternalLink, Copy, Check } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { useAuthStore } from '../../store/authStore';

interface IssuedInvoice {
  id: string;
  invoiceNumber: string;
  total: number;
  pdfUrl?: string | null;
  verificationUrl?: string | null;
}

interface Props {
  invoiceId: string | null;
  onClose: () => void;
}

export default function IssuedSuccessModal({ invoiceId, onClose }: Props) {
  const { isThai, formatCurrency } = useLanguage();
  const { token } = useAuthStore();
  const [invoice, setInvoice] = useState<IssuedInvoice | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!invoiceId || !token) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data: IssuedInvoice };
        if (active) setInvoice(json.data);
      } catch { /* ignore */ }
    };
    poll();
    // poll every 3s up to 15s for PDF URL
    const intervals = [3000, 6000, 9000, 12000, 15000];
    const timers = intervals.map((delay) => setTimeout(poll, delay));
    return () => { active = false; timers.forEach(clearTimeout); };
  }, [invoiceId, token]);

  if (!invoiceId) return null;

  const verifyUrl = invoice?.verificationUrl
    ?? `${window.location.origin}/invoices/verify/${invoiceId}`;

  const copyUrl = async () => {
    await navigator.clipboard.writeText(verifyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-6 h-6 text-green-500" />
            <h2 className="text-lg font-bold text-gray-900">
              {isThai ? 'ออกเอกสารสำเร็จ!' : 'Document Issued!'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Invoice info */}
          {invoice && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm font-semibold text-green-800">{invoice.invoiceNumber}</p>
              <p className="text-sm text-green-700">{formatCurrency(invoice.total)}</p>
              <p className="text-xs text-green-600 mt-1">
                {isThai ? 'กำลังสร้าง PDF อยู่เบื้องหลัง...' : 'PDF is being generated in the background...'}
              </p>
            </div>
          )}
          {!invoice && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              {isThai ? 'กำลังโหลดข้อมูล...' : 'Loading...'}
            </div>
          )}

          {/* QR Code */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm font-medium text-gray-700">
              {isThai ? 'QR Code สำหรับตรวจสอบเอกสาร' : 'Document verification QR Code'}
            </p>
            <div className="p-3 border-2 border-gray-200 rounded-xl bg-white">
              <QRCodeSVG
                value={verifyUrl}
                size={180}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-xs text-gray-400 text-center">
              {isThai ? 'สแกนเพื่อยืนยันความถูกต้องของเอกสาร' : 'Scan to verify document authenticity'}
            </p>
          </div>

          {/* URL copy */}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={verifyUrl}
              className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 truncate"
            />
            <button
              onClick={copyUrl}
              className="shrink-0 flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? (isThai ? 'คัดลอกแล้ว' : 'Copied') : (isThai ? 'คัดลอก' : 'Copy')}
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {invoice?.pdfUrl && (
              <a
                href={invoice.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 btn-primary text-sm justify-center"
              >
                <Download className="w-4 h-4" />
                {isThai ? 'ดาวน์โหลด PDF' : 'Download PDF'}
              </a>
            )}
            <a
              href={verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 btn-secondary text-sm justify-center"
            >
              <ExternalLink className="w-4 h-4" />
              {isThai ? 'ตรวจสอบเอกสาร' : 'Verify'}
            </a>
          </div>

          <button
            onClick={onClose}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
          >
            {isThai ? 'ปิดและกลับรายการ' : 'Close and back to list'}
          </button>
        </div>
      </div>
    </div>
  );
}
