import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle, Download, Loader2, XCircle } from 'lucide-react';

interface QuotationShareData {
  quotation: {
    id: string;
    quotationNumber: string;
    status: string;
    quotationDate: string;
    validUntil: string | null;
    subtotal: number;
    vatAmount: number;
    discountAmount: number;
    total: number;
    notes: string | null;
    paymentTerms: string | null;
    deliveryTerms: string | null;
    kind: 'general' | 'service' | 'service_project' | 'boq_contract' | 'recurring_rental' | 'logistics_import_export';
    serviceDetails: {
      scope?: string | null;
      deliverables?: string | null;
      exclusions?: string | null;
      duration?: string | null;
      warranty?: string | null;
      depositPercent?: number | null;
      revisionRounds?: number | null;
      revisionTerms?: string | null;
      contractDuration?: string | null;
      billingCycle?: string | null;
      sla?: string | null;
      cancellationTerms?: string | null;
      securityDeposit?: number | null;
      origin?: string | null;
      destination?: string | null;
      incoterms?: string | null;
      shipmentMode?: string | null;
      cargoDetails?: string | null;
      currency?: string | null;
      exchangeRate?: number | null;
      freightCharge?: number | null;
      localCharge?: number | null;
      customsFee?: number | null;
      insurance?: number | null;
      milestones?: Array<{ title: string; amount: number; dueDate?: string | null; note?: string | null }>;
    } | null;
    project?: { id: string; code: string; name: string } | null;
    pdfUrl: string;
  };
  buyer: { nameTh: string; nameEn: string | null; taxId: string; email?: string | null };
  seller: { nameTh: string; nameEn: string | null; taxId: string; logoUrl: string | null; phone?: string | null; email?: string | null };
  items: Array<{
    id: string;
    sectionTitle?: string | null;
    nameTh: string;
    nameEn: string | null;
    descriptionTh?: string | null;
    descriptionEn?: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    amount: number;
    totalAmount: number;
  }>;
}

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  sent: { label: 'รอการตอบรับ', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  accepted: { label: 'ยอมรับแล้ว', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: 'ปฏิเสธแล้ว', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
  converted: { label: 'ดำเนินการต่อแล้ว', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  expired: { label: 'หมดอายุ', tone: 'border-slate-200 bg-slate-100 text-slate-600' },
  cancelled: { label: 'ยกเลิก', tone: 'border-slate-200 bg-slate-100 text-slate-600' },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatAmount(amount: number, currency = 'THB'): string {
  return `${new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(amount)} ${currency}`;
}

function formatThaiDate(iso: string): string {
  const d = new Date(iso);
  const buddhistYear = d.getFullYear() + 543;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${buddhistYear}`;
}

export default function QuotationShare() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<QuotationShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<'accept' | 'reject' | null>(null);
  const [responseMessage, setResponseMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('ลิงก์ไม่ถูกต้อง');
      setLoading(false);
      return;
    }
    fetch(`/api/share/quotation/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (!body?.quotation || !body?.buyer || !body?.seller || !Array.isArray(body?.items)) {
          throw new Error('ข้อมูลใบเสนอราคาไม่สมบูรณ์ กรุณาติดต่อผู้ส่งให้ออกลิงก์ใหม่');
        }
        setData(body as QuotationShareData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'))
      .finally(() => setLoading(false));
  }, [token]);

  const isExpired = useMemo(() => {
    if (!data?.quotation.validUntil || data.quotation.status !== 'sent') return false;
    return new Date(data.quotation.validUntil) < new Date();
  }, [data]);
  const status = data ? (STATUS_COPY[data.quotation.status] ?? STATUS_COPY.sent) : STATUS_COPY.sent;
  const canRespond = data?.quotation.status === 'sent' && !isExpired;

  async function respond(action: 'accept' | 'reject') {
    if (!token || !data) return;
    setResponding(action);
    setResponseMessage(null);
    try {
      const res = await fetch(`/api/share/quotation/${encodeURIComponent(token)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'ตอบกลับไม่สำเร็จ');
      setData((prev) => prev ? { ...prev, quotation: { ...prev.quotation, status: body.data.status } } : prev);
      setResponseMessage(action === 'accept' ? 'ส่งคำตอบรับให้ผู้ขายแล้ว' : 'บันทึกคำปฏิเสธแล้ว');
    } catch (err) {
      setResponseMessage(err instanceof Error ? err.message : 'ตอบกลับไม่สำเร็จ');
    } finally {
      setResponding(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md space-y-3 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h1 className="text-xl font-semibold text-slate-900">เปิดใบเสนอราคาไม่ได้</h1>
          <p className="text-sm text-slate-600">{error ?? 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว'}</p>
          <p className="text-xs text-slate-400">กรุณาติดต่อผู้ส่งให้ออกลิงก์ใหม่</p>
        </div>
      </div>
    );
  }

  const { quotation, buyer, seller, items } = data;
  const boqSectionTotals = quotation.kind === 'boq_contract'
    ? [...items.reduce((sections, item) => {
        const title = item.sectionTitle?.trim();
        if (title) sections.set(title, (sections.get(title) ?? 0) + item.amount);
        return sections;
      }, new Map<string, number>()).entries()]
    : [];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <main className="mx-auto max-w-3xl space-y-4">
        <section className="border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {seller.logoUrl && (
                <img src={seller.logoUrl} alt={seller.nameTh} className="h-11 w-11 shrink-0 border border-slate-100 object-contain" />
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quotation</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950">{quotation.quotationNumber}</h1>
                <p className="mt-1 text-sm text-slate-500">ออกเมื่อ {formatThaiDate(quotation.quotationDate)}</p>
              </div>
            </div>
            <span className={`inline-flex w-fit items-center border px-3 py-1 text-sm font-semibold ${status.tone}`}>
              {status.label}
            </span>
          </div>

          <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">จากผู้ขาย</p>
              <p className="mt-1 font-semibold text-slate-900">{seller.nameTh}</p>
              <p className="text-xs text-slate-500">เลขผู้เสียภาษี: {seller.taxId}</p>
              {(seller.phone || seller.email) && (
                <p className="mt-1 text-xs text-slate-500">{[seller.phone, seller.email].filter(Boolean).join(' · ')}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500">ถึงลูกค้า</p>
              <p className="mt-1 font-semibold text-slate-900">{buyer.nameTh}</p>
              {buyer.taxId && <p className="text-xs text-slate-500">เลขผู้เสียภาษี: {buyer.taxId}</p>}
            </div>
          </div>

          {quotation.validUntil && (
            <div className={`mt-4 border px-3 py-2 text-sm ${isExpired ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-amber-100 bg-amber-50 text-amber-700'}`}>
              {isExpired ? 'ใบเสนอราคานี้หมดอายุเมื่อ ' : 'ราคาใช้ได้ถึง '}
              <span className="font-semibold">{formatThaiDate(quotation.validUntil)}</span>
            </div>
          )}
        </section>

        <section className="border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-slate-950">รายการ</h2>
          <div className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
            {items.map((item, index) => (
              <div key={item.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto]">
                <div>
                  {item.sectionTitle && item.sectionTitle !== items[index - 1]?.sectionTitle && (
                    <p className="mb-2 border-b border-slate-100 pb-2 text-xs font-semibold text-slate-500">{item.sectionTitle}</p>
                  )}
                  <p className="font-medium text-slate-900">{item.nameTh}</p>
                  {item.descriptionTh && (
                    <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">{item.descriptionTh}</p>
                  )}
                  <p className="text-xs text-slate-500">{item.quantity} {item.unit} × {formatCurrency(item.unitPrice)}</p>
                </div>
                <p className="font-semibold text-slate-900 sm:text-right">{formatCurrency(item.totalAmount)}</p>
              </div>
            ))}
          </div>
          {boqSectionTotals.length > 0 && (
            <div className="mt-4 border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-xs font-semibold text-slate-700">ยอดย่อยตามหมวด BOQ (ก่อน VAT)</p>
              <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {boqSectionTotals.map(([title, amount]) => (
                  <div key={title} className="flex justify-between gap-3 border-b border-slate-200 py-1 last:border-b-0">
                    <span className="text-slate-600">{title}</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">มูลค่าก่อนภาษี</span><span>{formatCurrency(quotation.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">VAT</span><span>{formatCurrency(quotation.vatAmount)}</span></div>
            {quotation.discountAmount > 0 && (
              <div className="flex justify-between"><span className="text-slate-600">ส่วนลดรวม</span><span>{formatCurrency(quotation.discountAmount)}</span></div>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-3 text-lg font-bold text-slate-950">
              <span>ยอดสุทธิ</span>
              <span>{formatCurrency(quotation.total)}</span>
            </div>
          </div>
        </section>

        {quotation.kind !== 'general' && quotation.serviceDetails && (
          <section className="border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-950">รายละเอียดเพิ่มเติม</h2>
              {quotation.project && <span className="text-xs font-medium text-slate-500">{quotation.project.code} · {quotation.project.name}</span>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {quotation.serviceDetails.scope && <InfoBlock title="Scope งาน" value={quotation.serviceDetails.scope} wide />}
              {quotation.serviceDetails.deliverables && <InfoBlock title="สิ่งส่งมอบ" value={quotation.serviceDetails.deliverables} wide />}
              {quotation.serviceDetails.exclusions && <InfoBlock title="สิ่งที่ไม่รวมในราคา" value={quotation.serviceDetails.exclusions} wide />}
              {quotation.serviceDetails.duration && <InfoBlock title="ระยะเวลาดำเนินงาน" value={quotation.serviceDetails.duration} />}
              {quotation.serviceDetails.warranty && <InfoBlock title="การรับประกัน" value={quotation.serviceDetails.warranty} />}
              {typeof quotation.serviceDetails.depositPercent === 'number' && quotation.serviceDetails.depositPercent > 0 && (
                <InfoBlock title="มัดจำก่อนเริ่มงาน" value={`${quotation.serviceDetails.depositPercent}% · ${formatCurrency((quotation.total * quotation.serviceDetails.depositPercent) / 100)}`} />
              )}
              {typeof quotation.serviceDetails.revisionRounds === 'number' && (
                <InfoBlock title="จำนวนรอบแก้ไขงาน" value={`${quotation.serviceDetails.revisionRounds} รอบ`} />
              )}
              {quotation.serviceDetails.revisionTerms && <InfoBlock title="เงื่อนไขแก้ไขงาน" value={quotation.serviceDetails.revisionTerms} />}
              {quotation.serviceDetails.contractDuration && <InfoBlock title="ระยะสัญญา" value={quotation.serviceDetails.contractDuration} />}
              {quotation.serviceDetails.billingCycle && <InfoBlock title="รอบเรียกเก็บเงิน" value={quotation.serviceDetails.billingCycle} />}
              {quotation.serviceDetails.sla && <InfoBlock title="ระดับการให้บริการ (SLA)" value={quotation.serviceDetails.sla} wide />}
              {quotation.serviceDetails.cancellationTerms && <InfoBlock title="เงื่อนไขยกเลิก" value={quotation.serviceDetails.cancellationTerms} wide />}
              {typeof quotation.serviceDetails.securityDeposit === 'number' && quotation.serviceDetails.securityDeposit > 0 && (
                <InfoBlock title="เงินประกัน" value={formatCurrency(quotation.serviceDetails.securityDeposit)} />
              )}
              {quotation.serviceDetails.origin && <InfoBlock title="ต้นทาง" value={quotation.serviceDetails.origin} />}
              {quotation.serviceDetails.destination && <InfoBlock title="ปลายทาง" value={quotation.serviceDetails.destination} />}
              {quotation.serviceDetails.incoterms && <InfoBlock title="Incoterms" value={quotation.serviceDetails.incoterms} />}
              {quotation.serviceDetails.shipmentMode && <InfoBlock title="รูปแบบขนส่ง" value={quotation.serviceDetails.shipmentMode} />}
              {quotation.serviceDetails.cargoDetails && <InfoBlock title="รายละเอียดสินค้า/น้ำหนัก" value={quotation.serviceDetails.cargoDetails} wide />}
              {quotation.serviceDetails.currency && <InfoBlock title="สกุลเงิน" value={quotation.serviceDetails.currency} />}
              {typeof quotation.serviceDetails.exchangeRate === 'number' && quotation.serviceDetails.exchangeRate > 0 && (
                <InfoBlock title="อัตราแลกเปลี่ยน" value={new Intl.NumberFormat('th-TH', { maximumFractionDigits: 6 }).format(quotation.serviceDetails.exchangeRate)} />
              )}
              {typeof quotation.serviceDetails.freightCharge === 'number' && quotation.serviceDetails.freightCharge > 0 && (
                <InfoBlock title="ค่าขนส่ง" value={formatAmount(quotation.serviceDetails.freightCharge, quotation.serviceDetails.currency ?? 'THB')} />
              )}
              {typeof quotation.serviceDetails.localCharge === 'number' && quotation.serviceDetails.localCharge > 0 && (
                <InfoBlock title="Local charge" value={formatAmount(quotation.serviceDetails.localCharge, quotation.serviceDetails.currency ?? 'THB')} />
              )}
              {typeof quotation.serviceDetails.customsFee === 'number' && quotation.serviceDetails.customsFee > 0 && (
                <InfoBlock title="ค่าพิธีการศุลกากร" value={formatAmount(quotation.serviceDetails.customsFee, quotation.serviceDetails.currency ?? 'THB')} />
              )}
              {typeof quotation.serviceDetails.insurance === 'number' && quotation.serviceDetails.insurance > 0 && (
                <InfoBlock title="ประกันภัย" value={formatAmount(quotation.serviceDetails.insurance, quotation.serviceDetails.currency ?? 'THB')} />
              )}
            </div>
            {(quotation.serviceDetails.milestones?.length ?? 0) > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">งวดงาน</h3>
                <div className="mt-2 divide-y divide-slate-100 border-y border-slate-100">
                  {quotation.serviceDetails.milestones?.map((milestone, index) => (
                    <div key={`${milestone.title}-${index}`} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto]">
                      <div>
                        <p className="font-medium text-slate-900">{index + 1}. {milestone.title}</p>
                        {(milestone.dueDate || milestone.note) && <p className="mt-1 text-xs text-slate-500">{[milestone.dueDate ? `กำหนด ${formatThaiDate(milestone.dueDate)}` : null, milestone.note].filter(Boolean).join(' · ')}</p>}
                      </div>
                      <p className="font-semibold text-slate-900 sm:text-right">{formatCurrency(milestone.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {(quotation.paymentTerms || quotation.deliveryTerms || quotation.notes) && (
          <section className="grid gap-3 sm:grid-cols-2">
            {quotation.paymentTerms && <InfoBlock title="เงื่อนไขการชำระเงิน" value={quotation.paymentTerms} />}
            {quotation.deliveryTerms && <InfoBlock title="เงื่อนไขการส่งของ" value={quotation.deliveryTerms} />}
            {quotation.notes && <InfoBlock title="หมายเหตุ" value={quotation.notes} wide />}
          </section>
        )}

        <section className="border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-2 sm:grid-cols-3">
            <a
              href={quotation.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              ดาวน์โหลด PDF
            </a>
            <button
              type="button"
              disabled={!canRespond || responding !== null}
              onClick={() => respond('accept')}
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {responding === 'accept' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              ยอมรับใบเสนอราคา
            </button>
            <button
              type="button"
              disabled={!canRespond || responding !== null}
              onClick={() => respond('reject')}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              {responding === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              ปฏิเสธ
            </button>
          </div>
          {!canRespond && (
            <p className="mt-3 text-center text-xs text-slate-500">
              {isExpired ? 'ใบเสนอราคานี้หมดอายุแล้ว กรุณาติดต่อผู้ขายเพื่อออกใบเสนอราคาใหม่' : 'ใบเสนอราคานี้มีการตอบกลับหรือดำเนินการแล้ว'}
            </p>
          )}
          {responseMessage && (
            <p className="mt-3 border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm text-slate-700">{responseMessage}</p>
          )}
        </section>

        <p className="pt-2 text-center text-xs text-slate-400">ส่งโดย Billboy · ระบบจัดการบัญชีและภาษี</p>
      </main>
    </div>
  );
}

function InfoBlock({ title, value, wide = false }: { title: string; value: string; wide?: boolean }) {
  return (
    <div className={`border border-slate-200 bg-white p-4 shadow-sm ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{value}</p>
    </div>
  );
}
