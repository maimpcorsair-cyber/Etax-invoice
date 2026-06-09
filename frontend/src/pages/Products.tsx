import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, Search, Edit2, X, Save, Loader2, Package, ChevronDown, Layers3, ReceiptText, BadgePercent, FileSpreadsheet, Users, Link2 } from 'lucide-react';
import ProductChannelMappingModal from '../components/product/ProductChannelMappingModal';
import SectionSubNav from '../components/SectionSubNav';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { Product } from '../types';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import { englishTextOnly, guardedInputClass, inputGuide, isEnglishText, isThaiText, thaiTextOnly } from '../lib/inputGuards';
import { ToastStack, type FeedbackToast } from '../components/ui/AppFeedback';

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

export default function Products() {
  const { t } = useTranslation();
  const { isThai, formatCurrency } = useLanguage();
  const { token } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [sheetExporting, setSheetExporting] = useState(false);
  const [error, setError] = useState('');
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [channelProduct, setChannelProduct] = useState<Product | null>(null);
  const [stockDelta, setStockDelta] = useState<string>('');
  const [stockNote, setStockNote] = useState('');
  const [stockSaving, setStockSaving] = useState(false);
  const [toasts, setToasts] = useState<FeedbackToast[]>([]);
  const formValidation = {
    nameTh: form.nameTh.trim().length > 0 && !isThaiText(form.nameTh, true),
    nameEn: (form.nameEn ?? '').trim().length > 0 && !isEnglishText(form.nameEn ?? ''),
    descriptionTh: (form.descriptionTh ?? '').trim().length > 0 && !isThaiText(form.descriptionTh ?? ''),
    descriptionEn: (form.descriptionEn ?? '').trim().length > 0 && !isEnglishText(form.descriptionEn ?? ''),
  };

  const showToast = useCallback((toast: Omit<FeedbackToast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, toast.tone === 'error' ? 7000 : 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/products${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setProducts(json.data ?? []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [search, token]);

  useEffect(() => {
    const tid = setTimeout(fetchProducts, 300);
    return () => clearTimeout(tid);
  }, [fetchProducts]);

  function openCreate() {
    if (policy && policy.maxProducts !== null && policy.usage.products >= policy.maxProducts) {
      setError(isThai ? 'ถึงจำนวนสินค้า/บริการสูงสุดของแพ็กเกจแล้ว' : 'You reached the product limit for this plan');
      return;
    }
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  }

  function openStockAdjust(p: Product) {
    setStockAdjustProduct(p);
    setStockDelta('');
    setStockNote('');
  }

  async function handleStockAdjust() {
    if (!stockAdjustProduct) return;
    const delta = parseFloat(stockDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      showToast({
        tone: 'warning',
        title: isThai ? 'กรอกจำนวนที่จะปรับ' : 'Enter an adjustment amount',
        description: isThai ? 'ใช้จำนวนบวกเพื่อเพิ่มสต๊อก หรือจำนวนลบเพื่อลดสต๊อก' : 'Use a positive number to add stock or a negative number to subtract stock.',
      });
      return;
    }
    setStockSaving(true);
    try {
      const res = await fetch(`/api/products/${stockAdjustProduct.id}/stock/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ delta, note: stockNote || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Adjust failed');
      setStockAdjustProduct(null);
      await fetchProducts();
      showToast({ tone: 'success', title: isThai ? 'ปรับสต๊อกแล้ว' : 'Stock adjusted' });
    } catch (e) {
      showToast({
        tone: 'error',
        title: isThai ? 'ปรับสต๊อกไม่สำเร็จ' : 'Stock adjustment failed',
        description: (e as Error).message,
      });
    } finally {
      setStockSaving(false);
    }
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      code: p.code,
      nameTh: p.nameTh,
      nameEn: p.nameEn ?? '',
      descriptionTh: p.descriptionTh ?? '',
      descriptionEn: p.descriptionEn ?? '',
      unit: p.unit,
      unitPrice: p.unitPrice,
      vatType: p.vatType,
      productType: p.productType ?? 'product',
      category: p.category ?? '',
      accountCode: p.accountCode ?? '',
      unitCost: p.unitCost ?? null,
      defaultWhtRate: p.defaultWhtRate ?? null,
      internalNote: p.internalNote ?? '',
      trackInventory: p.trackInventory ?? false,
      currentStock: p.currentStock ?? 0,
      reorderPoint: p.reorderPoint ?? null,
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.code.trim()) { setError(isThai ? 'กรุณากรอกรหัสสินค้า' : 'Product code is required'); return; }
    if (!form.nameTh.trim() || formValidation.nameTh) { setError(isThai ? 'กรุณากรอกชื่อภาษาไทยให้ถูกต้อง' : 'Please enter a valid Thai name'); return; }
    if (!form.unit.trim()) { setError(isThai ? 'กรุณากรอกหน่วย' : 'Unit is required'); return; }
    if (form.unitPrice < 0) { setError(isThai ? 'ราคาต้องไม่ติดลบ' : 'Price must be non-negative'); return; }
    if (form.unitCost !== null && form.unitCost !== undefined && form.unitCost < 0) { setError(isThai ? 'ต้นทุนต้องไม่ติดลบ' : 'Cost must be non-negative'); return; }

    setSaving(true);
    setError('');
    try {
      const url = editing ? `/api/products/${editing.id}` : '/api/products';
      const method = editing ? 'PUT' : 'POST';
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
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Save failed');
      }
      setShowModal(false);
      fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleExportSheet() {
    setSheetExporting(true);
    setError('');
    try {
      const res = await fetch('/api/products/export/sheets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({})) as { data?: { url?: string }; error?: string; detail?: string };
      if (!res.ok) throw new Error(json.error || json.detail || `HTTP ${res.status}`);
      if (json.data?.url) window.open(json.data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sheets export failed');
    } finally {
      setSheetExporting(false);
    }
  }

  const field = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const vatLabel = (v: string) => {
    if (v === 'vat7') return isThai ? 'VAT 7%' : 'VAT 7%';
    if (v === 'vatExempt') return isThai ? 'ยกเว้น VAT' : 'VAT Exempt';
    return isThai ? 'VAT 0%' : 'Zero-rated';
  };

  const vatBadge = (v: string) => {
    if (v === 'vat7') return 'badge-info';
    if (v === 'vatExempt') return 'badge-warning';
    return 'badge-success';
  };

  const productTypeMeta = (type: Product['productType'] | string) =>
    PRODUCT_TYPE_OPTIONS.find((option) => option.value === type) ?? PRODUCT_TYPE_OPTIONS[0];

  const productTypeLabel = (type: Product['productType'] | string) => {
    const meta = productTypeMeta(type);
    return isThai ? meta.labelTh : meta.labelEn;
  };

  const grossMargin = form.unitCost && form.unitPrice > 0
    ? Math.round(((form.unitPrice - form.unitCost) / form.unitPrice) * 100)
    : null;
  const activeCount = products.filter((product) => product.isActive).length;
  const inactiveCount = Math.max(products.length - activeCount, 0);
  const stockTrackedCount = products.filter((product) => product.trackInventory).length;
  const lowStockCount = products.filter((product) => {
    if (!product.trackInventory || product.reorderPoint === null || product.reorderPoint === undefined) return false;
    return (product.currentStock ?? 0) <= product.reorderPoint;
  }).length;
  const serviceCount = products.filter((product) => product.productType === 'service').length;
  const vat7Count = products.filter((product) => product.vatType === 'vat7').length;
  const catalogValue = products.reduce((sum, product) => sum + (product.isActive ? product.unitPrice : 0), 0);
  const workItems = [
    {
      label: isThai ? 'ใช้งานอยู่' : 'Active items',
      value: activeCount,
      detail: isThai ? `${inactiveCount} ปิดใช้งาน` : `${inactiveCount} inactive`,
      icon: Package,
      tone: activeCount > 0 ? 'clear' : 'idle',
    },
    {
      label: isThai ? 'ติดตามสต๊อก' : 'Stock tracked',
      value: stockTrackedCount,
      detail: lowStockCount > 0 ? (isThai ? `${lowStockCount} ต่ำกว่าจุดสั่งซื้อ` : `${lowStockCount} below reorder`) : (isThai ? 'ไม่มีรายการต่ำ' : 'No low-stock items'),
      icon: Layers3,
      tone: lowStockCount > 0 ? 'needs' : stockTrackedCount > 0 ? 'clear' : 'idle',
    },
    {
      label: isThai ? 'บริการ' : 'Services',
      value: serviceCount,
      detail: isThai ? 'ใช้กับงานบริการ/ค่าจ้าง' : 'Service and labor lines',
      icon: ReceiptText,
      tone: serviceCount > 0 ? 'clear' : 'idle',
    },
    {
      label: isThai ? 'VAT 7%' : 'VAT 7%',
      value: vat7Count,
      detail: isThai ? 'รายการที่คิดภาษีขาย' : 'Taxable sales items',
      icon: BadgePercent,
      tone: vat7Count > 0 ? 'clear' : 'idle',
    },
  ];
  const statusDotClass = (tone: string) => {
    if (tone === 'needs') return 'bg-amber-500';
    if (tone === 'clear') return 'bg-emerald-500';
    return 'bg-slate-300';
  };

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <SectionSubNav
        items={[
          { key: 'customers', to: '/app/customers', label: isThai ? 'ลูกค้า' : 'Customers', icon: Users },
          { key: 'products', to: '/app/products', label: isThai ? 'สินค้า/บริการ' : 'Products & Services', icon: Package },
        ]}
      />
      <section className="workspace-command">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.7fr)] lg:items-stretch">
          <div className="min-w-0">
            <p className="premium-eyebrow">{isThai ? 'Product Catalog Ledger' : 'Product Catalog Ledger'}</p>
            <div className="mt-3 flex items-center gap-3 sm:mt-4">
              <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800 ring-1 ring-primary-100 sm:inline-flex">
                <Package className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-slate-950 sm:text-3xl">
                  {isThai ? 'สินค้าและบริการ' : 'Products / Services'}
                </h1>
                <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-slate-600 sm:block">
                  {isThai ? 'ตั้งทะเบียนรายการขายให้พร้อมออกเอกสาร ภาษี สต๊อก และ Google Sheet' : 'Keep reusable sales items ready for documents, tax, stock, and Google Sheets.'}
                </p>
              </div>
            </div>
            <div className="mt-4 sm:mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isThai ? 'มูลค่าราคาขายใน catalog' : 'Catalog price book value'}
              </p>
              <p className="mt-1 text-[2.15rem] font-bold leading-none text-primary-800 tabular-nums sm:text-[2.5rem]">
                {formatCurrency(catalogValue)}
              </p>
              <div className="mt-3 h-px w-40 bg-slate-200" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:mt-5 sm:gap-3">
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'ใช้งานอยู่' : 'Active'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{activeCount}</p>
              </div>
              <div className="border-t border-slate-200 px-1 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? 'ต่ำกว่าจุดสั่งซื้อ' : 'Low stock'}</p>
                <p className="mt-1 font-bold text-slate-950 tabular-nums">{lowStockCount}</p>
              </div>
            </div>
          </div>

          <div className="workspace-command-rail">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <Package className="h-4 w-4 text-primary-700" />
              {isThai ? 'จัดการ catalog' : 'Catalog actions'}
            </div>
            {policy && (
              <div className="mt-3 border-y border-slate-200 py-3">
                <p className="text-xs font-semibold text-slate-500">{isThai ? `แพ็กเกจ ${policy.planLabel}` : `${policy.planLabel} plan`}</p>
                <p className="mt-1 text-sm font-bold text-slate-950 tabular-nums">
                  {policy.usage.products}{policy.maxProducts ? ` / ${policy.maxProducts}` : ''} {isThai ? 'รายการ' : 'items'}
                </p>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <button
                onClick={openCreate}
                className="btn-primary px-3 py-2 text-sm disabled:opacity-60 sm:px-4 sm:py-2.5"
                disabled={!!policy && policy.maxProducts !== null && policy.usage.products >= policy.maxProducts}
              >
                <Plus className="h-4 w-4" />
                {isThai ? 'เพิ่มรายการ' : 'Add item'}
              </button>
              <button
                onClick={handleExportSheet}
                className="btn-secondary px-3 py-2 text-sm disabled:opacity-60 sm:px-4 sm:py-2.5"
                disabled={sheetExporting}
                title={isThai ? 'ส่งออกทะเบียนสินค้าและบริการไป Google Sheet' : 'Export product catalog to Google Sheets'}
              >
                {sheetExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {isThai ? 'Sync Sheet' : 'Sync Sheet'}
              </button>
              <Link to="/app/customers" className="btn-secondary col-span-2 px-3 py-2 text-sm sm:col-span-1 sm:px-4 sm:py-2.5">
                <Users className="h-4 w-4" />
                {isThai ? 'รายชื่อลูกค้า' : 'Customers'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {workItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                  <Icon className="h-4 w-4" />
                </span>
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(item.tone)}`} />
              </div>
              <p className="mt-3 text-xl font-bold leading-none text-slate-950 tabular-nums">{item.value}</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{item.label}</p>
              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isThai ? 'ค้นหาชื่อ รหัส หมวดหมู่ หรือรหัสบัญชี' : 'Search name, code, category, or account code'}
            className="input-field pl-9"
          />
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            {t('common.noData')}
          </div>
        ) : (
          products.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
              {/* Row 1: code + VAT badge */}
              <div className="flex items-center justify-between">
                <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs font-semibold text-primary-700">
                  {p.code}
                </span>
                <span className={vatBadge(p.vatType)}>{vatLabel(p.vatType)}</span>
              </div>
              {/* Row 2: name */}
              <div>
                <p className="font-semibold text-gray-900">{p.nameTh}</p>
                {p.nameEn && <p className="text-sm text-gray-500">{p.nameEn}</p>}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {productTypeLabel(p.productType ?? 'product')}
                  </span>
                  {p.category && (
                    <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {p.category}
                    </span>
                  )}
                </div>
              </div>
              {/* Row 3: unit + price */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{p.unit}</span>
                <span className="font-bold text-gray-900 tabular-nums">{formatCurrency(p.unitPrice)}</span>
              </div>
              {/* Row 4: status + edit */}
              <div className="flex items-center justify-between pt-1">
                <span className={p.isActive ? 'badge-success' : 'badge-error'}>
                  {p.isActive ? t('common.active') : t('common.inactive')}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setChannelProduct(p)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-primary-700 hover:border-primary-200 hover:text-primary-900"
                    title={isThai ? 'SKU ช่องทางขาย' : 'Channel SKUs'}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    SKU
                  </button>
                  <button
                    onClick={() => openEdit(p)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-primary-700 hover:border-primary-200 hover:text-primary-900"
                    title={t('common.edit')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    {t('common.edit')}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-950">{isThai ? 'ทะเบียนสินค้าและบริการ' : 'Product catalog ledger'}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {isThai ? 'ตรวจรหัสสินค้า ราคา VAT สต๊อก และสถานะก่อนนำไปออกเอกสารขาย' : 'Review codes, prices, VAT, stock, and status before using items on sales documents.'}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="table-header">{t('product.code')}</th>
                <th className="table-header">{isThai ? 'ชื่อสินค้า/บริการ' : 'Name'}</th>
                <th className="table-header">{isThai ? 'ประเภท/หมวด' : 'Type / Category'}</th>
                <th className="table-header">{t('product.unit')}</th>
                <th className="table-header text-right">{t('product.price')}</th>
                <th className="table-header">{t('product.vatType')}</th>
                <th className="table-header">{isThai ? 'สต๊อก' : 'Stock'}</th>
                <th className="table-header">{t('common.status')}</th>
                <th className="table-header">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-500" />
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500">
                    <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-slate-50">
                    <td className="table-cell font-mono text-xs font-semibold text-primary-700">{p.code}</td>
                    <td className="table-cell">
                      <p className="font-medium">{isThai ? p.nameTh : (p.nameEn ?? p.nameTh)}</p>
                      {p.nameEn && isThai && <p className="text-xs text-slate-500">{p.nameEn}</p>}
                      {!isThai && <p className="text-xs text-slate-500">{p.nameTh}</p>}
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-gray-700">{productTypeLabel(p.productType ?? 'product')}</span>
                        {p.category && <span className="text-xs text-slate-500">{p.category}</span>}
                      </div>
                    </td>
                    <td className="table-cell text-gray-500">{p.unit}</td>
                    <td className="table-cell text-right font-semibold tabular-nums">{formatCurrency(p.unitPrice)}</td>
                    <td className="table-cell">
                      <span className={vatBadge(p.vatType)}>{vatLabel(p.vatType)}</span>
                    </td>
                    <td className="table-cell">
                      {p.trackInventory ? (
                        (() => {
                          const stock = p.currentStock ?? 0;
                          const reorder = p.reorderPoint;
                          const low = reorder !== null && reorder !== undefined && stock <= reorder;
                          return (
                            <span className={`inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs font-semibold ${low ? 'border-rose-200 text-rose-700' : stock === 0 ? 'border-slate-200 text-slate-500' : 'border-emerald-200 text-emerald-700'}`}>
                              <Package className="h-3.5 w-3.5" /> {stock}
                              {low && reorder !== null && reorder !== undefined && (
                                <span className="text-rose-600">≤{reorder}</span>
                              )}
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={p.isActive ? 'badge-success' : 'badge-error'}>
                        {p.isActive ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        {p.trackInventory && (
                          <button
                            onClick={() => openStockAdjust(p)}
                            className="p-1 text-primary-600 hover:text-primary-800"
                            title={isThai ? 'ปรับสต๊อก' : 'Adjust stock'}
                          >
                            <Package className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setChannelProduct(p)}
                          className="p-1 text-primary-600 hover:text-primary-800"
                          title={isThai ? 'SKU ช่องทางขาย' : 'Channel SKUs'}
                        >
                          <Link2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1 text-primary-600 hover:text-primary-800"
                          title={t('common.edit')}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? t('product.edit') : t('product.add')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {error && (
                <div className="rounded-xl border border-rose-200 bg-white p-3 text-sm font-semibold text-rose-700">{error}</div>
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
                        className={`rounded-xl border px-3 py-2 text-left transition-[background-color,border-color,box-shadow] duration-200 ${
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
                  <input value={form.unit} onChange={(e) => field('unit', e.target.value)} className="input-field" list="product-unit-options" placeholder={isThai ? 'ชิ้น / งาน / เดือน' : 'pcs / job / month'} />
                  <datalist id="product-unit-options">
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
                  <p className="mt-1 text-xs text-slate-500">
                    {isThai ? 'ไม่บังคับ แต่ช่วยให้ค้นหาและสรุปรายงานได้ง่ายขึ้น' : 'Optional, but useful for search and reporting.'}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{isThai ? 'รายละเอียด (ไทย)' : 'Description (TH)'}</label>
                  <textarea value={form.descriptionTh} onChange={(e) => field('descriptionTh', thaiTextOnly(e.target.value))} className={guardedInputClass(formValidation.descriptionTh)} rows={2} placeholder={isThai ? 'รายละเอียดสินค้าเพิ่มเติม...' : 'Additional details...'} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{isThai ? 'รายละเอียด (อังกฤษ)' : 'Description (EN)'}</label>
                  <textarea value={form.descriptionEn} onChange={(e) => field('descriptionEn', englishTextOnly(e.target.value))} className={guardedInputClass(formValidation.descriptionEn)} rows={2} placeholder="Additional details in English..." />
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
                  <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
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
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
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

              {/* Inventory tracking — opt-in per product. Service-business
                  tenants leave this off and never see the stock UI. */}
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
                          disabled={!!editing}
                          placeholder="0"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          {editing
                            ? (isThai ? 'หลังบันทึก ใช้ปุ่ม "ปรับสต๊อก" ในรายการสินค้าเพื่อแก้ยอด' : 'After save, use "Adjust" on the row to change stock.')
                            : (isThai ? 'จำนวนที่มีในคลังตอนนี้' : 'Quantity in hand right now')}
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
                        <p className="mt-1 text-xs text-slate-500">
                          {isThai ? 'ขึ้น Dashboard เมื่อยอดสต๊อก ≤ ค่านี้' : 'Shows on Dashboard when stock ≤ this value'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="btn-secondary">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock adjust modal */}
      {stockAdjustProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                <span className="inline-flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary-700" />
                  {isThai ? 'ปรับสต๊อก' : 'Adjust stock'} — {stockAdjustProduct.code}
                </span>
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {isThai ? 'สต๊อกปัจจุบัน:' : 'Current stock:'}{' '}
                <strong>{stockAdjustProduct.currentStock ?? 0}</strong>
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">{isThai ? 'จำนวนที่จะปรับ' : 'Adjust by'}</label>
                <input
                  type="number"
                  value={stockDelta}
                  onChange={(e) => setStockDelta(e.target.value)}
                  className="input-field text-right"
                  placeholder={isThai ? 'เช่น +10 (รับเข้า) หรือ -2 (ของหาย)' : 'e.g. +10 (received) or -2 (loss)'}
                  step={1}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {isThai ? 'ใส่จำนวนบวกเพื่อเพิ่ม / ลบเพื่อหัก' : 'Positive to add, negative to subtract'}
                </p>
              </div>
              <div>
                <label className="label">{isThai ? 'หมายเหตุ' : 'Note'}</label>
                <input
                  type="text"
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  className="input-field"
                  placeholder={isThai ? 'เช่น "ตรวจนับ", "ของหาย", "รับเข้าจาก ABC"' : 'e.g. "Count fix", "Loss", "Received from ABC"'}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setStockAdjustProduct(null)} className="btn-secondary">
                {t('common.cancel')}
              </button>
              <button onClick={handleStockAdjust} disabled={stockSaving} className="btn-primary">
                {stockSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {channelProduct && (
        <ProductChannelMappingModal
          product={channelProduct}
          token={token}
          isThai={isThai}
          canManage
          onClose={() => setChannelProduct(null)}
        />
      )}
      </div>
    </>
  );
}
