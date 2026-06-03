import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { ConfirmDialog, type ConfirmDialogState } from '../components/ui/AppFeedback';

interface DsrRow {
  id: string;
  nameTh: string;
  taxId: string;
  email: string | null;
  deletionRequestedAt: string;
  deletionRequestedBy: string | null;
  hardDeleteScheduledAt: string;
}

// Owner-only queue of pending PDPA Section 33 erasure requests. Owner can
// cancel on a customer's behalf (e.g., support ticket says they changed
// their mind). Hard-delete fires automatically via the retention loop once
// hardDeleteScheduledAt elapses — there's no manual purge button here.

export default function OpsDsrQueue() {
  const token = useAuthStore((s) => s.token);
  const [rows, setRows] = useState<DsrRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await fetch('/api/account/owner/dsr-queue', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function cancel(companyId: string) {
    if (!token || busyId) return;
    setConfirmDialog(null);
    setBusyId(companyId);
    try {
      const res = await fetch(`/api/account/owner/dsr-queue/${companyId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setBusyId(null);
    }
  }

  function requestCancel(row: DsrRow) {
    setConfirmDialog({
      tone: 'warning',
      title: 'Cancel deletion request?',
      description: 'This reactivates the tenant request and stops the scheduled PDPA erasure workflow for this company.',
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep scheduled',
      detail: (
        <div>
          <p className="font-semibold text-slate-900">{row.nameTh}</p>
          <p className="mt-1 text-xs text-slate-500">{row.taxId} · {row.email ?? 'No email'}</p>
        </div>
      ),
      onConfirm: () => void cancel(row.id),
      onCancel: () => setConfirmDialog(null),
    });
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <ConfirmDialog dialog={confirmDialog} />
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Data Subject Requests — Deletion Queue</h1>
        <p className="mt-1 text-sm text-slate-600">Pending PDPA Section 33 erasure requests across all tenants. Tax invoices are retained 5 years per Revenue Code; full purge runs automatically when scheduled.</p>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {rows === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center">
          <Trash2 className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-600">No pending deletion requests.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Company</th>
                <th className="px-4 py-3 text-left">Tax ID</th>
                <th className="px-4 py-3 text-left">Requested</th>
                <th className="px-4 py-3 text-left">Hard delete</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const requested = new Date(row.deletionRequestedAt);
                const hardDelete = new Date(row.hardDeleteScheduledAt);
                const daysUntilPurge = Math.max(0, Math.round((hardDelete.getTime() - Date.now()) / 86400000));
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.nameTh}</div>
                      <div className="text-xs text-slate-500">{row.email ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{row.taxId}</td>
                    <td className="px-4 py-3">
                      <div>{requested.toISOString().slice(0, 10)}</div>
                      <div className="text-xs text-slate-500">{requested.toLocaleTimeString()}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{hardDelete.toISOString().slice(0, 10)}</div>
                      <div className="text-xs text-slate-500">in {daysUntilPurge}d</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => requestCancel(row)}
                        disabled={busyId === row.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {busyId === row.id ? 'Cancelling…' : 'Cancel request'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
