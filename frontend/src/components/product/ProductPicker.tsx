import { useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Product } from '../../types';

// Combobox for a document line's item name: type freely for a one-off line, or
// pick an existing catalog product from the dropdown to fill name/price/unit/VAT.
// The dropdown footer opens the "add new product" popup, prefilled with what was
// typed, and the created product is inserted as the line.

interface ProductPickerProps {
  value: string;
  onChangeText: (text: string) => void;
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onCreateNew: (typedName: string) => void;
  isThai: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export default function ProductPicker({
  value,
  onChangeText,
  products,
  onSelectProduct,
  onCreateNew,
  isThai,
  disabled,
  placeholder,
  className,
}: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = value.trim().toLowerCase();
  const matches = (query
    ? products.filter((p) =>
      p.nameTh.toLowerCase().includes(query)
      || (p.nameEn ?? '').toLowerCase().includes(query)
      || p.code.toLowerCase().includes(query))
    : products
  ).slice(0, 8);

  function close() {
    blurTimer.current = setTimeout(() => setOpen(false), 120);
  }
  function cancelClose() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => { onChangeText(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { cancelClose(); setOpen(true); }}
        onBlur={close}
        placeholder={placeholder ?? (isThai ? 'ชื่อรายการ' : 'Item name')}
        className={className ?? 'input-field text-sm'}
        disabled={disabled}
        autoComplete="off"
      />
      {open && !disabled && (
        <div
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {matches.length > 0 ? (
            matches.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onSelectProduct(p); setOpen(false); }}
                className="flex w-full items-start justify-between gap-3 border-b border-gray-50 px-3 py-2 text-left last:border-0 hover:bg-primary-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {isThai ? p.nameTh : (p.nameEn ?? p.nameTh)}
                  </span>
                  <span className="block truncate text-xs text-gray-400">
                    {p.code}{p.category ? ` · ${p.category}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-primary-700">
                  {new Intl.NumberFormat(isThai ? 'th-TH' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(p.unitPrice)}
                </span>
              </button>
            ))
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
              <Search className="h-3.5 w-3.5" />
              {isThai ? 'ไม่พบสินค้าที่ตรงกัน — พิมพ์เป็นรายการครั้งเดียวได้ หรือเพิ่มใหม่' : 'No match — type a one-off line or add a new product'}
            </div>
          )}
          <button
            type="button"
            onClick={() => { onCreateNew(value); setOpen(false); }}
            className="flex w-full items-center gap-2 border-t border-gray-100 bg-gray-50/70 px-3 py-2 text-left text-sm font-semibold text-primary-700 hover:bg-primary-50"
          >
            <Plus className="h-4 w-4" />
            {isThai ? 'เพิ่มสินค้าใหม่' : 'Add new product'}
          </button>
        </div>
      )}
    </div>
  );
}
