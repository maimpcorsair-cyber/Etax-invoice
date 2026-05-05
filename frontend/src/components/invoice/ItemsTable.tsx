import { Plus, Trash2, Search, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../hooks/useLanguage';
import { useAuthStore } from '../../store/authStore';
import type { InvoiceItem } from '../../types';
import { englishTextOnly, guardedInputClass, isEnglishText, isThaiText } from '../../lib/inputGuards';

interface Product {
  id: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  unit: string;
  unitPrice: number;
  vatType: string;
}

interface Props {
  items: InvoiceItem[];
  subtotal: number;
  totalVat: number;
  total: number;
  onAddItem: () => void;
  onRemoveItem: (i: number) => void;
  onUpdateItem: (i: number, field: keyof InvoiceItem, value: string | number) => void;
}

function useProductSearch() {
  const { token } = useAuthStore();
  const search = useCallback(async (q: string): Promise<Product[]> => {
    try {
      const url = q.trim() ? `/api/products?search=${encodeURIComponent(q)}` : '/api/products';
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const json = await res.json() as { data: Product[] };
      return json.data ?? [];
    } catch {
      return [];
    }
  }, [token]);
  return { search };
}

function ProductSearchCell({
  item,
  index,
  onUpdateItem,
}: {
  item: InvoiceItem;
  index: number;
  onUpdateItem: (i: number, field: keyof InvoiceItem, value: string | number) => void;
}) {
  const { isThai } = useLanguage();
  const { search } = useProductSearch();
  const [query, setQuery] = useState(item.nameTh);
  const [results, setResults] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(item.nameTh); }, [item.nameTh]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const updateDropdownPos = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 300),
      zIndex: 9999,
    });
  };

  const handleInput = (value: string) => {
    setQuery(value);
    onUpdateItem(index, 'nameTh', value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const r = await search(value);
      setResults(r);
      setLoading(false);
      setOpen(true);
    }, 250);
  };

  const handleFocus = async () => {
    updateDropdownPos();
    setOpen(true);
    if (results.length === 0) {
      setLoading(true);
      const r = await search('');
      setResults(r);
      setLoading(false);
    }
  };

  const selectProduct = (p: Product) => {
    setQuery(p.nameTh);
    setOpen(false);
    onUpdateItem(index, 'nameTh', p.nameTh);
    onUpdateItem(index, 'nameEn', p.nameEn ?? '');
    onUpdateItem(index, 'unit', p.unit);
    onUpdateItem(index, 'unitPrice', p.unitPrice);
    onUpdateItem(index, 'vatType', p.vatType);
  };

  const dropdown = open ? (
    <div style={dropdownStyle} className="bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
      {loading && (
        <div className="px-3 py-2.5 text-xs text-gray-400">
          {isThai ? 'กำลังค้นหา...' : 'Searching...'}
        </div>
      )}
      {!loading && results.length === 0 && (
        <div className="px-3 py-2.5 text-xs text-gray-400">
          {isThai ? 'ไม่พบสินค้า' : 'No products found'}
        </div>
      )}
      {!loading && results.map((p) => (
        <button
          key={p.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); selectProduct(p); }}
          className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-900 truncate">{p.nameTh}</div>
              {p.nameEn && <div className="text-xs text-gray-500 truncate">{p.nameEn}</div>}
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs font-semibold text-blue-700">
                {new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(p.unitPrice)}
              </div>
              <div className="text-xs text-gray-400">{p.unit}</div>
            </div>
          </div>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="relative flex-1">
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={handleFocus}
          className={guardedInputClass(query.trim().length > 0 && !isThaiText(query, true), 'text-sm pr-7')}
          placeholder={isThai ? 'ชื่อสินค้า / บริการ' : 'Item name'}
        />
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      </div>
      {createPortal(dropdown, document.body)}
    </div>
  );
}

function ItemCard({
  item,
  index,
  canDelete,
  isThai,
  formatCurrency,
  onRemove,
  onUpdate,
}: {
  item: InvoiceItem;
  index: number;
  canDelete: boolean;
  isThai: boolean;
  formatCurrency: (n: number) => string;
  onRemove: () => void;
  onUpdate: (field: keyof InvoiceItem, value: string | number) => void;
}) {
  const [showEn, setShowEn] = useState(!!item.nameEn);

  return (
    <div className="group relative bg-white border border-gray-200 rounded-xl p-3 hover:border-indigo-200 hover:shadow-sm transition-all">
      {/* Row 1: index badge + product search + delete */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <ProductSearchCell
          item={item}
          index={index}
          onUpdateItem={(_, field, value) => onUpdate(field, value)}
        />
        <button
          onClick={onRemove}
          disabled={!canDelete}
          className="flex-shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          title={isThai ? 'ลบรายการ' : 'Remove item'}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* EN name toggle */}
      <div className="mb-2.5 pl-7">
        {showEn ? (
          <input
            value={item.nameEn ?? ''}
            onChange={(e) => onUpdate('nameEn', englishTextOnly(e.target.value))}
            className={guardedInputClass(!!item.nameEn && !isEnglishText(item.nameEn), 'text-xs text-gray-500')}
            placeholder="Item name (EN)"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowEn(true)}
            className="text-xs text-gray-400 hover:text-indigo-600 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" />
            {isThai ? 'เพิ่มชื่อภาษาอังกฤษ' : 'Add English name'}
          </button>
        )}
      </div>

      {/* Row 3: numeric fields — responsive: 4-col on md+, 2-col on mobile */}
      <div className="pl-7 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Qty */}
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">
            {isThai ? 'จำนวน' : 'Qty'}
          </label>
          <input
            type="number"
            value={item.quantity}
            onChange={(e) => onUpdate('quantity', parseFloat(e.target.value) || 0)}
            className="input-field text-sm text-right tabular-nums"
            min={0}
          />
        </div>

        {/* Unit */}
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">
            {isThai ? 'หน่วย' : 'Unit'}
          </label>
          <input
            value={item.unit ?? ''}
            onChange={(e) => onUpdate('unit', e.target.value)}
            className="input-field text-sm"
            placeholder={isThai ? 'ชิ้น' : 'pcs'}
          />
        </div>

        {/* Unit price */}
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">
            {isThai ? 'ราคา/หน่วย' : 'Unit price'}
          </label>
          <input
            type="number"
            value={item.unitPrice}
            onChange={(e) => onUpdate('unitPrice', parseFloat(e.target.value) || 0)}
            className="input-field text-sm text-right tabular-nums"
            min={0}
          />
        </div>

        {/* Discount */}
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">
            {isThai ? 'ส่วนลด %' : 'Disc. %'}
          </label>
          <input
            type="number"
            value={item.discount}
            onChange={(e) => onUpdate('discount', parseFloat(e.target.value) || 0)}
            className="input-field text-sm text-right tabular-nums"
            min={0}
            max={100}
          />
        </div>
      </div>

      {/* Row 4: VAT + total amount */}
      <div className="pl-7 mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-gray-500">VAT</span>
          <div className="relative">
            <select
              value={item.vatType}
              onChange={(e) => onUpdate('vatType', e.target.value)}
              className="appearance-none text-xs font-medium border border-gray-200 rounded-lg pl-2.5 pr-6 py-1 bg-white text-gray-700 hover:border-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="vat7">7%</option>
              <option value="vatExempt">{isThai ? 'ยกเว้น' : 'Exempt'}</option>
              <option value="vatZero">0%</option>
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
          </div>
          {item.vatType !== 'vatExempt' && (
            <span className="text-[10px] text-gray-400">
              +{new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(
                item.totalAmount * (item.vatType === 'vat7' ? 0.07 : 0) / (item.vatType === 'vat7' ? 1.07 : 1)
              )}
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-400">{isThai ? 'รวม' : 'Amount'}</div>
          <div className="text-sm font-semibold text-gray-900 tabular-nums">
            {formatCurrency(item.totalAmount)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ItemsTable({
  items,
  subtotal,
  totalVat,
  total,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
}: Props) {
  const { t } = useTranslation();
  const { isThai, formatCurrency } = useLanguage();

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{t('invoice.items')}</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {isThai
              ? 'พิมพ์ชื่อสินค้าเพื่อค้นหาจากคลัง หรือกรอกเอง'
              : 'Search from your catalog or enter manually'}
          </p>
        </div>
        <button onClick={onAddItem} className="btn-secondary text-xs py-1.5 flex-shrink-0">
          <Plus className="w-3.5 h-3.5" />
          {t('invoice.addItem')}
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item, i) => (
          <ItemCard
            key={i}
            item={item}
            index={i}
            canDelete={items.length > 1}
            isThai={isThai}
            formatCurrency={formatCurrency}
            onRemove={() => onRemoveItem(i)}
            onUpdate={(field, value) => onUpdateItem(i, field, value)}
          />
        ))}
      </div>

      {/* Summary — responsive width */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex justify-end">
          <div className="w-full sm:w-64 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t('invoice.subtotal')}</span>
              <span className="font-medium tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t('invoice.vat')}</span>
              <span className="font-medium tabular-nums">{formatCurrency(totalVat)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
              <span>{t('invoice.total')}</span>
              <span className="text-primary-700 tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
