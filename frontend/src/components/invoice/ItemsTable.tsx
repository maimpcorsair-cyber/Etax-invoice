import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../hooks/useLanguage';
import type { InvoiceItem } from '../../types';

interface Props {
  items: InvoiceItem[];
  subtotal: number;
  totalVat: number;
  total: number;
  onAddItem: () => void;
  onRemoveItem: (i: number) => void;
  onUpdateItem: (i: number, field: keyof InvoiceItem, value: string | number) => void;
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
              ? 'กรอกชื่อสินค้า จำนวน ราคา และ VAT ของแต่ละรายการ ระบบจะคำนวณยอดรวมให้อัตโนมัติ'
              : 'Add item name, quantity, price, and VAT for each row. Totals are calculated automatically.'}
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
                  <input
                    value={item.nameTh}
                    onChange={(e) => onUpdateItem(i, 'nameTh', e.target.value)}
                    className="input-field text-xs"
                    placeholder="ชื่อสินค้า"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    value={item.nameEn ?? ''}
                    onChange={(e) => onUpdateItem(i, 'nameEn', e.target.value)}
                    className="input-field text-xs"
                    placeholder="Item name"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) =>
                      onUpdateItem(i, 'quantity', parseFloat(e.target.value) || 0)
                    }
                    className="input-field text-xs text-right"
                    min={0}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) =>
                      onUpdateItem(i, 'unitPrice', parseFloat(e.target.value) || 0)
                    }
                    className="input-field text-xs text-right"
                    min={0}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    value={item.discount}
                    onChange={(e) =>
                      onUpdateItem(i, 'discount', parseFloat(e.target.value) || 0)
                    }
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
