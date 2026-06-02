import { useRef, useState } from 'react';
import { X, Upload, Loader2, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import type { SalesChannel } from '../../types';

// Generic marketplace CSV order import. The user maps their export's columns
// (no hardcoded per-platform format), previews, then commits — orders group by
// order id, dedupe against prior imports, and decrement stock via the shared
// applyOrderToStock engine using the product channel-SKU mappings.

const CHANNELS: Array<{ value: SalesChannel; label: string }> = [
  { value: 'shopee', label: 'Shopee' },
  { value: 'lazada', label: 'Lazada' },
  { value: 'tiktok', label: 'TikTok Shop' },
  { value: 'line_shopping', label: 'LINE SHOPPING' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'other', label: 'Other' },
];

interface PreviewData {
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  guessedMapping: { orderId: string; sku: string; quantity: string; status: string; buyerName: string };
}

interface CommitResult {
  totalOrders: number;
  imported: number;
  skippedDuplicate: number;
  stockMovements: number;
  unmappedSkus: string[];
}

interface Props {
  token: string | null;
  isThai: boolean;
  onClose: () => void;
}

export default function MarketplaceImportModal({ token, isThai, onClose }: Props) {
  const [channel, setChannel] = useState<SalesChannel>('shopee');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState({ orderId: '', sku: '', quantity: '', status: '', buyerName: '' });
  const [assumePaid, setAssumePaid] = useState(true);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handlePreview(selected: File) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', selected);
      const res = await fetch('/api/marketplace/import/preview', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const json = await res.json() as { data?: PreviewData; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Preview failed');
      setPreview(json.data);
      setMapping({
        orderId: json.data.guessedMapping.orderId,
        sku: json.data.guessedMapping.sku,
        quantity: json.data.guessedMapping.quantity,
        status: json.data.guessedMapping.status,
        buyerName: json.data.guessedMapping.buyerName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!token || !file) return;
    if (!mapping.orderId || !mapping.sku || !mapping.quantity) {
      setError(isThai ? 'กรุณาเลือกคอลัมน์ เลขออเดอร์ / SKU / จำนวน ให้ครบ' : 'Map order id / SKU / quantity columns first');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('channel', channel);
      fd.append('mapping', JSON.stringify(mapping));
      fd.append('assumePaid', String(assumePaid));
      const res = await fetch('/api/marketplace/import/commit', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const json = await res.json() as { data?: CommitResult; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Import failed');
      setResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  function mapField(key: keyof typeof mapping, label: string, required: boolean) {
    if (!preview) return null;
    return (
      <div>
        <label className="label">{label}{required ? ' *' : ''}</label>
        <select value={mapping[key]} onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))} className="input-field">
          <option value="">{isThai ? '— ไม่ใช้ —' : '— none —'}</option>
          {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h2 className="text-lg font-bold text-gray-900">{isThai ? 'นำเข้าออเดอร์ (CSV)' : 'Import orders (CSV)'}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
        </div>

        <div className="space-y-4 p-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          {result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                {isThai ? 'นำเข้าเสร็จแล้ว' : 'Import complete'}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: isThai ? 'ออเดอร์ทั้งหมด' : 'Orders', value: result.totalOrders },
                  { label: isThai ? 'นำเข้าใหม่' : 'Imported', value: result.imported },
                  { label: isThai ? 'ซ้ำ (ข้าม)' : 'Duplicates', value: result.skippedDuplicate },
                  { label: isThai ? 'ตัดสต็อก' : 'Stock moves', value: result.stockMovements },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                    <div className="text-lg font-bold text-slate-900">{s.value}</div>
                    <div className="text-xs text-slate-500">{s.label}</div>
                  </div>
                ))}
              </div>
              {result.unmappedSkus.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" /> {isThai ? 'SKU ที่ยังไม่ได้ผูก (ไม่ถูกตัดสต็อก)' : 'Unmapped SKUs (stock not changed)'}</div>
                  <div className="text-xs">{result.unmappedSkus.join(', ')}</div>
                  <div className="mt-1 text-xs">{isThai ? 'ไปผูก SKU ที่หน้าสินค้า → ปุ่ม "SKU ช่องทางขาย" แล้วนำเข้าไฟล์เดิมอีกครั้ง (ออเดอร์เดิมจะไม่ซ้ำ)' : 'Map them on Products → "Channel SKUs", then re-import the same file (existing orders are skipped).'}</div>
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={onClose} className="btn-primary">{isThai ? 'เสร็จสิ้น' : 'Done'}</button>
              </div>
            </div>
          ) : !preview ? (
            <>
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {isThai
                  ? 'export ออเดอร์จาก marketplace เป็นไฟล์ CSV แล้วอัปโหลดที่นี่ ระบบจะให้จับคู่คอลัมน์เอง (รองรับทุกเจ้า) แล้วตัดสต็อกผ่าน SKU ช่องทางขายที่ผูกไว้'
                  : 'Export your orders as CSV and upload here. You map the columns (works for any platform); stock decrements via the channel SKUs you mapped.'}
              </p>
              <div>
                <label className="label">{isThai ? 'ช่องทาง' : 'Channel'}</label>
                <select value={channel} onChange={(e) => setChannel(e.target.value as SalesChannel)} className="input-field">
                  {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) { setFile(f); void handlePreview(f); }
                }}
              />
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-primary inline-flex items-center gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isThai ? 'เลือกไฟล์ CSV' : 'Choose CSV file'}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {isThai ? `พบ ${preview.rowCount} แถว · จับคู่คอลัมน์ให้ตรงกับไฟล์` : `${preview.rowCount} rows · map the columns`}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {mapField('orderId', isThai ? 'เลขออเดอร์' : 'Order ID', true)}
                {mapField('sku', 'SKU', true)}
                {mapField('quantity', isThai ? 'จำนวน' : 'Quantity', true)}
                {mapField('status', isThai ? 'สถานะ (ถ้ามี)' : 'Status (optional)', false)}
                {mapField('buyerName', isThai ? 'ชื่อผู้ซื้อ (ถ้ามี)' : 'Buyer (optional)', false)}
              </div>
              {!mapping.status && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={assumePaid} onChange={(e) => setAssumePaid(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
                  {isThai ? 'ถือว่าทุกออเดอร์ชำระแล้ว → ตัดสต็อก' : 'Treat all orders as paid → decrement stock'}
                </label>
              )}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button onClick={() => { setPreview(null); setFile(null); }} className="btn-secondary">{isThai ? 'ย้อนกลับ' : 'Back'}</button>
                <button onClick={() => void handleCommit()} disabled={busy} className="btn-primary inline-flex items-center gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {isThai ? 'นำเข้าและตัดสต็อก' : 'Import & decrement stock'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
