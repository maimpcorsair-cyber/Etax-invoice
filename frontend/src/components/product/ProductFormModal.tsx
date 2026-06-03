import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Loader2, Layers3, ReceiptText, ChevronDown, Package, BadgePercent } from 'lucide-react';
import type { Product } from '../../types';
import { englishTextOnly, guardedInputClass, inputGuide, isEnglishText, isThaiText, thaiTextOnly } from '../../lib/inputGuards';

// Shared "add a product/service" popup. Same create form as the Products
// directory page, pulled out so the document builders can add a catalog item
// inline (and immediately drop it into a line) instead of leaving the page.

const VAT_OPTIONS = ['vat7', 'vatExempt', 'vatZero'] as const;
const PRODUCT_TYPE_OPTIONS = [
  { value: 'product', labelTh: 'สินค้า', labelEn: 'Product', hintTh: 'ของที่ขายหรือส่งมอบ', hintEn: 'Goods or deliverables' },
  { value: 'service', labelTh: 'บริการ', labelEn: 'Service', hintTh: 'งานบริการหรือค่าจ้าง', hintEn: 'Service or labor fee' },
  { value: 'shipping', labelTh: 'ค่าขนส่ง', labelEn: 'Shipping', hintTh: 'ค่าส่งหรือโลจิสติกส์', hintEn: 'Delivery or logistics' },
  { value: 'fee', labelTh: 'ค่าธรรมเนียม', labelEn: 'Fee', hintTh: 'ค่าดำเนินการ/ค่าบริการอื่น', hintEn: 'Processing or other fee' },
  { value: 'deposit', labelTh: 'มัดจำ', labelEn: 'Deposit', hintTh: 'เงินล่วงหน้าหรือเงินจอง', hintEn: 'Advance or booking payment' },
  { value: 'discount', labelTh: 'ส่วนลด', labelEn: 'Discount', hintTh: 'รายการลดราคา', hintEn: 'Discount line' },
] as const;
const UNIT_OPTIONS = ['ชิ้น', 'งาน', 'ครั้ง', 'เดือน', 'ปี', 'ชั่วโมง', 'วัน', 'ชุด', 'กล่อง', 'กิโลกรัม', 'เมตร', 'ลิตร'] as const;
const WHT_OPTIONS = [
  { value: '', labelTh: 'ไม่มี', labelEn: 'None' },
  { value: '1', labelTh: '1%', labelEn: '1%' },
  { value: '3', labelTh: '3%', labelEn: '3%' },
  { value: '5', labelTh: '5%', labelEn: '5%' },
] as const;

const EMPTY_FORM: Omit<Product, 'id' | 'companyId' | 'isActive'> = {
  code: '',
  nameTh: '',
  nameEn: '',
  descriptionTh: '',
  descriptionEn: '',
  unit: '',
  unitPrice: 0,
  vatType: 'vat7',
  productType: 'product',
  category: '',
  accountCode: '',
  unitCost: null,
  defaultWhtRate: null,
  internalNote: '',
  trackInventory: false,
  currentStock: 0,
  reorderPoint: null,
};

interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the freshly created product so the caller can insert it as a line. */
  onSaved: (product: Product) => void;
  token: string | null;
  isThai: boolean;
  /** Prefill the Thai name from whatever the user already typed in the line. */
  initialName?: string;
  title?: string;
}

export default function ProductFormModal({
  open,
  onClose,
  onSaved,
  token,
  isThai,
  initialName,
  title,
}: ProductFormModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const field = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const vatLabel = (v: string) => {
    if (v === 'vat7') return 'VAT 7%';
    if (v === 'vatExempt') return isThai ? 'ยกเว้น VAT' : 'VAT Exempt';
    return isThai ? 'VAT 0%' : 'Zero-rated';
  };

  const formValidation = {
    nameTh: form.nameTh.trim().length > 0 && !isThaiText(form.nameTh, true),
    nameEn: (form.nameEn ?? '').trim().length > 0 && !isEnglishText(form.nameEn ?? ''),
    descriptionTh: (form.descriptionTh ?? '').trim().length > 0 && !isThaiText(form.descriptionTh ?? ''),
    descriptionEn: (form.descriptionEn ?? '').trim().length > 0 && !isEnglishText(form.descriptionEn ?? ''),
  };

  const grossMargin = form.unitCost && form.unitPrice > 0
    ? Math.round(((form.unitPrice - form.unitCost) / form.unitPrice) * 100)
    : null;

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_FORM, nameTh: initialName?.trim() ?? '' });
    setSaving(false);
    setError('');
  }, [open, initialName]);

  async function handleSave() {
    if (!form.code.trim()) { setError(isThai ? 'กรุณากรอกรหัสสินค้า' : 'Product code is required'); return; }
    if (!form.nameTh.trim() || formValidation.nameTh) { setError(isThai ? 'กรุณากรอกชื่อภาษาไทยให้ถูกต้อง' : 'Please enter a valid Thai name'); return; }
    if (!form.unit.trim()) { setError(isThai ? 'กรุณากรอกหน่วย' : 'Unit is required'); return; }
    if (form.unitPrice < 0) { setError(isThai ? 'ราคาต้องไม่ติดลบ' : 'Price must be non-negative'); return; }
    if (form.unitCost !== null && form.unitCost !== undefined && form.unitCost < 0) { setError(isThai ? 'ต้นทุนต้องไม่ติดลบ' : 'Cost must be non-negative'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        nameEn: form.nameEn || null,
        descriptionTh: form.descriptionTh || null,
        descriptionEn: form.descriptionEn || null,
        category: form.category || null,
        accountCode: form.accountCode || null,
        defaultWhtRate: form.defaultWhtRate || null,
        internalNote: form.internalNote || null,
      };
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json() as { data?: Product; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Save failed');
      onSaved(json.data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {title ?? t('product.add')}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{isThai ? 'รายการนี้เป็น' : 'This item is'}</p>
                <p className="text-xs text-gray-500">{isThai ? 'เลือกให้ตรงกับเอกสารและรายงานที่ต้องใช้' : 'Choose the best fit for documents and reports.'}</p>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                <Layers3 className="h-3.5 w-3.5" />
                {isThai ? 'เปลี่ยนได้ภายหลัง' : 'Editable later'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRODUCT_TYPE_OPTIONS.map((option) => {
                const active = form.productType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => field('productType', option.value as Product['productType'])}
                    className={`rounded-xl border px-3 py-2 text-left transition-all ${
                      active
                        ? 'border-primary-300 bg-primary-50 shadow-sm ring-1 ring-primary-100'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-gray-900">{isThai ? option.labelTh : option.labelEn}</span>
                    <span className="block truncate text-xs text-gray-500">{isThai ? option.hintTh : option.hintEn}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('product.code')} *</label>
              <input value={form.code} onChange={(e) => field('code', e.target.value)} className="input-field font-mono" placeholder="SW-001" />
            </div>
            <div>
              <label className="label">{t('product.unit')} *</label>
              <input value={form.unit} onChange={(e) => field('unit', e.target.value)} className="input-field" list="product-modal-unit-options" placeholder={isThai ? 'ชิ้น / งาน / เดือน' : 'pcs / job / month'} />
              <datalist id="product-modal-unit-options">
                {UNIT_OPTIONS.map((unit) => <option key={unit} value={unit} />)}
              </datalist>
            </div>
            <div>
              <label className="label">{t('product.nameTh')} *</label>
              <input value={form.nameTh} onChange={(e) => field('nameTh', thaiTextOnly(e.target.value))} className={guardedInputClass(formValidation.nameTh)} placeholder="ซอฟต์แวร์พัฒนาระบบ" />
              <p className={inputGuide(formValidation.nameTh)}>
                {isThai ? 'ใช้ชื่อภาษาไทย เช่น บริการพัฒนาระบบ' : 'Thai only, e.g. บริการพัฒนาระบบ'}
              </p>
            </div>
            <div>
              <label className="label">{t('product.nameEn')}</label>
              <input value={form.nameEn} onChange={(e) => field('nameEn', englishTextOnly(e.target.value))} className={guardedInputClass(formValidation.nameEn)} placeholder="Software Development" />
              <p className={inputGuide(formValidation.nameEn)}>
                {isThai ? 'ใช้ชื่ออังกฤษ เช่น Software Development' : 'English only, e.g. Software Development'}
              </p>
            </div>
            <div>
              <label className="label">{t('product.price')} (THB) *</label>
              <input
                type="number"
                value={form.unitPrice}
                onChange={(e) => field('unitPrice', parseFloat(e.target.value) || 0)}
                className="input-field text-right"
                min={0}
                step={0.01}
              />
            </div>
            <div>
              <label className="label">{t('product.vatType')} *</label>
              <select value={form.vatType} onChange={(e) => field('vatType', e.target.value as Product['vatType'])} className="input-field">
                {VAT_OPTIONS.map((v) => (
                  <option key={v} value={v}>{vatLabel(v)}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">{isThai ? 'หมวดหมู่' : 'Category'}</label>
              <input
                value={form.category ?? ''}
                onChange={(e) => field('category', e.target.value)}
                className="input-field"
                placeholder={isThai ? 'เช่น Software, Consulting, ค่าแรง, ค่าวัสดุ' : 'e.g. Software, Consulting, Labor, Materials'}
              />
              <p className="mt-1 text-xs text-gray-400">
                {isThai ? 'ไม่บังคับ แต่ช่วยให้ค้นหาและสรุปรายงานได้ง่ายขึ้น' : 'Optional, but useful for search and reporting.'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="label">{isThai ? 'รายละเอียด (ไทย)' : 'Description (TH)'}</label>
              <textarea value={form.descriptionTh ?? ''} onChange={(e) => field('descriptionTh', thaiTextOnly(e.target.value))} className={guardedInputClass(formValidation.descriptionTh)} rows={2} placeholder={isThai ? 'รายละเอียดสินค้าเพิ่มเติม...' : 'Additional details...'} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">{isThai ? 'รายละเอียด (อังกฤษ)' : 'Description (EN)'}</label>
              <textarea value={form.descriptionEn ?? ''} onChange={(e) => field('descriptionEn', englishTextOnly(e.target.value))} className={guardedInputClass(formValidation.descriptionEn)} rows={2} placeholder="Additional details in English..." />
            </div>
          </div>

          <details className="group rounded-2xl border border-gray-200 bg-gray-50/70">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary-700 shadow-sm">
                  <ReceiptText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{isThai ? 'ตั้งค่าขั้นสูง' : 'Advanced settings'}</p>
                  <p className="text-xs text-gray-500">
                    {isThai ? 'บัญชี ต้นทุน และภาษีหัก ณ ที่จ่ายเริ่มต้น ไม่บังคับ' : 'Optional account, cost, and default WHT settings.'}
                  </p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid grid-cols-1 gap-4 border-t border-gray-200 bg-white px-4 py-4 sm:grid-cols-2">
              <div>
                <label className="label">{isThai ? 'รหัสบัญชีรายได้' : 'Revenue account code'}</label>
                <input
                  value={form.accountCode ?? ''}
                  onChange={(e) => field('accountCode', e.target.value)}
                  className="input-field font-mono"
                  placeholder={isThai ? 'เช่น 4110' : 'e.g. 4110'}
                />
              </div>
              <div>
                <label className="label">{isThai ? 'ต้นทุนต่อหน่วย' : 'Unit cost'}</label>
                <input
                  type="number"
                  value={form.unitCost ?? ''}
                  onChange={(e) => field('unitCost', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                  className="input-field text-right"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                />
                {grossMargin !== null && (
                  <p className={`mt-1 text-xs ${grossMargin < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {isThai ? `กำไรขั้นต้นประมาณ ${grossMargin}%` : `Approx. gross margin ${grossMargin}%`}
                  </p>
                )}
              </div>
              <div>
                <label className="label">{isThai ? 'ภาษีหัก ณ ที่จ่ายเริ่มต้น' : 'Default withholding tax'}</label>
                <select
                  value={form.defaultWhtRate ?? ''}
                  onChange={(e) => field('defaultWhtRate', (e.target.value || null) as Product['defaultWhtRate'])}
                  className="input-field"
                >
                  {WHT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{isThai ? option.labelTh : option.labelEn}</option>
                  ))}
                </select>
                <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                  <BadgePercent className="h-3 w-3" />
                  {isThai ? 'เป็นค่าแนะนำตอนออกเอกสาร ไม่ใช่ VAT และปรับในเอกสารจริงได้' : 'Suggested on documents. This is not VAT and remains editable.'}
                </p>
              </div>
              <div>
                <label className="label">{isThai ? 'หมายเหตุภายใน' : 'Internal note'}</label>
                <textarea
                  value={form.internalNote ?? ''}
                  onChange={(e) => field('internalNote', e.target.value)}
                  className="input-field"
                  rows={2}
                  placeholder={isThai ? 'เห็นเฉพาะในระบบ' : 'Only visible inside Billboy'}
                />
              </div>
            </div>
          </details>

          <details className="rounded-2xl border border-gray-200 bg-gray-50/60 px-1 sm:px-2" open={form.productType === 'product' || !!form.trackInventory}>
            <summary className="cursor-pointer select-none rounded-2xl px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
              <span className="inline-flex items-center gap-2">
                <Package className="h-4 w-4" />
                {isThai ? 'ติดตามสต๊อก (Inventory)' : 'Inventory tracking'}
              </span>
              <span className={`ml-2 text-xs font-normal ${form.trackInventory ? 'text-emerald-600' : 'text-slate-500'}`}>
                • {form.trackInventory ? (isThai ? 'เปิดอยู่' : 'On') : (isThai ? 'ปิดอยู่' : 'Off')}
              </span>
            </summary>
            <div className="space-y-3 border-t border-gray-200 bg-white px-4 py-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.trackInventory ?? false}
                  onChange={(e) => field('trackInventory', e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm">
                  {isThai
                    ? 'เปิดติดตามสต๊อก — ระบบจะหักสต๊อกอัตโนมัติเมื่อออกใบกำกับภาษี (T01-T03)'
                    : 'Enable tracking — stock auto-decrements when a sales invoice is issued (T01-T03).'}
                </span>
              </label>
              {form.trackInventory && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label">{isThai ? 'สต๊อกเริ่มต้น' : 'Opening stock'}</label>
                    <input
                      type="number"
                      value={form.currentStock ?? 0}
                      onChange={(e) => field('currentStock', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                      className="input-field text-right"
                      min={0}
                      step={1}
                      placeholder="0"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      {isThai ? 'จำนวนที่มีในคลังตอนนี้' : 'Quantity in hand right now'}
                    </p>
                  </div>
                  <div>
                    <label className="label">{isThai ? 'แจ้งเตือนเมื่อต่ำกว่า' : 'Reorder point'}</label>
                    <input
                      type="number"
                      value={form.reorderPoint ?? ''}
                      onChange={(e) => field('reorderPoint', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                      className="input-field text-right"
                      min={0}
                      step={1}
                      placeholder={isThai ? 'เช่น 20' : 'e.g. 20'}
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      {isThai ? 'ขึ้น Dashboard เมื่อยอดสต๊อก ≤ ค่านี้' : 'Shows on Dashboard when stock ≤ this value'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
