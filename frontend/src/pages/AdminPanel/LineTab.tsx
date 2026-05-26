import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, BriefcaseBusiness, Check, CheckCircle, Copy, Link2, Loader2, Lock, Save, Unlink2, Users, XCircle, Zap } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import type { CompanyAccessPolicy } from '../../types';

export default function LineTab({ policy, isThai }: { policy: CompanyAccessPolicy | null; isThai: boolean }) {
  const { token } = useAuthStore();
  type LineManagedUser = {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    line: {
      linked: boolean;
      displayName?: string | null;
      linkedAt?: string | null;
      lineUserIdMasked?: string | null;
    };
  };
  type LineManagedGroup = {
    id: string;
    groupName?: string | null;
    projectId?: string | null;
    project?: { id: string; code: string; name: string; status: string } | null;
    isActive: boolean;
    linkedAt?: string | null;
    lineGroupIdMasked?: string | null;
    linkedBy?: { id: string; name: string; email: string } | null;
  };
  type ProjectOption = { id: string; code: string; name: string; status: string };
  const [lineStatus, setLineStatus] = useState<{
    linked: boolean;
    displayName?: string;
    lineNotifyEnabled: boolean;
    overdueReminderDays: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localNotifyEnabled, setLocalNotifyEnabled] = useState(false);
  const [localReminderDays, setLocalReminderDays] = useState(3);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<{
    checkedAt: string;
    webhook?: { lastWebhookAt?: string; lastEventCount?: number; lastUnhandledError?: { at: string; eventType?: string; message: string } };
    lineMessaging?: {
      configured: boolean;
      lastPushOkAt?: string;
      lastReplyOkAt?: string;
      lastPushFailure?: { at: string; status?: number; body?: string; error?: string };
      lastReplyFailure?: { at: string; status?: number; body?: string; error?: string };
    };
    redis?: { ok: boolean; error?: string };
    documentIntakesSchema?: { ok: boolean; missingColumns: string[]; error?: string };
    recentDocumentIntakes?: {
      ok: boolean;
      items: Array<{
        id: string;
        source: string;
        sourceMessageId?: string | null;
        fileName?: string | null;
        status: string;
        mimeType: string;
        fileSize?: number;
        projectId?: string | null;
        project?: { id: string; code: string; name: string } | null;
        targetType?: string | null;
        targetId?: string | null;
        purchaseInvoiceId?: string | null;
        error?: string | null;
        driveSyncStatus?: string | null;
        driveUrl?: string | null;
        driveSyncError?: string | null;
        processedAt?: string | null;
        createdAt: string;
        updatedAt: string;
        ocrSummary?: {
          documentType?: string | null;
          documentTypeLabel?: string | null;
          counterparty?: string | null;
          invoiceNumber?: string | null;
          total?: number | null;
          vatAmount?: number | null;
          confidence?: string | null;
          stages?: string[];
          warningCount?: number;
          firstWarning?: string | null;
        };
      }>;
    };
    linkedUsers?: { ok: boolean; count: number };
    linkedGroups?: { ok: boolean; count: number };
    documentOps?: {
      windowDays: number;
      byStatus: Record<string, number>;
      bySource?: Record<string, number>;
      byMimeType?: Record<string, number>;
      usageTelemetry?: { salesInvoices: number; purchaseInvoices: number; documentIntakes: number; billableDocuments: number; estimatedOcrCostThb: number };
      storage: { configured: boolean; storageBacked: number; databaseBacked: number; duplicateWarnings: number };
    };
    ocrReadiness?: { productionReady: boolean; tier: string; warnings?: string[]; models?: { fastTextOrPdf?: string; scanImageOrPdf?: string; proEscalation?: string | null } };
  } | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [ocrStats, setOcrStats] = useState<{
    providerMix: Array<{ provider: string; documentType: string; calls: number; avgLatencyMs: number; avgCostUsd: number }>;
    monthSpend: { calls: number; thb: number; usd: number; inputTokens: number; outputTokens: number };
    monthSpendByProvider: Array<{ provider: string; thb: number; usd: number }>;
    quota: { tier: 'standard' | 'enhanced' | 'premium'; monthlyDocLimit: number | null; docsUsedThisMonth: number; overQuota: boolean };
    recent: Array<{ documentType: string; provider: string; model: string; confidence: string; stage: string; latencyMs: number; costThb: number; createdAt: string }>;
  } | null>(null);
  const [managedUsers, setManagedUsers] = useState<LineManagedUser[]>([]);
  const [managedUsersLoading, setManagedUsersLoading] = useState(false);
  const [userOtp, setUserOtp] = useState<null | { userId: string; userName: string; otp: string }>(null);
  const [managedGroups, setManagedGroups] = useState<LineManagedGroup[]>([]);
  const [managedGroupsLoading, setManagedGroupsLoading] = useState(false);
  const [groupOtp, setGroupOtp] = useState<null | { otp: string }>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [groupProjectSavingId, setGroupProjectSavingId] = useState<string | null>(null);
  const [groupPortalSavingId, setGroupPortalSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!policy?.canUseLineOa) { setLoading(false); return; }
    fetch('/api/line/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => {
        const d = (j as { data?: { linked: boolean; displayName?: string; lineNotifyEnabled: boolean; overdueReminderDays: number } }).data ?? null;
        setLineStatus(d);
        if (d) {
          setLocalNotifyEnabled(d.lineNotifyEnabled);
          setLocalReminderDays(d.overdueReminderDays);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, policy?.canUseLineOa]);

  async function loadManagedUsers() {
    setManagedUsersLoading(true);
    try {
      const res = await fetch('/api/line/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as { data?: LineManagedUser[] };
      setManagedUsers(json.data ?? []);
    } catch {
      setManagedUsers([]);
    } finally {
      setManagedUsersLoading(false);
    }
  }

  async function loadManagedGroups() {
    setManagedGroupsLoading(true);
    try {
      const res = await fetch('/api/line/admin/groups', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as { data?: LineManagedGroup[] };
      setManagedGroups(json.data ?? []);
    } catch {
      setManagedGroups([]);
    } finally {
      setManagedGroupsLoading(false);
    }
  }

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects?status=all', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as { data?: ProjectOption[] };
      setProjects(json.data ?? []);
    } catch {
      setProjects([]);
    }
  }

  useEffect(() => {
    if (!policy?.canUseLineOa) return;
    void loadManagedUsers();
    void loadManagedGroups();
    void loadProjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, policy?.canUseLineOa]);

  useEffect(() => {
    if (!policy?.canUseLineOa) return;
    let cancelled = false;
    async function loadLiveStatus() {
      setLiveLoading(true);
      try {
        const res = await fetch('/api/line/admin/live-status', { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json() as { data?: typeof liveStatus };
        if (!cancelled) setLiveStatus(json.data ?? null);
      } catch {
        if (!cancelled) setLiveStatus(null);
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    }
    void loadLiveStatus();
    const timer = window.setInterval(loadLiveStatus, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, policy?.canUseLineOa]);

  useEffect(() => {
    if (!statusOpen) return;
    let cancelled = false;
    async function loadOcrStats() {
      try {
        const res = await fetch('/api/admin/ocr-stats', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const json = await res.json() as { data?: typeof ocrStats };
        if (!cancelled) setOcrStats(json.data ?? null);
      } catch {
        if (!cancelled) setOcrStats(null);
      }
    }
    void loadOcrStats();
    const timer = window.setInterval(loadOcrStats, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, statusOpen]);

  async function handleUserLinkStart(user: LineManagedUser) {
    setMsg(null);
    setUserOtp(null);
    try {
      const res = await fetch(`/api/line/admin/users/${user.id}/link-start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: { otp: string }; error?: string };
      if (!res.ok || !json.data?.otp) {
        setMsg({ type: 'err', text: json.error ?? (isThai ? 'สร้างรหัสเชื่อมต่อไม่สำเร็จ' : 'Failed to create link code') });
        return;
      }
      setUserOtp({ userId: user.id, userName: user.name, otp: json.data.otp });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  async function handleUserUnlink(user: LineManagedUser) {
    if (!confirm(isThai ? `ยืนยันถอด LINE จาก ${user.name}?` : `Unlink LINE from ${user.name}?`)) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/line/admin/users/${user.id}/unlink`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      setUserOtp(null);
      await loadManagedUsers();
      setMsg({ type: 'ok', text: isThai ? 'ถอดการเชื่อมต่อ LINE แล้ว' : 'LINE account unlinked.' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  async function handleGroupLinkStart() {
    setMsg(null);
    setGroupOtp(null);
    try {
      const res = await fetch('/api/line/admin/groups/link-start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: { otp: string }; error?: string };
      if (!res.ok || !json.data?.otp) {
        setMsg({ type: 'err', text: json.error ?? (isThai ? 'สร้างรหัสเชื่อมกลุ่มไม่สำเร็จ' : 'Failed to create group link code') });
        return;
      }
      setGroupOtp({ otp: json.data.otp });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  async function handleGroupUnlink(group: LineManagedGroup) {
    if (!confirm(isThai ? `ยืนยันถอด LINE group ${group.groupName ?? group.lineGroupIdMasked ?? ''}?` : `Unlink LINE group ${group.groupName ?? group.lineGroupIdMasked ?? ''}?`)) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/line/admin/groups/${group.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      setGroupOtp(null);
      await loadManagedGroups();
      setMsg({ type: 'ok', text: isThai ? 'ถอดการเชื่อมต่อกลุ่ม LINE แล้ว' : 'LINE group unlinked.' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  async function handleGroupProjectChange(group: LineManagedGroup, projectId: string) {
    setMsg(null);
    setGroupProjectSavingId(group.id);
    try {
      const res = await fetch(`/api/line/admin/groups/${group.id}/project`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId: projectId || null }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      await loadManagedGroups();
      setMsg({ type: 'ok', text: isThai ? 'อัปเดตโปรเจคของกลุ่ม LINE แล้ว' : 'LINE group project updated.' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setGroupProjectSavingId(null);
    }
  }

  async function handleCreateGroupPortalLink(group: LineManagedGroup) {
    setMsg(null);
    setGroupPortalSavingId(group.id);
    try {
      const res = await fetch(`/api/line/admin/groups/${group.id}/portal-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: { url: string; expiresIn: string }; error?: string };
      if (!res.ok || !json.data?.url) throw new Error(json.error ?? 'Failed');
      await navigator.clipboard.writeText(json.data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setMsg({
        type: 'ok',
        text: isThai
          ? `คัดลอกลิงก์ Project Portal แล้ว ใช้ได้ ${json.data.expiresIn}`
          : `Project portal link copied. Valid for ${json.data.expiresIn}.`,
      });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setGroupPortalSavingId(null);
    }
  }

  async function handleSaveSettings() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/line/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lineNotifyEnabled: localNotifyEnabled, overdueReminderDays: localReminderDays }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      setMsg({ type: 'ok', text: isThai ? 'บันทึกการตั้งค่าสำเร็จ' : 'Settings saved successfully' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally { setSaving(false); }
  }

  function copyUserOtp() {
    if (!userOtp) return;
    navigator.clipboard.writeText(userOtp.otp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyGroupOtp() {
    if (!groupOtp) return;
    navigator.clipboard.writeText(groupOtp.otp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function healthPill(ok?: boolean, label?: string) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        {ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {label ?? (ok ? 'OK' : 'Issue')}
      </span>
    );
  }

  function statusPill(status: string) {
    const tone =
      status === 'saved' ? 'bg-green-50 text-green-700 border-green-100'
      : status === 'failed' || status === 'rejected' ? 'bg-red-50 text-red-700 border-red-100'
      : status === 'needs_review' || status === 'awaiting_input' || status === 'awaiting_confirmation' ? 'bg-amber-50 text-amber-700 border-amber-100'
      : 'bg-gray-50 text-gray-700 border-gray-100';
    return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{status}</span>;
  }

  function drivePill(status?: string | null) {
    const ok = status === 'synced';
    const warn = status === 'failed';
    const tone = ok ? 'bg-blue-50 text-blue-700 border-blue-100' : warn ? 'bg-red-50 text-red-700 border-red-100' : 'bg-gray-50 text-gray-600 border-gray-100';
    return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>Drive: {status || 'not_synced'}</span>;
  }

  function formatMoney(value?: number | null) {
    if (typeof value !== 'number') return '-';
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value);
  }

  function formatFileSize(value?: number) {
    if (!value) return '-';
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
  }

  if (!policy?.canUseLineOa) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
          <Lock className="w-7 h-7 text-amber-500" />
        </div>
        <div>
          <p className="font-semibold text-gray-800 mb-1">
            {isThai ? 'ฟีเจอร์นี้ต้องการแพ็กเกจสูงกว่า' : 'Feature requires a higher plan'}
          </p>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            {isThai
              ? 'อัปเกรดแพ็กเกจเพื่อใช้งาน LINE AI Assistant Billboy'
              : 'Upgrade your plan to use the LINE AI Assistant (Billboy).'}
          </p>
        </div>
        <Link to="/app/plan" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
          <Zap className="w-4 h-4" />
          {isThai ? 'ดูแพ็กเกจทั้งหมด' : 'View plans'}
        </Link>
      </div>
    );
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-lg text-gray-900">
        {isThai ? 'LINE Billboy' : 'LINE AI Assistant (Billboy)'}
      </h2>

      {/* Section 1: Features — 4 document groups */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 space-y-4">
        <p className="font-semibold text-indigo-900 text-sm">
          {isThai ? 'Billboy รองรับเอกสาร 16+ ประเภท ครอบคลุม 4 กลุ่มงาน' : 'Billboy supports 16+ document types across 4 categories'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-white/70 border border-indigo-100 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-indigo-700">{isThai ? 'ภาษีซื้อ (Input VAT)' : 'Input VAT Documents'}</p>
            <p className="text-xs text-indigo-800">{isThai ? 'ใบกำกับภาษี, ใบเสร็จ, ใบแจ้งหนี้, ใบวางบิล, ใบลดหนี้, ใบเพิ่มหนี้' : 'Tax invoice, receipt, invoice, billing note, credit note, debit note'}</p>
          </div>
          <div className="rounded-lg bg-white/70 border border-indigo-100 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-emerald-700">{isThai ? 'หลักฐานชำระเงิน' : 'Payment Proofs'}</p>
            <p className="text-xs text-indigo-800">{isThai ? 'สลิปโอนเงินทุกธนาคาร, รายการเดินบัญชี, Payment Advice' : 'Bank transfer slips, bank statements, payment advice'}</p>
          </div>
          <div className="rounded-lg bg-white/70 border border-indigo-100 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-purple-700">{isThai ? 'เอกสารประกอบ' : 'Supporting Documents'}</p>
            <p className="text-xs text-indigo-800">{isThai ? 'ใบเสนอราคา, Purchase Order (PO), ใบส่งของ, สัญญา, หนังสือหัก ณ ที่จ่าย' : 'Quotation, PO, delivery note, contract, withholding tax cert'}</p>
          </div>
          <div className="rounded-lg bg-white/70 border border-indigo-100 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-amber-700">{isThai ? 'AI อัจฉริยะ' : 'Smart AI'}</p>
            <p className="text-xs text-indigo-800">{isThai ? 'ถามตอบบัญชี, สรุป VAT, แจ้งเตือนเกินกำหนด, พิมพ์ไทยได้เลย' : 'Accounting Q&A, VAT summary, overdue alerts, natural Thai input'}</p>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Section 2: Add friend Billboy — QR code prominent */}
      <div className="border border-green-200 rounded-xl bg-green-50 p-5 space-y-4">
        <h3 className="font-medium text-green-900">
          {isThai ? 'เพิ่มเพื่อน LINE Billboy' : 'Add Billboy on LINE'}
        </h3>
        <div className="flex items-start gap-5">
          <a href="https://line.me/R/ti/p/@566fvjbg" target="_blank" rel="noreferrer" className="flex-shrink-0">
            <img
              src="https://qr-official.line.me/g/M/566fvjbg.png"
              alt="QR Code Billboy"
              className="w-32 h-32 rounded-lg border border-green-200 shadow-sm"
            />
          </a>
          <div className="space-y-2">
            <p className="text-sm text-green-800">
              {isThai ? 'สแกน QR หรือกดลิงก์ด้านล่างเพื่อเพิ่มเพื่อน Billboy ทุกคนในบริษัทต้องเพิ่มเพื่อนก่อนเชื่อมบัญชี' : 'Scan the QR code or click the link below. Every user must add Billboy before linking their account.'}
            </p>
            <a
              href="https://line.me/R/ti/p/@566fvjbg"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#06C755] px-4 py-2 text-sm font-semibold text-white hover:bg-[#05b34d] transition-colors"
            >
              <Link2 className="w-4 h-4" />
              {isThai ? 'เพิ่มเพื่อน @566fvjbg' : 'Add friend @566fvjbg'}
            </a>
          </div>
        </div>
      </div>

      {/* Section 3: Connection — admin-managed users */}
      <div className="border border-gray-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-medium text-gray-800">
              {isThai ? 'เชื่อมบัญชี LINE กับผู้ใช้' : 'Link LINE to user accounts'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {isThai
                ? 'กดปุ่ม "สร้างรหัส" ข้างชื่อผู้ใช้ → ได้รหัส 6 หลัก → ให้ผู้ใช้ส่งรหัสนั้นในแชท Billboy บน LINE (หมดอายุ 10 นาที)'
                : 'Click "Generate code" next to a user → get a 6-digit code → have the user send it to Billboy in LINE (expires in 10 min).'}
            </p>
          </div>
          <button className="btn-secondary text-sm" onClick={() => void loadManagedUsers()} disabled={managedUsersLoading}>
            {managedUsersLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            {isThai ? 'รีเฟรช' : 'Refresh'}
          </button>
        </div>

        {userOtp && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">
              {isThai ? `รหัสเชื่อมต่อสำหรับ ${userOtp.userName}` : `Link code for ${userOtp.userName}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="font-mono text-3xl font-bold tracking-[0.3em] text-amber-900 select-all">{userOtp.otp}</span>
              <button className="btn-secondary text-xs" onClick={copyUserOtp}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? (isThai ? 'คัดลอกแล้ว' : 'Copied') : (isThai ? 'คัดลอก' : 'Copy')}
              </button>
            </div>
            <p className="mt-2 text-xs text-amber-800">
              {isThai ? 'ส่งรหัสนี้ให้ผู้ใช้พิมพ์ใน LINE ภายใน 10 นาที' : 'Ask this user to send the code in LINE within 10 minutes.'}
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-100">
          <div className="grid grid-cols-[1.4fr_.7fr_.9fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 md:grid-cols-[1.6fr_.7fr_.9fr_.9fr]">
            <span>{isThai ? 'ผู้ใช้' : 'User'}</span>
            <span>Role</span>
            <span>LINE</span>
            <span className="hidden md:block">{isThai ? 'จัดการ' : 'Action'}</span>
          </div>
          <div className="divide-y divide-gray-100 bg-white">
            {managedUsers.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-gray-500">
                {managedUsersLoading ? (isThai ? 'กำลังโหลด...' : 'Loading...') : (isThai ? 'ยังไม่มีผู้ใช้ให้แสดง' : 'No users to show.')}
              </div>
            )}
            {managedUsers.map((managedUser) => (
              <div key={managedUser.id} className="grid grid-cols-[1.4fr_.7fr_.9fr] gap-3 px-3 py-3 text-sm md:grid-cols-[1.6fr_.7fr_.9fr_.9fr] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{managedUser.name}</p>
                  <p className="truncate text-xs text-gray-500">{managedUser.email}</p>
                </div>
                <span className="text-xs capitalize text-gray-600">{managedUser.role}</span>
                <div className="min-w-0">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${managedUser.line.linked ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {managedUser.line.linked ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {managedUser.line.linked ? (isThai ? 'เชื่อมแล้ว' : 'Linked') : (isThai ? 'ยังไม่เชื่อม' : 'Unlinked')}
                  </span>
                  {managedUser.line.lineUserIdMasked && (
                    <p className="mt-1 truncate text-[11px] text-gray-400">{managedUser.line.lineUserIdMasked}</p>
                  )}
                </div>
                <div className="col-span-3 flex flex-wrap gap-2 md:col-span-1">
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => void handleUserLinkStart(managedUser)}
                    disabled={!managedUser.isActive}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    {managedUser.line.linked ? (isThai ? 'เชื่อมใหม่' : 'Relink') : (isThai ? 'สร้างรหัส' : 'Generate code')}
                  </button>
                  {managedUser.line.linked && (
                    <button className="btn-secondary text-xs text-red-600 hover:text-red-700" onClick={() => void handleUserUnlink(managedUser)}>
                      <Unlink2 className="w-3.5 h-3.5" />
                      {isThai ? 'ถอด' : 'Unlink'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 4: Group linking */}
      <div className="border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-medium text-gray-800">
              {isThai ? 'เชื่อมกลุ่ม LINE กับบริษัท' : 'Link LINE group to company'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {isThai
                ? 'สร้างรหัสเชื่อมกลุ่ม แล้วส่งรหัสในกลุ่ม LINE ที่มี Billboy อยู่ ทุกคนในกลุ่มจะส่งเอกสารเข้าบริษัทได้'
                : 'Generate a group code, then send it in the LINE group with Billboy. Everyone in the group can submit documents.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-sm" onClick={() => void loadManagedGroups()} disabled={managedGroupsLoading}>
              {managedGroupsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {isThai ? 'รีเฟรช' : 'Refresh'}
            </button>
            <button className="btn-primary text-sm" onClick={() => void handleGroupLinkStart()}>
              <Link2 className="w-4 h-4" />
              {isThai ? 'สร้างรหัสเชื่อมกลุ่ม' : 'Generate group code'}
            </button>
          </div>
        </div>

        {groupOtp && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-900">
              {isThai ? 'รหัสเชื่อมต่อกลุ่ม LINE' : 'LINE group link code'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="font-mono text-3xl font-bold tracking-[0.3em] text-emerald-900 select-all">{groupOtp.otp}</span>
              <button className="btn-secondary text-xs" onClick={copyGroupOtp}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? (isThai ? 'คัดลอกแล้ว' : 'Copied') : (isThai ? 'คัดลอก' : 'Copy')}
              </button>
            </div>
            <p className="mt-2 text-xs text-emerald-800">
              {isThai ? 'ส่งรหัสนี้ในกลุ่ม LINE ภายใน 10 นาที เช่น 123456 หรือ /link-group 123456' : 'Send this code in the LINE group within 10 minutes, for example 123456 or /link-group 123456.'}
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-100">
          <div className="grid grid-cols-[1.3fr_.8fr_.9fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 md:grid-cols-[1.25fr_.7fr_1.15fr_.8fr_.7fr]">
            <span>{isThai ? 'กลุ่ม' : 'Group'}</span>
            <span>{isThai ? 'สถานะ' : 'Status'}</span>
            <span className="hidden md:block">{isThai ? 'โปรเจค' : 'Project'}</span>
            <span>{isThai ? 'ผู้เชื่อม' : 'Linked by'}</span>
            <span className="hidden md:block">{isThai ? 'จัดการ' : 'Action'}</span>
          </div>
          <div className="divide-y divide-gray-100 bg-white">
            {managedGroups.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-gray-500">
                {managedGroupsLoading ? (isThai ? 'กำลังโหลด...' : 'Loading...') : (isThai ? 'ยังไม่มีกลุ่มที่เชื่อม' : 'No linked groups yet.')}
              </div>
            )}
            {managedGroups.map((group) => (
              <div key={group.id} className="grid grid-cols-[1.3fr_.8fr_.9fr] gap-3 px-3 py-3 text-sm md:grid-cols-[1.25fr_.7fr_1.15fr_.8fr_.7fr] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{group.groupName ?? (isThai ? 'LINE Group' : 'LINE Group')}</p>
                  {group.lineGroupIdMasked && <p className="mt-1 truncate text-[11px] text-gray-400">{group.lineGroupIdMasked}</p>}
                </div>
                <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${group.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {group.isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {group.isActive ? (isThai ? 'เชื่อมแล้ว' : 'Linked') : (isThai ? 'ปิดอยู่' : 'Inactive')}
                </span>
                <div className="col-span-3 md:col-span-1">
                  <select
                    value={group.projectId ?? ''}
                    onChange={(event) => void handleGroupProjectChange(group, event.target.value)}
                    disabled={groupProjectSavingId === group.id}
                    className="input-field w-full text-xs"
                  >
                    <option value="">{isThai ? 'ไม่ผูกโปรเจค' : 'No project'}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                    ))}
                  </select>
                  {group.project && (
                    <Link to={`/app/projects/${group.project.id}`} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 hover:underline">
                      <BriefcaseBusiness className="h-3 w-3" />
                      {group.project.code}
                    </Link>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-gray-600">{group.linkedBy?.name ?? '-'}</p>
                  {group.linkedAt && <p className="truncate text-[11px] text-gray-400">{new Date(group.linkedAt).toLocaleString()}</p>}
                </div>
                <div className="col-span-3 flex flex-wrap gap-2 md:col-span-1">
                  {group.projectId && (
                    <button className="btn-secondary text-xs" onClick={() => void handleCreateGroupPortalLink(group)} disabled={groupPortalSavingId === group.id}>
                      {groupPortalSavingId === group.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                      {isThai ? 'ลิงก์ดูโปรเจค' : 'Portal link'}
                    </button>
                  )}
                  <button className="btn-secondary text-xs text-red-600 hover:text-red-700" onClick={() => void handleGroupUnlink(group)}>
                    <Unlink2 className="w-3.5 h-3.5" />
                    {isThai ? 'ถอด' : 'Unlink'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 5: Notification Settings — show only when linked */}
      {lineStatus?.linked && (
        <div className="border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-600" />
            <h3 className="font-medium text-gray-800">
              {isThai ? 'การตั้งค่าการแจ้งเตือน' : 'Notification Settings'}
            </h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-indigo-600"
                checked={localNotifyEnabled}
                onChange={e => setLocalNotifyEnabled(e.target.checked)}
              />
              <span className="text-sm text-gray-700">
                {isThai ? 'เปิดการแจ้งเตือน Invoice เกินกำหนด' : 'Enable overdue invoice notifications'}
              </span>
            </label>

            <div>
              <label className="label">
                {isThai ? 'แจ้งเตือนล่วงหน้า / Reminder before due' : 'Reminder before due date'}
              </label>
              <select
                className="input-field w-48"
                value={localReminderDays}
                onChange={e => setLocalReminderDays(Number(e.target.value))}
                disabled={!localNotifyEnabled}
              >
                <option value={1}>{isThai ? '1 วัน' : '1 day'}</option>
                <option value={3}>{isThai ? '3 วัน' : '3 days'}</option>
                <option value={7}>{isThai ? '7 วัน' : '7 days'}</option>
              </select>
            </div>
          </div>

          <button className="btn-primary" onClick={handleSaveSettings} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isThai ? 'บันทึกการตั้งค่า' : 'Save settings'}
          </button>
        </div>
      )}

      {/* Section 6: Live status — collapsible */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-gray-50 transition-colors"
          onClick={() => setStatusOpen(v => !v)}
        >
          <div>
            <h3 className="font-medium text-gray-800">
              {isThai ? 'สถานะระบบ LINE/OCR' : 'LINE/OCR System Status'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {liveStatus?.checkedAt
                ? `${isThai ? 'ตรวจล่าสุด' : 'Last checked'} ${new Date(liveStatus.checkedAt).toLocaleString()}`
                : (isThai ? 'กำลังโหลดสถานะ...' : 'Loading status...')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {liveLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            <ArrowRight className={`w-4 h-4 text-gray-400 transition-transform ${statusOpen ? 'rotate-90' : ''}`} />
          </div>
        </button>

        {statusOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 pt-4">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500 mb-2">Webhook</div>
                {healthPill(!!liveStatus?.webhook?.lastWebhookAt, liveStatus?.webhook?.lastWebhookAt ? 'Active' : 'No event')}
                <p className="mt-2 text-xs text-gray-600">
                  {liveStatus?.webhook?.lastWebhookAt ? new Date(liveStatus.webhook.lastWebhookAt).toLocaleString() : '-'}
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500 mb-2">Redis</div>
                {healthPill(liveStatus?.redis?.ok)}
                {liveStatus?.redis?.error && <p className="mt-2 text-xs text-red-600 line-clamp-2">{liveStatus.redis.error}</p>}
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500 mb-2">Database</div>
                {healthPill(liveStatus?.documentIntakesSchema?.ok, liveStatus?.documentIntakesSchema?.ok ? 'Migrated' : 'Needs migration')}
                {!!liveStatus?.documentIntakesSchema?.missingColumns?.length && (
                  <p className="mt-2 text-xs text-red-600">Missing: {liveStatus.documentIntakesSchema.missingColumns.join(', ')}</p>
                )}
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500 mb-2">OCR</div>
                {healthPill(liveStatus?.ocrReadiness?.productionReady, liveStatus?.ocrReadiness?.productionReady ? 'Production' : 'Check env')}
                <p className="mt-2 text-xs text-gray-600">{liveStatus?.ocrReadiness?.models?.fastTextOrPdf ?? '-'}</p>
              </div>
            </div>

            {liveStatus?.documentOps && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
                {[
                  { label: isThai ? 'ผู้ใช้ LINE' : 'LINE users', value: liveStatus.linkedUsers?.count ?? 0 },
                  { label: isThai ? 'กลุ่ม LINE' : 'LINE groups', value: liveStatus.linkedGroups?.count ?? 0 },
                  { label: isThai ? 'รอยืนยัน' : 'Awaiting', value: (liveStatus.documentOps.byStatus.awaiting_confirmation ?? 0) + (liveStatus.documentOps.byStatus.awaiting_input ?? 0) },
                  { label: isThai ? 'บันทึกแล้ว' : 'Saved', value: liveStatus.documentOps.byStatus.saved ?? 0 },
                  { label: isThai ? 'ล้มเหลว' : 'Failed', value: liveStatus.documentOps.byStatus.failed ?? 0 },
                  { label: isThai ? 'ไฟล์บน Storage' : 'Storage files', value: liveStatus.documentOps.storage.storageBacked },
                  { label: isThai ? 'กันเอกสารซ้ำ' : 'Duplicates blocked', value: liveStatus.documentOps.storage.duplicateWarnings },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
                    <p className="text-[11px] text-gray-500">{item.label}</p>
                    <p className="text-lg font-bold text-gray-900">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {liveStatus?.documentOps?.usageTelemetry && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: isThai ? 'เอกสารคิดแพ็กเกจ' : 'Billable docs', value: liveStatus.documentOps.usageTelemetry.billableDocuments },
                  { label: isThai ? 'OCR intake' : 'OCR intakes', value: liveStatus.documentOps.usageTelemetry.documentIntakes },
                  { label: isThai ? 'จาก LINE' : 'From LINE', value: liveStatus.documentOps.bySource?.line ?? 0 },
                  { label: isThai ? 'จากเว็บ' : 'From web', value: liveStatus.documentOps.bySource?.web ?? 0 },
                  { label: isThai ? 'ต้นทุน OCR ประมาณ' : 'Est. OCR cost', value: `฿${liveStatus.documentOps.usageTelemetry.estimatedOcrCostThb}` },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                    <p className="text-[11px] text-emerald-700">{item.label}</p>
                    <p className="text-lg font-bold text-emerald-950">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {liveStatus?.documentOps && !liveStatus.documentOps.storage.configured && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {isThai
                  ? 'Storage ยังไม่พร้อมสำหรับ production: เอกสารใหม่อาจถูกเก็บใน database ชั่วคราว ให้ตั้งค่า S3/R2 env ก่อนขายจริง'
                  : 'Production storage is not ready: new documents may be stored in the database temporarily. Configure S3/R2 env before launch.'}
              </div>
            )}

            {(liveStatus?.lineMessaging?.lastPushFailure || liveStatus?.lineMessaging?.lastReplyFailure || liveStatus?.webhook?.lastUnhandledError) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                {liveStatus.webhook?.lastUnhandledError && (
                  <p><strong>Webhook error:</strong> {liveStatus.webhook.lastUnhandledError.message}</p>
                )}
                {liveStatus.lineMessaging?.lastPushFailure && (
                  <p><strong>Push failed:</strong> {liveStatus.lineMessaging.lastPushFailure.status ?? '-'} {liveStatus.lineMessaging.lastPushFailure.body ?? liveStatus.lineMessaging.lastPushFailure.error}</p>
                )}
                {liveStatus.lineMessaging?.lastReplyFailure && (
                  <p><strong>Reply failed:</strong> {liveStatus.lineMessaging.lastReplyFailure.status ?? '-'} {liveStatus.lineMessaging.lastReplyFailure.body ?? liveStatus.lineMessaging.lastReplyFailure.error}</p>
                )}
              </div>
            )}

            {!!liveStatus?.recentDocumentIntakes?.items?.length && (
              <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
                <div className="flex flex-col gap-1 bg-gray-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">
                      {isThai ? 'เอกสาร LINE/OCR ล่าสุด' : 'Recent LINE/OCR documents'}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {isThai ? 'ใช้เช็คว่าไฟล์เข้า DB, OCR, Drive และโปรเจคครบไหม' : 'Shows DB, OCR, Drive, and project linkage state.'}
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    {isThai ? 'ล่าสุด 10 รายการ' : 'Latest 10'}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {liveStatus.recentDocumentIntakes.items.map((item) => (
                    <div key={item.id} className="grid gap-3 px-3 py-3 text-xs lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {statusPill(item.status)}
                          {drivePill(item.driveSyncStatus)}
                          {item.ocrSummary?.confidence && (
                            <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                              OCR: {item.ocrSummary.confidence}
                            </span>
                          )}
                        </div>
                        <p className="truncate font-semibold text-gray-800">{item.fileName || item.mimeType}</p>
                        <p className="truncate text-gray-400">
                          {item.source} · {item.mimeType} · {formatFileSize(item.fileSize)} · {new Date(item.createdAt).toLocaleString()}
                        </p>
                        {item.sourceMessageId && (
                          <p className="truncate font-mono text-[11px] text-gray-400">LINE msg: {item.sourceMessageId}</p>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium text-gray-700">
                          {item.ocrSummary?.documentTypeLabel || item.ocrSummary?.documentType || (isThai ? 'ยังไม่แยกประเภท' : 'No type yet')}
                        </p>
                        <p className="truncate text-gray-500">
                          {item.ocrSummary?.counterparty || (isThai ? 'ยังไม่พบคู่ค้า' : 'No counterparty')}
                        </p>
                        <p className="text-gray-700">
                          {formatMoney(item.ocrSummary?.total)}
                          {item.ocrSummary?.invoiceNumber ? <span className="text-gray-400"> · {item.ocrSummary.invoiceNumber}</span> : null}
                        </p>
                      </div>

                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-gray-600">
                          {item.project ? `${item.project.code} · ${item.project.name}` : (isThai ? 'ไม่ผูกโปรเจค' : 'No project')}
                        </p>
                        {!!item.ocrSummary?.stages?.length && (
                          <p className="line-clamp-2 text-[11px] text-gray-400">
                            OCR stages: {item.ocrSummary.stages.slice(-4).join(' → ')}
                          </p>
                        )}
                        {(item.error || item.driveSyncError || item.ocrSummary?.firstWarning) && (
                          <p className="line-clamp-2 text-[11px] text-red-600">
                            {item.error || item.driveSyncError || item.ocrSummary?.firstWarning}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {item.projectId && (
                          <Link to={`/app/projects/${item.projectId}`} className="rounded-md border border-gray-200 px-2 py-1 font-semibold text-gray-600 hover:bg-gray-50">
                            {isThai ? 'โปรเจค' : 'Project'}
                          </Link>
                        )}
                        {(item.purchaseInvoiceId || item.targetType === 'purchase_invoice') && (
                          <Link to="/app/purchase-invoices" className="rounded-md border border-gray-200 px-2 py-1 font-semibold text-gray-600 hover:bg-gray-50">
                            Input VAT
                          </Link>
                        )}
                        {item.driveUrl && (
                          <a href={item.driveUrl} target="_blank" rel="noreferrer" className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 font-semibold text-blue-700 hover:bg-blue-100">
                            Drive
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ocrStats && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <OcrQuotaCard isThai={isThai} quota={ocrStats.quota} />

                {ocrStats.monthSpendByProvider.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {ocrStats.monthSpendByProvider.map((row) => (
                      <div key={row.provider} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-[11px] text-gray-500">{row.provider}</p>
                        <p className="text-sm font-semibold text-gray-900">฿{row.thb.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-500">${row.usd.toFixed(4)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {ocrStats.providerMix.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">{isThai ? 'ประเภทเอกสาร' : 'Doc type'}</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Engine</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">{isThai ? 'จำนวน' : 'Calls'}</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">{isThai ? 'เฉลี่ย ms' : 'Avg ms'}</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">{isThai ? 'ต้นทุน $' : 'Avg $'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {ocrStats.providerMix.slice(0, 12).map((row) => (
                          <tr key={`${row.provider}-${row.documentType}`}>
                            <td className="px-3 py-2 text-gray-900">{row.documentType}</td>
                            <td className="px-3 py-2 text-gray-700">{row.provider}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-900">{row.calls}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-500">{row.avgLatencyMs}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-500">{row.avgCostUsd.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {ocrStats.providerMix.length === 0 && (
                  <p className="text-xs text-gray-500">
                    {isThai
                      ? 'ยังไม่มีข้อมูล — ส่งเอกสารผ่าน LINE หรืออัปโหลดเอกสารสักฉบับ ระบบจะเริ่มบันทึก benchmark'
                      : 'No data yet — send a document via LINE or upload one to start logging benchmarks.'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
function OcrQuotaCard({
  isThai,
  quota,
}: {
  isThai: boolean;
  quota: { tier: 'standard' | 'enhanced' | 'premium'; monthlyDocLimit: number | null; docsUsedThisMonth: number; overQuota: boolean };
}) {
  const tierLabel = {
    standard: { th: 'มาตรฐาน (Gemini)', en: 'Standard (Gemini)' },
    enhanced: { th: 'เก่งภาษาไทย (Typhoon)', en: 'Thai-enhanced (Typhoon)' },
    premium: { th: 'พรีเมียม (GPT-4o)', en: 'Premium (GPT-4o)' },
  }[quota.tier];

  const tierTone = {
    standard: 'bg-slate-100 text-slate-700 border-slate-200',
    enhanced: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    premium: 'bg-violet-100 text-violet-700 border-violet-200',
  }[quota.tier];

  const used = quota.docsUsedThisMonth;
  const limit = quota.monthlyDocLimit;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const barColor = pct == null
    ? 'bg-emerald-500'
    : pct >= 100
      ? 'bg-rose-500'
      : pct >= 80
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <div className="rounded-lg border border-gray-100 bg-gradient-to-r from-slate-50 to-white p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-gray-900">
            {isThai ? 'โควต้า OCR เดือนนี้' : 'OCR quota this month'}
          </h4>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tierTone}`}>
            {isThai ? tierLabel.th : tierLabel.en}
          </span>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900 tabular-nums">
            {used.toLocaleString()}
            {limit != null ? <span className="text-gray-500 text-sm"> / {limit.toLocaleString()}</span> : <span className="text-gray-500 text-sm"> {isThai ? 'เอกสาร' : 'docs'}</span>}
          </p>
          {limit == null && (
            <p className="text-[11px] text-violet-700">{isThai ? 'ไม่จำกัด' : 'Unlimited'}</p>
          )}
        </div>
      </div>

      {pct != null && (
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      )}

      {quota.overQuota && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {isThai
            ? 'ใช้โควต้าเดือนนี้ครบแล้ว — ระบบจะใช้ engine มาตรฐานต่อจนถึงวันที่ 1 เดือนหน้า ถ้าต้องการเก่งกว่านี้ ลองอัปเกรดแพ็กเกจ'
            : 'You\'ve used this month\'s quota — system continues with the standard engine until the 1st. Upgrade your plan for more.'}
        </div>
      )}
    </div>
  );
}
