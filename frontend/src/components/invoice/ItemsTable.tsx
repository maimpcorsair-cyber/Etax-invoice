import { Plus, Trash2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
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
  const [cache, setCache] = useState<Product[]>([]);

  const search = useCallback(async (q: string): Promise<Product[]> => {
    try {
      const url = q.trim() ? `/api/products?search=${encodeURIComponent(q)}` : '/api/products';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json() as { data: Product[] };
      setCache(json.data ?? []);
      return json.data ?? [];
    } catch {
      return [];
    }
  }, []);

  return { search, cache };
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
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // sync if item changes from outside (edit mode)
  useEffect(() => {
    setQuery(item.nameTh);
  }, [item.nameTh]);

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    onUpdateItem(index, 'nameTh', value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const r = await search(value);
      setResults(r);
      setLoading(false);
      setOpen(r.length > 0);
    }, 250);
  };

  const handleFocus = async () => {
    if (results.length === 0) {
      setLoading(true);
      const r = await search('');
      setResults(r);
      setLoading(false);
    }
    setOpen(true);
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

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={handleFocus}
          className={guardedInputClass(query.trim().length > 0 && !isThaiText(query, true), 'text-xs pr-6')}
          placeholder="ชื่อสินค้า"
        />
        <Search className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
      </div>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-gray-400">
              {isThai ? 'กำลังค้นหา...' : 'Searching...'}
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">
              {isThai ? 'ไม่พบสินค้า' : 'No products found'}
            </div>
          )}
          {!loading && results.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectProduct(p); }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-0"
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
      )}
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">{t('invoice.items')}</h3>
          <p className="mt-1 text-xs text-gray-500">
            {isThai
              ? 'พิมพ์ชื่อสินค้าเพื่อค้นหาจากคลัง หรือกรอกเองได้'
              : 'Type to search from your product catalog, or enter manually.'}
          </p>
        </div>
        <button onClick={onAddItem} className="btn-secondary text-xs py-1.5">
          <Plus className="w-3.5 h-3.5" />
          {t('invoice.addItem')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="table-header" scope="col">{t('invoice.itemName')} (TH)</th>
              <th className="table-header" scope="col">{t('invoice.itemName')} (EN)</th>
              <th className="table-header w-20" scope="col">{t('invoice.quantity')}</th>
              <th className="table-header w-24" scope="col">{t('invoice.unitPrice')}</th>
              <th className="table-header w-20" scope="col">{t('invoice.discount')} %</th>
              <th className="table-header" scope="col">{isThai ? 'VAT' : 'VAT Type'}</th>
              <th className="table-header w-28 text-right" scope="col">{t('invoice.amount')}</th>
              <th className="table-header w-8" scope="col" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item, i) => (
              <tr key={i}>
                <td className="py-2 pr-2">
                  <ProductSearchCell item={item} index={i} onUpdateItem={onUpdateItem} />
                </td>
                <td className="py-2 pr-2">
                  <input
                    value={item.nameEn ?? ''}
                    onChange={(e) => onUpdateItem(i, 'nameEn', englishTextOnly(e.target.value))}
                    className={guardedInputClass(!!item.nameEn && !isEnglishText(item.nameEn), 'text-xs')}
                    placeholder="Item name"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => onUpdateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                    className="input-field text-xs text-right"
                    min={0}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) => onUpdateItem(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                    className="input-field text-xs text-right"
                    min={0}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    value={item.discount}
                    onChange={(e) => onUpdateItem(i, 'discount', parseFloat(e.target.value) || 0)}
                    className="input-field text-xs text-right"
                    min={0}
                    max={100}
                  />
                </td>
                <td className="py-2 pr-2">
                  <select
                    value={item.vatType}
                    onChange={(e) => onUpdateItem(i, 'vatType', e.target.value)}
                    className="input-field text-xs"
                  >
                    <option value="vat7">7%</option>
                    <option value="vatExempt">Exempt</option>
                    <option value="vatZero">0%</option>
                  </select>
                </td>
                <td className="py-2 pr-2 text-right font-medium text-gray-700">
                  {formatCurrency(item.totalAmount)}
                </td>
                <td className="py-2">
                  <button
                    onClick={() => onRemoveItem(i)}
                    disabled={items.length === 1}
                    className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
        <div className="w-72 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t('invoice.subtotal')}</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t('invoice.vat')}</span>
            <span className="font-medium">{formatCurrency(totalVat)}</span>
          </div>
          <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
            <span>{t('invoice.total')}</span>
            <span className="text-primary-700">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
