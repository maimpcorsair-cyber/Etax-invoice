import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, CheckCircle, Copy, CreditCard, Download, ExternalLink, Loader2, Mail, Send, X } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { useAuthStore } from '../../store/authStore';

interface IssuedInvoice {
  id: string;
  invoiceNumber: string;
  total: number;
  status?: string;
  isPaid?: boolean;
  paidAmount?: number | null;
  pdfUrl?: string | null;
  verificationUrl?: string | null;
  buyer?: { email?: string | null } | null;
}

interface Props {
  invoiceId: string | null;
  onClose: () => void;
}

export default function IssuedSuccessModal({ invoiceId, onClose }: Props) {
  const { isThai, formatCurrency } = useLanguage();
  const { token } = useAuthStore();
  const [invoice, setInvoice] = useState<IssuedInvoice | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'error'>('idle');
  const [paymentState, setPaymentState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId || !token) return;
    let active = true;

    setInvoice(null);
    setShareUrl(null);
    setShareState('loading');
    setShareError(null);
    setCopied(false);
    setDownloadState('idle');
    setPaymentState('idle');
    setPaymentError(null);
    setEmailState('idle');
    setEmailError(null);

    async function loadInvoice() {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json() as { data: IssuedInvoice };
        if (active) setInvoice(json.data);
      } catch {
        // Keep the modal usable for copy/share even if polling hiccups once.
      }
    }

    async function createCustomerLink() {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}/share-link`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error ?? 'Failed to create customer link');
        if (active) {
          setShareUrl(json.url);
          setShareState('ready');
        }
      } catch (error) {
        if (active) {
          setShareState('error');
          setShareError(error instanceof Error ? error.message : 'Failed to create customer link');
        }
      }
    }

    void loadInvoice();
    void createCustomerLink();

    const timers = [3000, 6000, 9000, 12000, 15000].map((delay) => setTimeout(loadInvoice, delay));
    return () => {
      active = false;
      timers.forEach(clearTimeout);
    };
  }, [invoiceId, token]);

  if (!invoiceId) return null;

  const verifyUrl = invoice?.verificationUrl ?? `${window.location.origin}/invoices/verify/${invoiceId}`;
  const customerUrl = shareUrl ?? verifyUrl;
  const customerLinkReady = shareState === 'ready' && Boolean(shareUrl);
  const buyerEmail = invoice?.buyer?.email ?? null;
  const canRecordPayment = Boolean(invoice && !invoice.isPaid && invoice.status !== 'cancelled');
  const lineMessage = invoice
    ? isThai
      ? `${invoice.invoiceNumber}\nดูเอกสารและชำระเงินได้ที่นี่:\n${customerUrl}`
      : `${invoice.invoiceNumber}\nView the invoice and pay here:\n${customerUrl}`
    : customerUrl;

  async function copyCustomerLink() {
    await navigator.clipboard.writeText(customerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openLineShare() {
    const url = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(customerUrl)}&text=${encodeURIComponent(lineMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function downloadPdf() {
    if (!token) return;
    setDownloadState('downloading');
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/preview?format=pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice?.invoiceNumber ?? 'invoice'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDownloadState('idle');
    } catch {
      setDownloadState('error');
    }
  }

  async function recordPayment() {
    if (!invoice || !token) return;
    setPaymentState('saving');
    setPaymentError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount: invoice.total,
          method: 'transfer',
          paidAt: new Date().toISOString().split('T')[0],
        }),
      });
      const json = await res.json().catch(() => ({})) as { error?: string; invoiceIsPaid?: boolean; invoicePaidAmount?: number };
      if (!res.ok) throw new Error(json.error ?? 'Failed to record payment');
      setInvoice((prev) => prev ? {
        ...prev,
        isPaid: json.invoiceIsPaid ?? true,
        paidAmount: json.invoicePaidAmount ?? prev.total,
      } : prev);
      setPaymentState('saved');
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Failed to record payment');
      setPaymentState('error');
    }
  }

  async function sendEmailToBuyer() {
    if (!token || !buyerEmail) return;
    setEmailState('sending');
    setEmailError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed');
      }
      setEmailState('sent');
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'Failed');
      setEmailState('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle className="h-6 w-6 shrink-0 text-emerald-600" />
            <h2 className="truncate text-lg font-bold text-gray-900">
              {isThai ? 'ออกเอกสารสำเร็จ พร้อมส่งให้ลูกค้า' : 'Issued and ready to send'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4 px-5 pb-5">
          {invoice ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-emerald-900">{invoice.invoiceNumber}</p>
                  <p className="mt-0.5 text-2xl font-bold text-emerald-950">{formatCurrency(invoice.total)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${invoice.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                  {invoice.isPaid ? (isThai ? 'ชำระแล้ว' : 'Paid') : (isThai ? 'รอชำระ' : 'Unpaid')}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-emerald-700">
                {isThai
                  ? 'ส่งลิงก์นี้ให้ลูกค้า ลูกค้าดู PDF และชำระเงินได้โดยไม่ต้องเข้าสู่ระบบ'
                  : 'Send this link to the buyer. They can view the PDF and payment details without logging in.'}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isThai ? 'กำลังโหลดข้อมูล...' : 'Loading...'}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-center">
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-medium text-gray-700">
                {isThai ? 'QR สำหรับลูกค้า' : 'Customer QR'}
              </p>
              <div className="rounded-xl border-2 border-gray-200 bg-white p-3">
                <QRCodeSVG value={customerUrl} size={180} level="M" includeMargin={false} />
              </div>
              <p className="text-center text-xs text-gray-400">
                {isThai ? 'เปิดหน้าใบกำกับและช่องทางชำระเงิน' : 'Opens the invoice and payment page'}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {isThai ? 'ส่งให้ลูกค้าตอนนี้' : 'Send it now'}
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  {isThai
                    ? 'คัดลอกลิงก์หรือเปิด LINE แล้ววางในแชทลูกค้าได้ทันที'
                    : 'Copy the link or open LINE, then paste it into the customer chat.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareState === 'loading' ? (isThai ? 'กำลังสร้างลิงก์ลูกค้า...' : 'Creating customer link...') : customerUrl}
                  className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600"
                />
                <button
                  type="button"
                  onClick={copyCustomerLink}
                  disabled={!customerLinkReady}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? (isThai ? 'คัดลอกแล้ว' : 'Copied') : (isThai ? 'คัดลอก' : 'Copy')}
                </button>
              </div>
              {shareState === 'error' && shareError && (
                <p className="text-xs text-rose-600">{shareError}</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={openLineShare}
                  disabled={!customerLinkReady}
                  className="btn-primary justify-center text-sm disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {isThai ? 'เปิด LINE' : 'Open LINE'}
                </button>
                {customerLinkReady ? (
                  <a href={customerUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary justify-center text-sm">
                    <ExternalLink className="h-4 w-4" />
                    {isThai ? 'ดูหน้าลูกค้า' : 'View customer page'}
                  </a>
                ) : (
                  <button type="button" disabled className="btn-secondary justify-center text-sm opacity-60">
                    <ExternalLink className="h-4 w-4" />
                    {isThai ? 'รอลิงก์ลูกค้า' : 'Waiting for link'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-2 pt-1 sm:grid-cols-3">
            <button
              type="button"
              onClick={downloadPdf}
              disabled={downloadState === 'downloading'}
              className="btn-secondary justify-center text-sm disabled:opacity-60"
            >
              {downloadState === 'downloading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isThai ? 'ดาวน์โหลด PDF' : 'Download PDF'}
            </button>
            <button
              type="button"
              onClick={recordPayment}
              disabled={!canRecordPayment || paymentState === 'saving' || paymentState === 'saved'}
              className={`justify-center text-sm ${paymentState === 'saved' || invoice?.isPaid ? 'btn-secondary' : 'btn-primary'} disabled:opacity-60`}
            >
              {paymentState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : paymentState === 'saved' || invoice?.isPaid ? <Check className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
              {paymentState === 'saved' || invoice?.isPaid ? (isThai ? 'บันทึกรับเงินแล้ว' : 'Payment recorded') : (isThai ? 'บันทึกรับเงิน' : 'Record payment')}
            </button>
            <a href={verifyUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary justify-center text-sm">
              <ExternalLink className="h-4 w-4" />
              {isThai ? 'ตรวจสอบเอกสาร' : 'Verify'}
            </a>
          </div>

          {downloadState === 'error' && (
            <p className="text-xs text-rose-600">{isThai ? 'ดาวน์โหลด PDF ไม่สำเร็จ ลองใหม่อีกครั้ง' : 'PDF download failed. Try again.'}</p>
          )}
          {paymentState === 'error' && paymentError && (
            <p className="text-xs text-rose-600">{paymentError}</p>
          )}

          {buyerEmail ? (
            <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
              <Mail className="h-4 w-4 shrink-0 text-sky-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-sky-900">
                  {isThai ? 'ส่งอีเมลให้ลูกค้า' : 'Email to customer'}
                </p>
                <p className="truncate text-[11px] text-sky-700">{buyerEmail}</p>
                {emailState === 'error' && emailError && (
                  <p className="mt-0.5 truncate text-[11px] text-red-600">{emailError}</p>
                )}
              </div>
              <button
                type="button"
                onClick={sendEmailToBuyer}
                disabled={emailState === 'sending' || emailState === 'sent'}
                className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                  emailState === 'sent'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-sky-600 text-white hover:bg-sky-700'
                }`}
              >
                {emailState === 'sending' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {emailState === 'sent' && <Check className="h-3.5 w-3.5" />}
                {emailState === 'sending'
                  ? (isThai ? 'กำลังส่ง...' : 'Sending...')
                  : emailState === 'sent'
                    ? (isThai ? 'ส่งแล้ว' : 'Sent')
                    : (isThai ? 'ส่งเลย' : 'Send')}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600">
              {isThai
                ? 'ไม่มีอีเมลลูกค้าในรายชื่อนี้ ใช้ลิงก์หรือ LINE เป็นช่องทางหลักได้เลย'
                : 'No customer email is saved. Use the link or LINE as the primary send path.'}
            </div>
          )}

          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            <button type="button" onClick={onClose} className="btn-primary justify-center text-sm">
              {isThai ? 'เสร็จแล้ว ไปดูรายการ' : 'Done, view list'}
            </button>
            <a href={`/app/invoices/${invoiceId}/edit`} className="btn-secondary justify-center text-sm">
              {isThai ? 'กลับไปแก้เอกสาร' : 'Back to document'}
            </a>
          </div>

          {invoice?.pdfUrl && (
            <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-xs font-medium text-gray-500 hover:text-gray-700">
              {isThai ? 'เปิด PDF ที่สร้างไว้แล้ว' : 'Open generated PDF'}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
