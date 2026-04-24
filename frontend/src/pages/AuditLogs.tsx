import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Download, Filter, Loader2, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import type { AuditLog } from '../types';

const ACTION_COLORS: Record<string, string> = {
  'invoice.create': 'badge-success',
  'invoice.submit_rd': 'badge-info',
  'invoice.cancel': 'badge-error',
  'user.login': 'badge-warning',
  'customer.update': 'badge-info',
};

export default function AuditLogs() {
  const { t } = useTranslation();
  const { formatDate } = useLanguage();
  const { token } = useAuthStore();
  const { policy, loading: policyLoading } = useCompanyAccessPolicy();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (policyLoading) return;
    if (!policy?.canViewAuditLogs) {
      setLoading(false);
      return;
    }

    let active = true;

    async function loadLogs() {
      try {
        const res = await fetch('/api/audit', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json() as { data?: AuditLog[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Failed to fetch audit logs');
        if (active) setLogs(json.data ?? []);
      } catch (err) {
        if (active) setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadLogs();
    return () => { active = false; };
  }, [policyLoading, policy?.canViewAuditLogs, token]);

  const filtered = useMemo(
    () => logs.filter(
      (log) =>
        search === '' ||
        log.action.includes(search) ||
        log.userName.toLowerCase().includes(search.toLowerCase()),
    ),
    [logs, search],
  );

  if (policyLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  if (!policy?.canViewAuditLogs) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('audit.title')}</h1>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-6 text-amber-900">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">{t('audit.lockedTitle')}</p>
              <p className="text-sm mt-1">{t('audit.lockedBody')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('audit.title')}</h1>
        <button className="btn-secondary" disabled>
          <Download className="w-4 h-4" />
          {t('audit.export')}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="card">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search')}
              className="input-field pl-9"
            />
          </div>
          <button className="btn-secondary" disabled>
            <Filter className="w-4 h-4" />
            {t('common.filter')}
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">{t('audit.action')}</th>
              <th className="table-header">{t('audit.user')}</th>
              <th className="table-header">{t('audit.timestamp')}</th>
              <th className="table-header">{t('audit.ipAddress')}</th>
              <th className="table-header">{t('audit.language')}</th>
              <th className="table-header">{t('audit.details')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-500" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-500">{t('common.noData')}</td>
              </tr>
            ) : (
              filtered.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <span className={ACTION_COLORS[log.action] ?? 'badge-info'}>
                      {log.action}
                    </span>
                  </td>
                  <td className="table-cell font-medium">{log.userName}</td>
                  <td className="table-cell text-gray-500 text-xs">
                    {formatDate(log.createdAt)}{' '}
                    {new Date(log.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="table-cell font-mono text-xs text-gray-500">{log.ipAddress}</td>
                  <td className="table-cell">
                    <span className="text-xs font-medium uppercase text-gray-500">{log.language}</span>
                  </td>
                  <td className="table-cell text-xs text-gray-500">
                    {JSON.stringify(log.details).slice(0, 100)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
