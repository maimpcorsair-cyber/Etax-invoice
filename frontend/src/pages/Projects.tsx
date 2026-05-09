import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Edit2,
  Loader2,
  Plus,
  Search,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';

type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';

interface ProjectUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Project {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  customerName?: string | null;
  budgetAmount: number;
  status: ProjectStatus;
  owner?: ProjectUser | null;
  approver?: ProjectUser | null;
  startDate?: string | null;
  endDate?: string | null;
  members: Array<{ id: string; role: string; user: ProjectUser }>;
  summary: {
    committedAmount: number;
    paidAmount: number;
    remainingAmount: number;
    budgetUsedPercent: number;
    isOverBudget: boolean;
    purchaseCount: number;
    expenseVoucherCount: number;
    documentIntakeCount: number;
    documentIntakesByStatus: Record<string, number>;
  };
}

interface ProjectForm {
  code: string;
  name: string;
  customerName: string;
  description: string;
  budgetAmount: string;
  ownerId: string;
  approverId: string;
  startDate: string;
  endDate: string;
}

const EMPTY_FORM: ProjectForm = {
  code: '',
  name: '',
  customerName: '',
  description: '',
  budgetAmount: '',
  ownerId: '',
  approverId: '',
  startDate: '',
  endDate: '',
};

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  on_hold: 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-blue-200 bg-blue-50 text-blue-700',
  archived: 'border-slate-200 bg-slate-50 text-slate-500',
};

export default function Projects() {
  const { token, user, clearAuth } = useAuthStore();
  const { isThai, formatCurrency, formatDate } = useLanguage();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<ProjectUser[]>([]);
  const [status, setStatus] = useState<ProjectStatus | 'all'>('active');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM);
  const [error, setError] = useState('');

  const canManage = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'accountant';

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      const [projectsRes, usersRes] = await Promise.all([
        fetch(`/api/projects?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/projects/users', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (projectsRes.status === 401 || usersRes.status === 401) {
        clearAuth();
        return;
      }
      if (!projectsRes.ok) throw new Error('Failed to fetch projects');
      if (!usersRes.ok) throw new Error('Failed to fetch project users');
      const projectsJson = await projectsRes.json();
      const usersJson = await usersRes.json();
      setProjects(projectsJson.data ?? []);
      setUsers(usersJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [token, status, search, clearAuth]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totals = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc.budget += project.budgetAmount || 0;
      acc.committed += project.summary.committedAmount || 0;
      acc.paid += project.summary.paidAmount || 0;
      acc.remaining += project.summary.remainingAmount || 0;
      acc.overBudget += project.summary.isOverBudget ? 1 : 0;
      return acc;
    }, { budget: 0, committed: 0, paid: 0, remaining: 0, overBudget: 0 });
  }, [projects]);

  function statusLabel(value: ProjectStatus) {
    const labels: Record<ProjectStatus, string> = {
      active: isThai ? 'กำลังทำงาน' : 'Active',
      on_hold: isThai ? 'พักงาน' : 'On hold',
      completed: isThai ? 'เสร็จแล้ว' : 'Completed',
      archived: isThai ? 'เก็บถาวร' : 'Archived',
    };
    return labels[value];
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  }

  function openEdit(project: Project) {
    setEditing(project);
    setForm({
      code: project.code,
      name: project.name,
      customerName: project.customerName ?? '',
      description: project.description ?? '',
      budgetAmount: String(project.budgetAmount || ''),
      ownerId: project.owner?.id ?? '',
      approverId: project.approver?.id ?? '',
      startDate: project.startDate?.slice(0, 10) ?? '',
      endDate: project.endDate?.slice(0, 10) ?? '',
    });
    setError('');
    setModalOpen(true);
  }

  async function saveProject() {
    if (!token || !canManage) return;
    if (!form.name.trim()) {
      setError(isThai ? 'กรุณาใส่ชื่อโปรเจค' : 'Project name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        code: form.code.trim() || undefined,
        name: form.name.trim(),
        customerName: form.customerName.trim() || null,
        description: form.description.trim() || null,
        budgetAmount: Number(form.budgetAmount || 0),
        ownerId: form.ownerId || null,
        approverId: form.approverId || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        memberIds: [form.ownerId, form.approverId].filter(Boolean),
      };
      const res = await fetch(editing ? `/api/projects/${editing.id}` : '/api/projects', {
        method: editing ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to save project');
      }
      setModalOpen(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setSaving(false);
    }
  }

  const summaryCards = [
    { label: isThai ? 'งบรวม' : 'Total budget', value: formatCurrency(totals.budget), icon: WalletCards },
    { label: isThai ? 'ใช้/จองงบแล้ว' : 'Committed', value: formatCurrency(totals.committed), icon: BriefcaseBusiness },
    { label: isThai ? 'จ่าย/อนุมัติแล้ว' : 'Paid / approved', value: formatCurrency(totals.paid), icon: CheckCircle2 },
    { label: isThai ? 'โปรเจคเกินงบ' : 'Over budget', value: String(totals.overBudget), icon: AlertTriangle },
  ];

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary-700">
            {isThai ? 'Project Cost Control' : 'Project Cost Control'}
          </p>
          <h1 className="text-2xl font-bold text-slate-950">
            {isThai ? 'โปรเจค / งบงาน' : 'Projects / Cost Centers'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {isThai
              ? 'แยกเอกสารซื้อ สลิป เงินสดย่อย และ LINE inbox ตามโปรเจค เพื่อดูงบที่จอง ใช้ไป และคงเหลือ'
              : 'Split purchases, slips, petty cash, and LINE documents by project so budget owners can see committed, paid, and remaining amounts.'}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            {isThai ? 'สร้างโปรเจค' : 'New project'}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                <Icon className="h-4 w-4 text-primary-500" />
              </div>
              <p className="mt-2 text-xl font-bold text-slate-950">{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isThai ? 'ค้นหาโปรเจค ลูกค้า หรือรหัสงาน' : 'Search project, customer, or code'}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectStatus | 'all')}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
        >
          <option value="active">{isThai ? 'กำลังทำงาน' : 'Active'}</option>
          <option value="on_hold">{isThai ? 'พักงาน' : 'On hold'}</option>
          <option value="completed">{isThai ? 'เสร็จแล้ว' : 'Completed'}</option>
          <option value="archived">{isThai ? 'เก็บถาวร' : 'Archived'}</option>
          <option value="all">{isThai ? 'ทั้งหมด' : 'All'}</option>
        </select>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <BriefcaseBusiness className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            {isThai ? 'ยังไม่มีโปรเจค' : 'No projects yet'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isThai ? 'สร้างโปรเจคแรกเพื่อเริ่มคุมงบและแยกเอกสารตามงาน' : 'Create the first project to track budgets and split documents by job.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {projects.map((project) => {
            const usedPercent = Math.min(project.summary.budgetUsedPercent || 0, 160);
            const progressWidth = `${Math.min(usedPercent, 100)}%`;
            return (
              <div
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/app/projects/${project.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') navigate(`/app/projects/${project.id}`);
                }}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-primary-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{project.code}</span>
                      <span className={clsx('rounded-full border px-2 py-0.5 text-[11px] font-semibold', STATUS_CLASSES[project.status])}>
                        {statusLabel(project.status)}
                      </span>
                      {project.summary.isOverBudget && (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                          {isThai ? 'เกินงบ' : 'Over budget'}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 truncate text-base font-bold text-slate-950">{project.name}</h3>
                    <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                      {project.customerName || project.description || (isThai ? 'ยังไม่มีรายละเอียด' : 'No description yet')}
                    </p>
                  </div>
                  <div className="flex items-start justify-between gap-3 sm:block sm:text-right">
                    <div>
                      <p className="text-xs text-slate-500">{isThai ? 'งบคงเหลือ' : 'Remaining'}</p>
                      <p className={clsx('text-lg font-bold', project.summary.remainingAmount < 0 ? 'text-rose-600' : 'text-emerald-700')}>
                        {formatCurrency(project.summary.remainingAmount)}
                      </p>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEdit(project);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                        aria-label={isThai ? 'แก้ไขโปรเจค' : 'Edit project'}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{isThai ? 'ใช้/จองงบ' : 'Committed'} {formatCurrency(project.summary.committedAmount)}</span>
                    <span>{project.summary.budgetUsedPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={clsx('h-full rounded-full', project.summary.isOverBudget ? 'bg-rose-500' : 'bg-primary-500')}
                      style={{ width: progressWidth }}
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{isThai ? 'งบตั้งต้น' : 'Budget'}</p>
                    <p className="font-semibold text-slate-900">{formatCurrency(project.budgetAmount)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{isThai ? 'จ่าย/อนุมัติ' : 'Paid / approved'}</p>
                    <p className="font-semibold text-slate-900">{formatCurrency(project.summary.paidAmount)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{isThai ? 'เอกสารเข้า' : 'Inbox docs'}</p>
                    <p className="font-semibold text-slate-900">{project.summary.documentIntakeCount}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {project.owner?.name || (isThai ? 'ยังไม่มีเจ้าของงาน' : 'No owner')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {project.approver?.name || (isThai ? 'ยังไม่มีผู้อนุมัติ' : 'No approver')}
                  </span>
                  {(project.startDate || project.endDate) && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {[project.startDate ? formatDate(project.startDate) : null, project.endDate ? formatDate(project.endDate) : null].filter(Boolean).join(' - ')}
                    </span>
                  )}
                </div>
                <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary-700">
                  {isThai ? 'เปิด Workspace' : 'Open workspace'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {editing ? (isThai ? 'แก้ไขโปรเจค' : 'Edit project') : (isThai ? 'สร้างโปรเจค' : 'New project')}
                </h2>
                <p className="text-sm text-slate-500">
                  {isThai ? 'กำหนดงบ เจ้าของงาน และผู้อนุมัติ' : 'Set budget, owner, and approver.'}
                </p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">{isThai ? 'รหัสโปรเจค' : 'Project code'}</span>
                <input
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                  placeholder={isThai ? 'เว้นว่างเพื่อให้ระบบสร้าง' : 'Auto-generated if blank'}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">{isThai ? 'ชื่อโปรเจค' : 'Project name'}</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">{isThai ? 'ลูกค้า/ไซต์งาน' : 'Customer / site'}</span>
                <input
                  value={form.customerName}
                  onChange={(e) => setForm((prev) => ({ ...prev, customerName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">{isThai ? 'วงเงินงบประมาณ' : 'Budget amount'}</span>
                <input
                  type="number"
                  min="0"
                  value={form.budgetAmount}
                  onChange={(e) => setForm((prev) => ({ ...prev, budgetAmount: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">{isThai ? 'เจ้าของงาน' : 'Owner'}</span>
                <select
                  value={form.ownerId}
                  onChange={(e) => setForm((prev) => ({ ...prev, ownerId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">{isThai ? 'ยังไม่กำหนด' : 'Unassigned'}</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">{isThai ? 'ผู้อนุมัติ' : 'Approver'}</span>
                <select
                  value={form.approverId}
                  onChange={(e) => setForm((prev) => ({ ...prev, approverId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">{isThai ? 'ยังไม่กำหนด' : 'Unassigned'}</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">{isThai ? 'วันเริ่ม' : 'Start date'}</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">{isThai ? 'วันจบ' : 'End date'}</span>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">{isThai ? 'รายละเอียด' : 'Description'}</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
            </div>

            {error ? <div className="mx-5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {isThai ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => void saveProject()}
                disabled={saving || !canManage}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isThai ? 'บันทึก' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
