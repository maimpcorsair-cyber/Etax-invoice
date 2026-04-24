import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Edit2, X, Save, Loader2, Package } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';
import type { Product } from '../types';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import { englishTextOnly, guardedInputClass, inputGuide, isEnglishText, isThaiText, thaiTextOnly } from '../lib/inputGuards';

const VAT_OPTIONS = ['vat7', 'vatExempt', 'vatZero'] as const;

const EMPTY_FORM: Omit<Product, 'id' | 'companyId' | 'isActive'> = {
  code: '',
  nameTh: '',
  nameEn: '',
  descriptionTh: '',
  descriptionEn: '',
  unit: '',
  unitPrice: 0,
  vatType: 'vat7',
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
  const [error, setError] = useState('');
  const formValidation = {
    nameTh: form.nameTh.trim().length > 0 && !isThaiText(form.nameTh, true),
    nameEn: (form.nameEn ?? '').trim().length > 0 && !isEnglishText(form.nameEn ?? ''),
    descriptionTh: (form.descriptionTh ?? '').trim().length > 0 && !isThaiText(form.descriptionTh ?? ''),
    descriptionEn: (form.descriptionEn ?? '').trim().length > 0 && !isEnglishText(form.descriptionEn ?? ''),
  };

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
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.code.trim()) { setError(isThai ? 'กรุณากรอกรหัสสินค้า' : 'Product code is required'); return; }
    if (!form.nameTh.trim() || formValidation.nameTh) { setError(isThai ? 'กรุณากรอกชื่อภาษาไทยให้ถูกต้อง' : 'Please enter a valid Thai name'); return; }
    if (!form.unit.trim()) { setError(isThai ? 'กรุณากรอกหน่วย' : 'Unit is required'); return; }
    if (form.unitPrice < 0) { setError(isThai ? 'ราคาต้องไม่ติดลบ' : 'Price must be non-negative'); return; }

    setSaving(true);
    setError('');
    try {
      const url = editing ? `/api/products/${editing.id}` : '/api/products';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('product.title')}</h1>
        <button
          onClick={openCreate}
          className="btn-primary"
          disabled={!!policy && policy.maxProducts !== null && policy.usage.products >= policy.maxProducts}
        >
          <Plus className="w-4 h-4" />
          {t('product.add')}
        </button>
      </div>

      {policy && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900">
          {isThai
            ? `สินค้า/บริการในแพ็กเกจ ${policy.planLabel}: ${policy.usage.products}${policy.maxProducts ? ` / ${policy.maxProducts}` : ''}`
            : `Products on ${policy.planLabel}: ${policy.usage.products}${policy.maxProducts ? ` / ${policy.maxProducts}` : ''}`}
        </div>
      )}

      {/* Search */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isThai ? 'ค้นหาด้วยชื่อหรือรหัสสินค้า...' : 'Search by name or code...'}
            className="input-field pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{t('product.code')}</th>
                <th className="table-header">{isThai ? 'ชื่อสินค้า/บริการ' : 'Name'}</th>
                <th className="table-header">{t('product.unit')}</th>
                <th className="table-header text-right">{t('product.price')}</th>
                <th className="table-header">{t('product.vatType')}</th>
                <th className="table-header">{t('common.status')}</th>
                <th className="table-header">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-500" />
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell font-mono text-xs font-medium text-primary-700">{p.code}</td>
                    <td className="table-cell">
                      <p className="font-medium">{isThai ? p.nameTh : (p.nameEn ?? p.nameTh)}</p>
                      {p.nameEn && isThai && <p className="text-xs text-gray-400">{p.nameEn}</p>}
                      {!isThai && <p className="text-xs text-gray-400">{p.nameTh}</p>}
                    </td>
                    <td className="table-cell text-gray-500">{p.unit}</td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(p.unitPrice)}</td>
                    <td className="table-cell">
                      <span className={vatBadge(p.vatType)}>{vatLabel(p.vatType)}</span>
                    </td>
                    <td className="table-cell">
                      <span className={p.isActive ? 'badge-success' : 'badge-error'}>
                        {p.isActive ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="table-cell">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1 text-primary-600 hover:text-primary-800"
                        title={t('common.edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? t('product.edit') : t('product.add')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('product.code')} *</label>
                  <input value={form.code} onChange={(e) => field('code', e.target.value)} className="input-field font-mono" placeholder="SW-001" />
                </div>
                <div>
                  <label className="label">{t('product.unit')} *</label>
                  <input value={form.unit} onChange={(e) => field('unit', e.target.value)} className="input-field" placeholder={isThai ? 'ชิ้น / ชั่วโมง / ปี' : 'pcs / hr / yr'} />
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
                  <label className="label">{isThai ? 'รายละเอียด (ไทย)' : 'Description (TH)'}</label>
                  <textarea value={form.descriptionTh} onChange={(e) => field('descriptionTh', thaiTextOnly(e.target.value))} className={guardedInputClass(formValidation.descriptionTh)} rows={2} placeholder={isThai ? 'รายละเอียดสินค้าเพิ่มเติม...' : 'Additional details...'} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{isThai ? 'รายละเอียด (อังกฤษ)' : 'Description (EN)'}</label>
                  <textarea value={form.descriptionEn} onChange={(e) => field('descriptionEn', englishTextOnly(e.target.value))} className={guardedInputClass(formValidation.descriptionEn)} rows={2} placeholder="Additional details in English..." />
                </div>
              </div>
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
    </div>
  );
}
