import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FileText,
  Loader2,
  MessageCircle,
  ReceiptText,
  Upload,
  WalletCards,
} from 'lucide-react';
import clsx from 'clsx';

type PortalData = {
  project: {
    id: string;
    code: string;
    name: string;
    customerName?: string | null;
    description?: string | null;
    status: string;
    budgetAmount: number;
    startDate?: string | null;
    endDate?: string | null;
    ownerName?: string | null;
    approverName?: string | null;
  };
  company: { name: string };
  lineGroup: { id: string; groupName?: string | null; linkedAt: string };
  summary: {
    purchaseTotal: number;
    paidPurchaseTotal: number;
    expenseTotal: number;
    approvedExpenseTotal: number;
    revenueTotal: number;
    committedCost: number;
    paidCost: number;
    remainingBudget: number;
    estimatedMargin: number;
    inputVat: number;
    purchaseCount: number;
    expenseCount: number;
    invoiceCount: number;
    filesCount: number;
    actionNeededCount: number;
  };
  recentFiles: Array<{
    id: string;
    source: string;
    fileName?: string | null;
    mimeType: string;
    status: string;
    kind: string;
    needsAction: boolean;
    error?: string | null;
    comments?: Array<{
      id: string;
      authorType: string;
      authorName?: string | null;
      kind: string;
      status: string;
      message: string;
      createdAt: string;
    }>;
    createdAt: string;
    updatedAt: string;
  }>;
  generatedAt: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value || 0);
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

function kindLabel(kind: string) {
  const labels: Record<string, string> = {
    input_vat: 'Input VAT',
    payment_proof: 'สลิป/หลักฐานจ่าย',
    document: 'เอกสาร',
    image: 'รูปภาพ',
    file: 'ไฟล์',
  };
  return labels[kind] ?? kind;
}

export default function ProjectGuestPortal() {
  const { token } = useParams();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPortal(cancelledRef?: { current: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/project-portal/${token}`);
      const json = await res.json() as { data?: PortalData; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'เปิด Project Portal ไม่สำเร็จ');
      if (!cancelledRef?.current) setData(json.data);
    } catch (err) {
      if (!cancelledRef?.current) setError(err instanceof Error ? err.message : 'เปิด Project Portal ไม่สำเร็จ');
    } finally {
      if (!cancelledRef?.current) setLoading(false);
    }
  }

  useEffect(() => {
    const cancelledRef = { current: false };
    void loadPortal(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleUpload(file: File | null) {
    if (!file || !token) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError('รองรับเฉพาะ PDF, JPG, PNG หรือ WebP');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('ไฟล์ใหญ่เกิน 10MB');
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error ?? new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/project-portal/${token}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileBase64 }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'อัปโหลดไม่สำเร็จ');
      setNotice('ส่งไฟล์เข้าโปรเจคแล้ว บัญชีจะตรวจเอกสารต่อ');
      await loadPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  async function handleReply(fileId: string) {
    if (!token) return;
    const message = window.prompt('พิมพ์คำตอบหรือรายละเอียดเพิ่มเติมสำหรับเอกสารนี้');
    if (!message?.trim()) return;

    setReplyingId(fileId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/project-portal/${token}/documents/${fileId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'ส่งข้อความไม่สำเร็จ');
      setNotice('ส่งข้อความกลับเข้าโปรเจคแล้ว');
      await loadPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งข้อความไม่สำเร็จ');
    } finally {
      setReplyingId(null);
    }
  }

  const health = useMemo(() => {
    if (!data) return { label: '', className: '' };
    if (data.summary.remainingBudget < 0) return { label: 'เกินงบ', className: 'bg-rose-50 text-rose-700 border-rose-200' };
    if (data.summary.actionNeededCount > 0) return { label: 'ต้องตรวจเอกสาร', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'เอกสารปกติ', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 text-slate-700 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
          กำลังโหลดโปรเจค...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-rose-100 bg-white p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-3 text-lg font-semibold text-slate-950">เปิดลิงก์ไม่ได้</h1>
          <p className="mt-2 text-sm text-slate-500">{error ?? 'ลิงก์หมดอายุหรือไม่มีสิทธิ์ดูโปรเจคนี้'}</p>
        </div>
      </div>
    );
  }

  const { project, summary } = data;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                <BriefcaseBusiness className="h-3.5 w-3.5" />
                {project.code}
              </span>
              <span className={clsx('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', health.className)}>
                {health.label}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">{project.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {project.customerName || project.description || data.company.name}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <p>LINE: {data.lineGroup.groupName || 'LINE Group'}</p>
            <p>อัปเดตล่าสุด: {new Date(data.generatedAt).toLocaleString('th-TH')}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {notice && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric title="งบโครงการ" value={formatCurrency(project.budgetAmount)} icon={WalletCards} />
          <Metric title="ต้นทุนผูกพัน" value={formatCurrency(summary.committedCost)} icon={ReceiptText} tone={summary.remainingBudget < 0 ? 'danger' : 'default'} />
          <Metric title="งบคงเหลือ" value={formatCurrency(summary.remainingBudget)} icon={CheckCircle2} tone={summary.remainingBudget < 0 ? 'danger' : 'success'} />
          <Metric title="เอกสารต้องตรวจ" value={String(summary.actionNeededCount)} icon={AlertTriangle} tone={summary.actionNeededCount > 0 ? 'warning' : 'success'} />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.25fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-950">ภาพรวมการเงิน</h2>
            <div className="mt-4 space-y-3 text-sm">
              <Row label="ขาซื้อ / Input VAT" value={`${formatCurrency(summary.purchaseTotal)} · ${summary.purchaseCount} รายการ`} />
              <Row label="เบิกจ่าย / Voucher" value={`${formatCurrency(summary.expenseTotal)} · ${summary.expenseCount} รายการ`} />
              <Row label="ออกอินวอยซ์แล้ว" value={`${formatCurrency(summary.revenueTotal)} · ${summary.invoiceCount} ใบ`} />
              <Row label="VAT ซื้อที่อ่านได้" value={formatCurrency(summary.inputVat)} />
              <Row label="กำไรประมาณการ" value={formatCurrency(summary.estimatedMargin)} strong tone={summary.estimatedMargin < 0 ? 'danger' : 'success'} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-950">ไฟล์ล่าสุดจากโปรเจค</h2>
              <span className="text-xs text-slate-500">{summary.filesCount} ไฟล์</span>
            </div>
            <div className="mt-3 divide-y divide-slate-100">
              {data.recentFiles.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">ยังไม่มีไฟล์ในโปรเจคนี้</div>
              ) : (
                data.recentFiles.slice(0, 12).map((file) => (
                  <div key={file.id} className="flex items-center gap-3 py-3">
                    <div className={clsx('flex h-9 w-9 items-center justify-center rounded-lg', file.needsAction ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500')}>
                      {file.needsAction ? <AlertTriangle className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{file.fileName || 'Untitled file'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{kindLabel(file.kind)} · {file.status} · {formatDate(file.createdAt)}</p>
                      {file.comments && file.comments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {file.comments.map((comment) => (
                            <div key={comment.id} className="rounded-md border border-amber-100 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                              <span className="font-semibold">{comment.kind === 'request' ? 'คำขอจากบัญชี' : comment.authorType === 'guest' ? 'ตอบกลับ' : 'คอมเมนต์'}</span>
                              {' · '}
                              {comment.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {file.needsAction && (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">ต้องตรวจ</span>
                      )}
                      {file.comments && file.comments.length > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleReply(file.id)}
                          disabled={replyingId === file.id}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {replyingId === file.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                          ตอบกลับ
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">ส่งเอกสารเพิ่มเข้าโปรเจค</h2>
              <p className="mt-1 text-xs text-slate-500">ไฟล์ที่ส่งจากหน้านี้จะเข้าคิวให้บัญชีตรวจ ไม่แก้ข้อมูลภาษีอัตโนมัติ</p>
            </div>
            <label className={clsx('inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white', uploading ? 'bg-slate-400' : 'bg-primary-600 hover:bg-primary-700')}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลด PDF/JPG'}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = '';
                  void handleUpload(file);
                }}
              />
            </label>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-950">ข้อมูลโปรเจค</h2>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Info label="สถานะ" value={project.status} />
            <Info label="เจ้าของงาน" value={project.ownerName || '-'} />
            <Info label="ผู้อนุมัติ" value={project.approverName || '-'} />
            <Info label="ช่วงเวลา" value={`${formatDate(project.startDate)} - ${formatDate(project.endDate)}`} icon={CalendarDays} />
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({ title, value, icon: Icon, tone = 'default' }: { title: string; value: string; icon: typeof WalletCards; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const toneClass = {
    default: 'text-slate-600 bg-slate-100',
    success: 'text-emerald-700 bg-emerald-50',
    warning: 'text-amber-700 bg-amber-50',
    danger: 'text-rose-700 bg-rose-50',
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className={clsx('flex h-9 w-9 items-center justify-center rounded-lg', toneClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">{title}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Row({ label, value, strong, tone = 'default' }: { label: string; value: string; strong?: boolean; tone?: 'default' | 'success' | 'danger' }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className={clsx(strong ? 'font-bold' : 'font-semibold', tone === 'success' && 'text-emerald-700', tone === 'danger' && 'text-rose-700', tone === 'default' && 'text-slate-900')}>{value}</span>
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof CalendarDays }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}
