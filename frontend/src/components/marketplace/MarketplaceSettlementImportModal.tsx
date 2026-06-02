import { useRef, useState } from 'react';
import { X, Upload, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import type { SalesChannel } from '../../types';

const CHANNELS: Array<{ value: SalesChannel; label: string }> = [
  { value: 'shopee', label: 'Shopee' },
  { value: 'lazada', label: 'Lazada' },
  { value: 'tiktok', label: 'TikTok Shop' },
  { value: 'facebook', label: 'Facebook Shop' },
  { value: 'instagram', label: 'Instagram Shop' },
  { value: 'line_shopping', label: 'LINE SHOPPING' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'other', label: 'Other' },
];

interface PreviewData {
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  guessedMapping: SettlementMapping;
}

interface SettlementMapping {
  externalRef: string;
  settledAt: string;
  gross: string;
  fee: string;
  refund: string;
  adjustment: string;
  net: string;
}

interface CommitResult {
  totalRows: number;
  uniqueRows: number;
  imported: number;
  skippedDuplicate: number;
  totals: { gross: number; fee: number; refund: number; adjustment: number; net: number };
}

interface Props {
  token: string | null;
  isThai: boolean;
  formatCurrency: (amount: number) => string;
  onClose: () => void;
}

export default function MarketplaceSettlementImportModal({ token, isThai, formatCurrency, onClose }: Props) {
  const [channel, setChannel] = useState<SalesChannel>('shopee');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<SettlementMapping>({
    externalRef: '',
    settledAt: '',
    gross: '',
    fee: '',
    refund: '',
    adjustment: '',
    net: '',
  });
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
      const res = await fetch('/api/marketplace/settlements/import/preview', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const json = await res.json() as { data?: PreviewData; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Preview failed');
      setPreview(json.data);
      setMapping(json.data.guessedMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!token || !file) return;
    if (!mapping.externalRef || (!mapping.gross && !mapping.net)) {
      setError(isThai ? 'กรุณาเลือกคอลัมน์อ้างอิง และ gross หรือ net อย่างน้อยหนึ่งช่อง' : 'Map reference and at least gross or net first');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('channel', channel);
      fd.append('mapping', JSON.stringify(mapping));
      const res = await fetch('/api/marketplace/settlements/import/commit', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const json = await res.json() as { data?: CommitResult; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Import failed');
      setResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  function mapField(key: keyof SettlementMapping, label: string, required = false) {
    if (!preview) return null;
    return (
      <div>
        <label className="label">{label}{required ? ' *' : ''}</label>
        <select value={mapping[key]} onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))} className="input-field">
          <option value="">{isThai ? '- ไม่ใช้ -' : '- none -'}</option>
          {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h2 className="text-lg font-bold text-gray-900">{isThai ? 'นำเข้าเงินรับจาก Marketplace' : 'Import marketplace payout'}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
        </div>

        <div className="space-y-4 p-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          {result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                {isThai ? 'บันทึก settlement แล้ว' : 'Settlement import complete'}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: isThai ? 'แถวทั้งหมด' : 'Rows', value: result.totalRows },
                  { label: isThai ? 'ไม่ซ้ำ' : 'Unique', value: result.uniqueRows },
                  { label: isThai ? 'นำเข้าใหม่' : 'Imported', value: result.imported },
                  { label: isThai ? 'ข้ามซ้ำ' : 'Duplicates', value: result.skippedDuplicate },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                    <div className="text-lg font-bold text-slate-900">{s.value}</div>
                    <div className="text-xs text-slate-500">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-slate-500">Gross</span><span className="text-right font-semibold">{formatCurrency(result.totals.gross)}</span>
                  <span className="text-slate-500">Fee</span><span className="text-right font-semibold text-rose-700">- {formatCurrency(result.totals.fee)}</span>
                  <span className="text-slate-500">Refund</span><span className="text-right font-semibold text-rose-700">- {formatCurrency(result.totals.refund)}</span>
                  <span className="text-slate-500">Net</span><span className="text-right font-bold text-emerald-700">{formatCurrency(result.totals.net)}</span>
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={onClose} className="btn-primary">{isThai ? 'เสร็จสิ้น' : 'Done'}</button>
              </div>
            </div>
          ) : !preview ? (
            <>
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {isThai
                  ? 'อัปโหลดไฟล์ payout/settlement จาก marketplace เพื่อแยกยอดขาย ค่าธรรมเนียม คืนเงิน และเงินจริงที่โอนเข้า'
                  : 'Upload a payout/settlement CSV to split gross sales, fees, refunds, and the net cash received.'}
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
                {isThai ? `พบ ${preview.rowCount} แถว · จับคู่คอลัมน์ settlement` : `${preview.rowCount} rows · map settlement columns`}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {mapField('externalRef', isThai ? 'เลขอ้างอิง / Order / Transaction' : 'Reference / Order / Transaction', true)}
                {mapField('settledAt', isThai ? 'วันที่เงินเข้า' : 'Settlement date')}
                {mapField('gross', 'Gross', true)}
                {mapField('fee', isThai ? 'ค่าธรรมเนียม' : 'Fee')}
                {mapField('refund', isThai ? 'คืนเงิน' : 'Refund')}
                {mapField('adjustment', isThai ? 'ปรับปรุง' : 'Adjustment')}
                {mapField('net', 'Net', true)}
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <button onClick={() => { setPreview(null); setFile(null); }} className="btn-secondary">{isThai ? 'ย้อนกลับ' : 'Back'}</button>
                <button onClick={() => void handleCommit()} disabled={busy} className="btn-primary inline-flex items-center gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {isThai ? 'บันทึก settlement' : 'Import settlement'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
