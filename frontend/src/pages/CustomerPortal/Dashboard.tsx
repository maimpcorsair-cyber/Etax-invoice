import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Receipt, Truck, Download, LogOut, Loader2, ExternalLink, Building2 } from 'lucide-react';
import { ToastStack, type FeedbackToast } from '../../components/ui/AppFeedback';

const STORAGE_KEY = 'customer_portal_token';

interface PortalMe {
  customer: { id: string; nameTh: string; nameEn?: string | null; taxId: string; email: string | null };
  company: { id: string; nameTh: string; nameEn?: string | null; taxId: string; logoUrl?: string | null };
  sessionExp?: number;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  invoiceDate: string;
  dueDate: string | null;
  total: number;
  isPaid: boolean;
}

interface QuotationRow {
  id: string;
  quotationNumber: string;
  status: string;
  quotationDate: string;
  validUntil: string | null;
  total: number;
  convertedToInvoiceId: string | null;
}

interface DeliveryNoteRow {
  id: string;
  deliveryNoteNumber: string;
  status: string;
  deliveryDate: string;
  carrierName: string | null;
  trackingNo: string | null;
  trackingUrl: string | null;
}

export default function CustomerPortalDashboard() {
  const navigate = useNavigate();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [quotations, setQuotations] = useState<QuotationRow[]>([]);
  const [notes, setNotes] = useState<DeliveryNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toasts, setToasts] = useState<FeedbackToast[]>([]);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  const pushToast = useCallback((toast: Omit<FeedbackToast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4800);
  }, []);

  const token = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

  const fetchPortal = useCallback(async (path: string) => {
    const res = await fetch(`/api/customer-portal${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      localStorage.removeItem(STORAGE_KEY);
      navigate('/portal');
      throw new Error('Session expired');
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Failed');
    return json.data;
  }, [token, navigate]);

  useEffect(() => {
    if (!token) {
      navigate('/portal');
      return;
    }
    (async () => {
      try {
        const [meData, docs] = await Promise.all([
          fetchPortal('/me'),
          fetchPortal('/documents'),
        ]);
        setMe(meData);
        setInvoices(docs.invoices ?? []);
        setQuotations(docs.quotations ?? []);
        setNotes(docs.deliveryNotes ?? []);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, navigate, fetchPortal]);

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    navigate('/portal');
  }

  async function downloadInvoicePdf(invoiceId: string, invoiceNumber: string) {
    setDownloadingInvoiceId(invoiceId);
    try {
      const res = await fetch(`/api/customer-portal/invoices/${invoiceId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('ดาวน์โหลด PDF ไม่สำเร็จ');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      pushToast({
        tone: 'error',
        title: 'ดาวน์โหลด PDF ไม่สำเร็จ',
        description: error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง',
      });
    } finally {
      setDownloadingInvoiceId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="card max-w-md text-center">
          <p className="text-rose-600 mb-3">{err}</p>
          <Link to="/portal" className="btn-primary">กลับไปขอลิงก์ใหม่</Link>
        </div>
      </div>
    );
  }

  const fmt = (n: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);
  const fmtDate = (value: string | null) => value ? new Date(value).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '—';
  const unpaidInvoices = invoices.filter((invoice) => !invoice.isPaid);
  const outstandingTotal = unpaidInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const paidInvoiceCount = invoices.length - unpaidInvoices.length;
  const nextDueInvoice = unpaidInvoices
    .filter((invoice) => invoice.dueDate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0] ?? unpaidInvoices[0] ?? null;
  const latestTracking = notes.find((note) => note.trackingUrl || note.trackingNo) ?? notes[0] ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((toast) => toast.id !== id))} />
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {me?.company.logoUrl ? (
              <img src={me.company.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-700 text-white">
                <Building2 className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">{me?.company.nameTh}</div>
              <div className="truncate text-xs text-slate-500">เอกสารสำหรับ {me?.customer.nameTh}</div>
            </div>
          </div>
          <button onClick={logout} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 sm:w-auto sm:px-4 sm:text-sm sm:font-semibold">
            <LogOut className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only sm:ml-2">ออกจากระบบ</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <section className="relative overflow-hidden rounded-3xl bg-primary-900 px-5 py-6 text-white shadow-xl shadow-slate-950/10 sm:px-7">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-thai-gold/25 blur-3xl" />
          <div className="absolute -bottom-28 left-12 h-64 w-64 rounded-full bg-teal-300/20 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">Billboy Customer Portal</p>
              <h1 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">{me?.customer.nameTh}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
                เอกสารขาย ใบเสนอราคา และการจัดส่งจาก {me?.company.nameTh}
              </p>
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">ยอดรอชำระ</p>
                <p className="mt-2 text-[clamp(2rem,8vw,3rem)] font-bold leading-none tabular-nums">{fmt(outstandingTotal)}</p>
                <div className="mt-4 h-1 w-36 rounded-full bg-gradient-to-r from-thai-gold via-thai-gold/70 to-transparent" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                <p className="text-xs text-white/60">ใบกำกับ</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{invoices.length}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                <p className="text-xs text-white/60">ชำระแล้ว</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{paidInvoiceCount}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                <p className="text-xs text-white/60">ใบเสนอราคา</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{quotations.length}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                <p className="text-xs text-white/60">ใบส่งของ</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{notes.length}</p>
              </div>
            </div>
          </div>
        </section>

        {(nextDueInvoice || latestTracking) && (
          <section className="grid gap-3 md:grid-cols-2">
            {nextDueInvoice && (
              <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-amber-700">เอกสารถัดไป</p>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-primary-700">{nextDueInvoice.invoiceNumber}</p>
                    <p className="mt-1 text-xs text-slate-500">ครบกำหนด {fmtDate(nextDueInvoice.dueDate)}</p>
                  </div>
                  <p className="text-right text-lg font-bold text-slate-950">{fmt(nextDueInvoice.total)}</p>
                </div>
              </div>
            )}
            {latestTracking && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-500">การจัดส่งล่าสุด</p>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-primary-700">{latestTracking.deliveryNoteNumber}</p>
                    <p className="mt-1 text-xs text-slate-500">{latestTracking.carrierName || 'รอข้อมูลขนส่ง'}</p>
                  </div>
                  {latestTracking.trackingUrl ? (
                    <a href={latestTracking.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700">
                      ติดตาม
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{latestTracking.status}</span>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Invoices */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
            <Receipt className="h-5 w-5 text-primary-600" />
            ใบกำกับภาษี / ใบเสร็จ ({invoices.length})
          </h2>
          {invoices.length === 0 ? (
            <div className="card text-center text-slate-400 py-8">ยังไม่มีใบกำกับภาษี</div>
          ) : (
            <>
            <div className="space-y-3 md:hidden">
              {invoices.map((inv) => (
                <div key={inv.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-primary-700">{inv.invoiceNumber}</p>
                      <p className="mt-1 text-xs text-slate-500">{fmtDate(inv.invoiceDate)} · ครบกำหนด {fmtDate(inv.dueDate)}</p>
                    </div>
                    {inv.isPaid ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">ชำระแล้ว</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">รอชำระ</span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-lg font-bold text-slate-950">{fmt(inv.total)}</p>
                    <button onClick={() => downloadInvoicePdf(inv.id, inv.invoiceNumber)} disabled={downloadingInvoiceId === inv.id} className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                      {downloadingInvoiceId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="card hidden overflow-hidden p-0 md:block">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left text-xs uppercase text-slate-500 px-4 py-2">เลขที่</th>
                    <th className="text-left text-xs uppercase text-slate-500 px-4 py-2">วันที่</th>
                    <th className="text-left text-xs uppercase text-slate-500 px-4 py-2">ครบกำหนด</th>
                    <th className="text-right text-xs uppercase text-slate-500 px-4 py-2">ยอด</th>
                    <th className="text-center text-xs uppercase text-slate-500 px-4 py-2">สถานะ</th>
                    <th className="text-right text-xs uppercase text-slate-500 px-4 py-2">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-primary-700">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-sm">{inv.invoiceDate.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{inv.dueDate ? inv.dueDate.slice(0, 10) : '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(inv.total)}</td>
                      <td className="px-4 py-3 text-center">
                        {inv.isPaid ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-semibold">ชำระแล้ว</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 font-semibold">รอชำระ</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => downloadInvoicePdf(inv.id, inv.invoiceNumber)} disabled={downloadingInvoiceId === inv.id} className="text-primary-600 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`ดาวน์โหลด ${inv.invoiceNumber}`}>
                          {downloadingInvoiceId === inv.id ? <Loader2 className="w-4 h-4 inline animate-spin" /> : <Download className="w-4 h-4 inline" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>

        {/* Quotations */}
        <section>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5 text-primary-600" />
            ใบเสนอราคา ({quotations.length})
          </h2>
          {quotations.length === 0 ? (
            <div className="card text-center text-slate-400 py-8">ยังไม่มีใบเสนอราคา</div>
          ) : (
            <>
            <div className="space-y-3 md:hidden">
              {quotations.map((q) => (
                <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-primary-700">{q.quotationNumber}</p>
                      <p className="mt-1 text-xs text-slate-500">{fmtDate(q.quotationDate)} · หมดอายุ {fmtDate(q.validUntil)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary-50 px-2 py-1 text-xs font-bold text-primary-700">{q.status}</span>
                  </div>
                  <p className="mt-4 text-lg font-bold text-slate-950">{fmt(q.total)}</p>
                </div>
              ))}
            </div>
            <div className="card hidden overflow-hidden p-0 md:block">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left text-xs uppercase text-slate-500 px-4 py-2">เลขที่</th>
                    <th className="text-left text-xs uppercase text-slate-500 px-4 py-2">วันที่</th>
                    <th className="text-left text-xs uppercase text-slate-500 px-4 py-2">หมดอายุ</th>
                    <th className="text-right text-xs uppercase text-slate-500 px-4 py-2">ยอด</th>
                    <th className="text-center text-xs uppercase text-slate-500 px-4 py-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quotations.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-primary-700">{q.quotationNumber}</td>
                      <td className="px-4 py-3 text-sm">{q.quotationDate.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{q.validUntil ? q.validUntil.slice(0, 10) : '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(q.total)}</td>
                      <td className="px-4 py-3 text-center text-xs">{q.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>

        {/* Delivery Notes */}
        <section>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
            <Truck className="w-5 h-5 text-primary-600" />
            ใบส่งของ ({notes.length})
          </h2>
          {notes.length === 0 ? (
            <div className="card text-center text-slate-400 py-8">ยังไม่มีใบส่งของ</div>
          ) : (
            <>
            <div className="space-y-3 md:hidden">
              {notes.map((dn) => (
                <div key={dn.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-primary-700">{dn.deliveryNoteNumber}</p>
                      <p className="mt-1 text-xs text-slate-500">{fmtDate(dn.deliveryDate)} · {dn.carrierName || 'รอข้อมูลขนส่ง'}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{dn.status}</span>
                  </div>
                  <div className="mt-4">
                    {dn.trackingUrl ? (
                      <a href={dn.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700">
                        {dn.trackingNo ?? 'เปิดลิงก์ติดตาม'}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <p className="text-sm text-slate-500">{dn.trackingNo ?? 'ยังไม่มีเลขติดตาม'}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="card hidden overflow-hidden p-0 md:block">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left text-xs uppercase text-slate-500 px-4 py-2">เลขที่</th>
                    <th className="text-left text-xs uppercase text-slate-500 px-4 py-2">วันที่ส่ง</th>
                    <th className="text-left text-xs uppercase text-slate-500 px-4 py-2">การจัดส่ง</th>
                    <th className="text-center text-xs uppercase text-slate-500 px-4 py-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {notes.map((dn) => (
                    <tr key={dn.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-primary-700">{dn.deliveryNoteNumber}</td>
                      <td className="px-4 py-3 text-sm">{dn.deliveryDate.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {dn.carrierName && <div>{dn.carrierName}</div>}
                        {dn.trackingUrl ? (
                          <a
                            href={dn.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary-700 hover:underline"
                          >
                            {dn.trackingNo ?? 'เปิดลิงก์ติดตาม'}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (dn.trackingNo ?? '—')}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">{dn.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>

        <p className="text-center text-xs text-slate-400 mt-8 flex items-center justify-center gap-2">
          Powered by <span className="font-semibold">Billboy</span>
          <ExternalLink className="w-3 h-3" />
        </p>
      </main>
    </div>
  );
}
