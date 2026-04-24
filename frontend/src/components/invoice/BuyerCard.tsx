import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../hooks/useLanguage';
import type { Customer } from '../../types';

interface Props {
  customers: Customer[];
  customerSearch: string;
  selectedCustomerId: string;
  showBuyerSection: boolean;
  onSearchChange: (v: string) => void;
  onSelectCustomer: (id: string, name: string) => void;
  onClearCustomer: () => void;
  onToggleSection: () => void;
}

export default function BuyerCard({
  customers,
  customerSearch,
  selectedCustomerId,
  showBuyerSection,
  onSearchChange,
  onSelectCustomer,
  onClearCustomer,
  onToggleSection,
}: Props) {
  const { t } = useTranslation();
  const { isThai } = useLanguage();
  const selectedCustomer =
    customers.find((c) => c.id === selectedCustomerId) ?? null;

  return (
    <div className="card">
      <button
        className="w-full flex items-center justify-between font-semibold text-gray-900 mb-3"
        onClick={onToggleSection}
      >
        {t('invoice.buyer')}{' '}
        {selectedCustomerId && (
          <span className="text-green-600 text-sm">✓</span>
        )}
        {showBuyerSection ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {showBuyerSection && (
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {isThai
              ? 'เอกสารจะดึงชื่อ ที่อยู่ และเลขผู้เสียภาษีจากลูกค้าที่เลือกไปใช้ทันที'
              : 'The selected customer name, address, and tax ID will be used on this document.'}
          </div>
          <div>
            <label className="label">
              {isThai ? 'ค้นหาและเลือกลูกค้า *' : 'Search & Select Customer *'}
            </label>
            <input
              type="text"
              className="input-field"
              placeholder={
                isThai ? 'พิมพ์ชื่อ หรือเลขผู้เสียภาษี...' : 'Type name or tax ID...'
              }
              value={customerSearch}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {customers.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto border border-gray-200 rounded-xl bg-white shadow-sm">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      onSelectCustomer(
                        c.id,
                        isThai ? c.nameTh : (c.nameEn ?? c.nameTh),
                      )
                    }
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 ${
                      selectedCustomerId === c.id
                        ? 'bg-primary-50 text-primary-700'
                        : ''
                    }`}
                  >
                    <div className="font-medium">
                      {isThai ? c.nameTh : (c.nameEn ?? c.nameTh)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {c.taxId} · {c.branchCode}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedCustomer && (
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="font-medium text-gray-800">
                {selectedCustomer.nameTh}
              </div>
              {selectedCustomer.nameEn && (
                <div className="text-gray-500">{selectedCustomer.nameEn}</div>
              )}
              <div className="text-gray-500">
                เลขผู้เสียภาษี: {selectedCustomer.taxId} (สาขา{' '}
                {selectedCustomer.branchCode})
              </div>
              <div className="text-gray-500">{selectedCustomer.addressTh}</div>
              {selectedCustomer.personalId && (
                <div className="text-gray-500">
                  บัตร ปชช.: {selectedCustomer.personalId}
                </div>
              )}
              <button
                type="button"
                onClick={onClearCustomer}
                className="text-xs text-red-500 hover:underline mt-1"
              >
                {isThai ? 'เปลี่ยนลูกค้า' : 'Change customer'}
              </button>
            </div>
          )}

          <p className="text-xs text-gray-400">
            {isThai ? 'ยังไม่มีลูกค้า?' : 'Customer not found?'}{' '}
            <a
              href="/app/customers"
              target="_blank"
              className="text-primary-600 hover:underline"
            >
              {isThai ? 'เพิ่มลูกค้าใหม่' : 'Add new customer'}
            </a>
            <span className="ml-1">
              {isThai ? 'แล้วกลับมาเลือกที่หน้านี้ได้ทันที' : 'then return here to select them.'}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
