import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { Download, Trash2, AlertTriangle, RotateCcw, ShieldCheck, Loader2, Clock } from 'lucide-react';
import { PageHeader } from '../components/ui/AppChrome';

// Customer-facing surface for PDPA Section 30 (right of access),
// Section 31 (portability), and Section 33 (erasure). The backend
// endpoints are at /api/account/{export,delete,delete/cancel,status}.
// This page is the only place non-technical users can exercise those
// rights — without it, the Privacy Policy commits we've published would
// be unkeepable.

interface AccountStatus {
  auth: { hasPassword: boolean; hasGoogle: boolean };
  legal: { acceptedVersion: string | null; currentVersion: string };
  marketing: { optedIn: boolean };
  deletion:
    | { requested: false }
    | {
        requested: true;
        requestedAt: string;
        requestedBy: string | null;
        hardDeleteScheduledAt: string | null;
        cancelDeadline: string | null;
        cancellable: boolean;
      };
}

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH' : locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function AccountPrivacy() {
  const { i18n } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const isThai = i18n.language === 'th';
  const isZh = i18n.language === 'zh' || i18n.language?.startsWith('zh');

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Delete state
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Cancel-deletion state
  const [cancelling, setCancelling] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await fetch('/api/account/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setStatus(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleExport() {
    if (!token || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch('/api/account/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      // Trigger browser download — endpoint already sets Content-Disposition,
      // but we set the anchor download attr too in case the header is
      // stripped by a proxy.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `billboy-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!token || deleting) return;
    if (!status) return;

    if (status.auth.hasPassword && deletePassword.length < 1) return;
    if (!status.auth.hasPassword && deleteConfirm !== 'DELETE') return;

    setDeleting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (status.auth.hasPassword) body.password = deletePassword;
      else body.confirm = deleteConfirm;
      if (deleteReason.trim()) body.reason = deleteReason.trim();

      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDeletePassword('');
      setDeleteConfirm('');
      setDeleteReason('');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function handleCancel() {
    if (!token || cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete/cancel', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  }

  const txt = (th: string, en: string, zh: string) => (isThai ? th : isZh ? zh : en);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={txt('PDPA · สิทธิเจ้าของข้อมูล', 'PDPA · Data subject rights', 'PDPA · 数据主体权利')}
        title={txt('ความเป็นส่วนตัวและข้อมูลของฉัน', 'Privacy & My Data', '隐私与我的数据')}
        description={txt(
          'ใช้สิทธิตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล มาตรา 30, 31, 33 — ดาวน์โหลดข้อมูล ลบบัญชี และจัดการความยินยอม',
          'Exercise your rights under PDPA Sections 30, 31, 33 — download your data, delete your account, and manage consent.',
          '依据《个人数据保护法》第 30、31、33 条行使您的权利 — 下载数据、删除账户、管理同意。',
        )}
        icon={<ShieldCheck className="h-3.5 w-3.5" />}
        tone="teal"
      />

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading || !status ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {txt('กำลังโหลด…', 'Loading…', '加载中…')}
        </div>
      ) : (
        <>
          {/* Pending deletion banner — shown ONLY when a request is already in flight */}
          {status.deletion.requested && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 text-amber-700" />
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="font-semibold text-amber-900">
                      {txt('คำขอลบบัญชีกำลังรออยู่', 'Deletion request pending', '账户删除请求待处理')}
                    </h3>
                    <p className="mt-1 text-sm text-amber-800">
                      {txt(
                        'PII ถูก deactivate ไปแล้ว — บัญชีถูกล็อก ใบกำกับภาษีจะถูกเก็บไว้ตามประมวลรัษฎากร 5 ปี ก่อนลบจริง',
                        'PII has been deactivated — the account is locked. Tax invoices are retained 5 years per the Revenue Code before final deletion.',
                        'PII 已停用 — 账户已锁定。税务发票按《税务法典》保留 5 年后将被永久删除。',
                      )}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm text-amber-900 sm:grid-cols-3">
                    <div>
                      <div className="text-xs text-amber-700">{txt('ขอลบเมื่อ', 'Requested', '请求时间')}</div>
                      <div className="font-semibold">{formatDate(status.deletion.requestedAt, i18n.language)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-amber-700">{txt('ยกเลิกได้ถึง', 'Cancel until', '可取消至')}</div>
                      <div className="font-semibold">{formatDate(status.deletion.cancelDeadline, i18n.language)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-amber-700">{txt('ลบจริงวันที่', 'Hard delete on', '彻底删除日期')}</div>
                      <div className="font-semibold">{formatDate(status.deletion.hardDeleteScheduledAt, i18n.language)}</div>
                    </div>
                  </div>
                  {status.deletion.cancellable && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-50"
                    >
                      <RotateCcw className={`h-4 w-4 ${cancelling ? 'animate-spin' : ''}`} />
                      {cancelling
                        ? txt('กำลังยกเลิก…', 'Cancelling…', '取消中…')
                        : txt('ยกเลิกคำขอ', 'Cancel request', '取消请求')}
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Export */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <Download className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {txt('ดาวน์โหลดข้อมูลของฉัน', 'Download my data', '下载我的数据')}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {txt(
                      'ขอสำเนาข้อมูลทั้งหมดในรูปแบบ JSON — รวมข้อมูลบัญชี บริษัท ใบกำกับ ลูกค้า สินค้า และ audit log',
                      'Request a complete JSON copy — account, company, invoices, customers, products, and audit log.',
                      '获取完整的 JSON 副本 — 账户、公司、发票、客户、产品和审计日志。',
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {txt(
                      'PDPA มาตรา 30 (สิทธิเข้าถึง) และ 31 (สิทธิให้โอนย้ายข้อมูล)',
                      'PDPA Section 30 (right of access) and 31 (right to data portability).',
                      'PDPA 第 30 条(访问权)和第 31 条(数据可携带权)。',
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {exporting
                    ? txt('กำลังเตรียมไฟล์…', 'Preparing…', '正在准备…')
                    : txt('ดาวน์โหลด JSON', 'Download JSON', '下载 JSON')}
                </button>
              </div>
            </div>
          </section>

          {/* Delete — hidden when already requested */}
          {!status.deletion.requested && (
            <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
              <div className="flex items-start gap-3">
                <Trash2 className="mt-0.5 h-5 w-5 text-rose-600" />
                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="font-semibold text-rose-900">
                      {txt('ลบบัญชีของฉัน', 'Delete my account', '删除我的账户')}
                    </h3>
                    <p className="mt-1 text-sm text-rose-800">
                      {txt(
                        'ระบบจะ deactivate PII ทันที (บัญชีจะถูกล็อก) ใบกำกับภาษีเก็บไว้ 5 ปีตามประมวลรัษฎากร แล้วลบจริง ยกเลิกคำขอได้ภายใน 30 วัน',
                        'PII will be deactivated immediately (account locked). Tax invoices are retained 5 years per the Revenue Code before final deletion. You may cancel within 30 days.',
                        '系统将立即停用 PII(账户锁定)。税务发票按《税务法典》保留 5 年后彻底删除。您可在 30 天内取消。',
                      )}
                    </p>
                    <p className="mt-1 text-xs text-rose-700">
                      {txt('PDPA มาตรา 33 (สิทธิให้ลบข้อมูล)', 'PDPA Section 33 (right to erasure).', 'PDPA 第 33 条(删除权)。')}
                    </p>
                  </div>

                  {status.auth.hasPassword ? (
                    <div>
                      <label className="block text-sm font-medium text-rose-900">
                        {txt('ยืนยันด้วยรหัสผ่าน', 'Confirm with password', '使用密码确认')}
                      </label>
                      <input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        autoComplete="current-password"
                        className="mt-1 w-full max-w-sm rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-rose-900">
                        {txt('พิมพ์ "DELETE" เพื่อยืนยัน', 'Type "DELETE" to confirm', '输入 "DELETE" 确认')}
                      </label>
                      <input
                        type="text"
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder="DELETE"
                        className="mt-1 w-full max-w-sm rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-mono focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-rose-900">
                      {txt('เหตุผล (ไม่บังคับ)', 'Reason (optional)', '原因(可选)')}
                    </label>
                    <textarea
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      rows={2}
                      maxLength={500}
                      className="mt-1 w-full max-w-md rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={
                      deleting ||
                      (status.auth.hasPassword ? deletePassword.length < 1 : deleteConfirm !== 'DELETE')
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    {deleting
                      ? txt('กำลังลบ…', 'Deleting…', '删除中…')
                      : txt('ลบบัญชี', 'Delete account', '删除账户')}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Auth state summary */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            <div className="space-y-1">
              <div className="font-semibold text-slate-900">
                {txt('สถานะการยอมรับเอกสารทางกฎหมาย', 'Legal acceptance status', '法律文档接受状态')}
              </div>
              <div>
                {txt('เวอร์ชันที่ยอมรับ', 'Accepted version', '已接受版本')}:{' '}
                <span className="font-mono">{status.legal.acceptedVersion ?? '—'}</span>
              </div>
              <div>
                {txt('เวอร์ชันปัจจุบัน', 'Current version', '当前版本')}:{' '}
                <span className="font-mono">{status.legal.currentVersion}</span>
              </div>
              <div>
                {txt('รับอีเมลการตลาด', 'Marketing emails', '营销邮件')}:{' '}
                {status.marketing.optedIn
                  ? txt('เปิด', 'On', '已开启')
                  : txt('ปิด', 'Off', '已关闭')}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
