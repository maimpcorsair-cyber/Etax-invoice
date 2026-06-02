import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Receipt, Truck, Download, LogOut, Loader2, ExternalLink, Building2 } from 'lucide-react';

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
    const res = await fetch(`/api/customer-portal/invoices/${invoiceId}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { alert('ดาวน์โหลด PDF ไม่สำเร็จ'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {me?.company.logoUrl ? (
              <img src={me.company.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-primary-600 text-white flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="font-semibold text-slate-900">{me?.company.nameTh}</div>
              <div className="text-xs text-slate-500">เอกสารสำหรับ {me?.customer.nameTh}</div>
            </div>
          </div>
          <button onClick={logout} className="btn-secondary text-sm">
            <LogOut className="w-4 h-4" /> ออกจากระบบ
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Invoices */}
        <section>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
            <Receipt className="w-5 h-5 text-primary-600" />
            ใบกำกับภาษี / ใบเสร็จ ({invoices.length})
          </h2>
          {invoices.length === 0 ? (
            <div className="card text-center text-slate-400 py-8">ยังไม่มีใบกำกับภาษี</div>
          ) : (
            <div className="card overflow-hidden p-0">
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
                        <button onClick={() => downloadInvoicePdf(inv.id, inv.invoiceNumber)} className="text-primary-600 hover:text-primary-700">
                          <Download className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <div className="card overflow-hidden p-0">
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
            <div className="card overflow-hidden p-0">
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
