import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Filter, Loader2, ScrollText } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

/**
 * Magic-link audit log viewer for the Owner Plane.
 *
 * Renders rows written by authorizeIntakeEdit() every time a guest hits
 * /api/intake-edit/<token>/*. Useful for "did anyone open this link?"
 * forensics and detecting abnormal patterns (e.g. a token getting 100
 * GETs from 5 different IPs = someone is sharing the link).
 *
 * Read-only. Backend is /api/system/audit/intake-access (super_admin gated).
 */

type AccessLogItem = {
  id: string;
  intakeId: string;
  companyId: string;
  lineUserId: string;
  method: string;
  path: string;
  ip: string;
  userAgent: string | null;
  isMutation: boolean;
  rlCount: number | null;
  createdAt: string;
};

type AuditResponse = {
  items: AccessLogItem[];
  nextCursor: string | null;
  summary24h: { total: number; mutations: number; uniqueIntakes: number };
};

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('th-TH');
}

export default function OpsAuditLog() {
  const { token } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const intakeFilter = searchParams.get('intakeId') ?? '';
  const companyFilter = searchParams.get('companyId') ?? '';
  const lineUserFilter = searchParams.get('lineUserId') ?? '';
  const mutationsOnly = searchParams.get('mutationsOnly') === '1';

  const [items, setItems] = useState<AccessLogItem[]>([]);
  const [summary, setSummary] = useState<AuditResponse['summary24h'] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    const qs = new URLSearchParams();
    if (intakeFilter) qs.set('intakeId', intakeFilter);
    if (companyFilter) qs.set('companyId', companyFilter);
    if (lineUserFilter) qs.set('lineUserId', lineUserFilter);
    if (mutationsOnly) qs.set('mutationsOnly', '1');
    if (cursor) qs.set('cursor', cursor);
    qs.set('limit', '50');

    const res = await fetch(`/api/system/audit/intake-access?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as { data?: AuditResponse; error?: string };
    if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed to load audit log');
    return json.data;
  }, [intakeFilter, companyFilter, lineUserFilter, mutationsOnly, token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    load()
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setSummary(data.summary24h);
        setNextCursor(data.nextCursor);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await load(nextCursor);
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoadingMore(false);
    }
  }

  function updateFilter(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next);
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams());
  }

  const hasFilters = !!(intakeFilter || companyFilter || lineUserFilter || mutationsOnly);

  return (
    <div className="space-y-6 text-slate-900">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <ScrollText className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">Magic-Link Audit Log</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Every hit to /api/intake-edit/* with method, path, IP, user-agent, and rate-limit counter.
              Mutations (POST/PATCH) are highlighted. Use for "did anyone open this link?" forensics.
            </p>
          </div>
        </div>
      </section>

      {/* 24h summary */}
      {summary && (
        <section className="grid grid-cols-3 gap-4">
          <MetricCard label="Total events (24h)" value={summary.total.toString()} />
          <MetricCard label="Mutations (24h)" value={summary.mutations.toString()} />
          <MetricCard label="Unique intakes (24h)" value={summary.uniqueIntakes.toString()} />
        </section>
      )}

      {/* Filters */}
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium">Filters</span>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-900 ml-auto">
              Clear all
            </button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <FilterInput label="Intake ID" value={intakeFilter} onChange={(v) => updateFilter('intakeId', v)} placeholder="cmpb..." />
          <FilterInput label="Company ID" value={companyFilter} onChange={(v) => updateFilter('companyId', v)} placeholder="cmp..." />
          <FilterInput label="LINE User ID" value={lineUserFilter} onChange={(v) => updateFilter('lineUserId', v)} placeholder="U6..." />
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mutationsOnly}
            onChange={(ev) => updateFilter('mutationsOnly', ev.target.checked ? '1' : null)}
            className="rounded border-slate-300"
          />
          <span>Mutations only (POST/PATCH/confirm/slip/attachments)</span>
        </label>
      </section>

      {/* Results */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No access events yet for this filter.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="px-2 py-2 font-medium">When</th>
                    <th className="px-2 py-2 font-medium">Method</th>
                    <th className="px-2 py-2 font-medium">Path</th>
                    <th className="px-2 py-2 font-medium">Intake</th>
                    <th className="px-2 py-2 font-medium">LINE User</th>
                    <th className="px-2 py-2 font-medium">IP</th>
                    <th className="px-2 py-2 font-medium text-right">RL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((r) => (
                    <tr key={r.id} className={r.isMutation ? 'bg-amber-50/40' : ''}>
                      <td className="px-2 py-2 text-slate-700 whitespace-nowrap" title={r.createdAt}>{relativeTime(r.createdAt)}</td>
                      <td className="px-2 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          r.method === 'GET' ? 'bg-slate-100 text-slate-700'
                            : r.method === 'PATCH' ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                        }`}>{r.method}</span>
                      </td>
                      <td className="px-2 py-2 font-mono text-xs text-slate-700 truncate max-w-[200px]" title={r.path}>{r.path}</td>
                      <td className="px-2 py-2 font-mono text-xs">
                        <Link to={`/ops/audit?intakeId=${r.intakeId}`} className="text-slate-600 hover:text-slate-900">
                          {r.intakeId.slice(0, 10)}...
                        </Link>
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">
                        <Link to={`/ops/audit?lineUserId=${r.lineUserId}`} className="text-slate-600 hover:text-slate-900">
                          {r.lineUserId.slice(0, 10)}...
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-600" title={r.userAgent ?? ''}>{r.ip}</td>
                      <td className="px-2 py-2 text-xs text-slate-500 text-right">{r.rlCount ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nextCursor && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function FilterInput(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{props.label}</span>
      <input
        type="text"
        value={props.value}
        onChange={(ev) => props.onChange(ev.target.value)}
        placeholder={props.placeholder}
        className="w-full rounded-lg border border-slate-300 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 px-2.5 py-1.5 text-sm font-mono text-slate-900 bg-white"
      />
    </label>
  );
}
