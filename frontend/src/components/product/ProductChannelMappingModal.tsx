import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Trash2, Loader2, Link2 } from 'lucide-react';
import type { Product, ProductChannelMapping, SalesChannel } from '../../types';

// Manage the per-channel SKUs for one product (internal SKU ↔ Shopee/Lazada/…).
// Foundation for multi-channel stock sync; no external API needed to record.

const CHANNEL_OPTIONS: Array<{ value: SalesChannel; label: string }> = [
  { value: 'shopee', label: 'Shopee' },
  { value: 'lazada', label: 'Lazada' },
  { value: 'tiktok', label: 'TikTok Shop' },
  { value: 'facebook', label: 'Facebook Shop' },
  { value: 'instagram', label: 'Instagram Shop' },
  { value: 'line_shopping', label: 'LINE SHOPPING' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'pos', label: 'POS' },
  { value: 'other', label: 'Other' },
];

function channelLabel(channel: string): string {
  return CHANNEL_OPTIONS.find((c) => c.value === channel)?.label ?? channel;
}

interface Props {
  product: Product;
  token: string | null;
  isThai: boolean;
  canManage: boolean;
  onClose: () => void;
}

export default function ProductChannelMappingModal({ product, token, isThai, canManage, onClose }: Props) {
  const [mappings, setMappings] = useState<ProductChannelMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<SalesChannel>('shopee');
  const [externalSku, setExternalSku] = useState('');
  const [externalProductId, setExternalProductId] = useState('');

  const fetchMappings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/channel-mappings?productId=${encodeURIComponent(product.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: ProductChannelMapping[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setMappings(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, product.id]);

  useEffect(() => { void fetchMappings(); }, [fetchMappings]);

  async function handleAdd() {
    if (!token || !externalSku.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/channel-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productId: product.id,
          channel,
          externalSku: externalSku.trim(),
          externalProductId: externalProductId.trim() || null,
        }),
      });
      const json = await res.json() as { data?: ProductChannelMapping; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed to add');
      setMappings((prev) => [...prev, json.data!]);
      setExternalSku('');
      setExternalProductId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/channel-mappings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? 'Failed to delete');
      }
      setMappings((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Link2 className="h-5 w-5 text-primary-600" />
              {isThai ? 'SKU ช่องทางขาย' : 'Channel SKUs'}
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {product.code} · {isThai ? product.nameTh : (product.nameEn ?? product.nameTh)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {isThai
              ? 'ผูกรหัส SKU ของสินค้านี้ในแต่ละช่องทาง เพื่อให้ระบบรู้ว่า SKU จากร้านต่าง ๆ คือสินค้าตัวเดียวกัน (รากฐานของการ sync สต็อกหลายช่องทาง — ยังไม่ดึง API จริง)'
              : 'Link this product’s SKU on each channel so incoming channel SKUs resolve to one product (foundation for multi-channel stock sync; no live API yet).'}
          </p>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {canManage && (
            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-end">
              <div>
                <label className="label">{isThai ? 'ช่องทาง' : 'Channel'}</label>
                <select value={channel} onChange={(e) => setChannel(e.target.value as SalesChannel)} className="input-field">
                  {CHANNEL_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">SKU {isThai ? 'ในช่องทาง' : 'on channel'} *</label>
                <input value={externalSku} onChange={(e) => setExternalSku(e.target.value)} className="input-field font-mono" placeholder="SP-BLK-L-001" />
              </div>
              <div>
                <label className="label">{isThai ? 'รหัสสินค้า (ถ้ามี)' : 'Item ID (optional)'}</label>
                <input value={externalProductId} onChange={(e) => setExternalProductId(e.target.value)} className="input-field font-mono" placeholder={isThai ? 'ไม่บังคับ' : 'optional'} />
              </div>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={saving || !externalSku.trim()}
                className="btn-primary inline-flex items-center justify-center gap-1"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {isThai ? 'เพิ่ม' : 'Add'}
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
          ) : mappings.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">
              {isThai ? 'ยังไม่ได้ผูก SKU ช่องทางขายให้สินค้านี้' : 'No channel SKUs mapped for this product yet.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {mappings.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="inline-flex shrink-0 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
                    {channelLabel(m.channel)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm font-medium text-slate-900">{m.externalSku}</div>
                    {m.externalProductId && <div className="truncate font-mono text-xs text-slate-400">{m.externalProductId}</div>}
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(m.id)}
                      disabled={deletingId === m.id}
                      className="inline-flex items-center rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
