import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../hooks/useLanguage';
import type { Customer } from '../../types';

interface Props {
  customers: Customer[];
  customerSearch: string;
  selectedCustomerId: string;
  showBuyerSection: boolean;
  onSearchChange: (v: string) => void;
  onSelectCustomer: (customer: Customer, name: string) => void;
  onClearCustomer: () => void;
  onToggleSection: () => void;
}

function maskPersonalId(value: string) {
  if (value.length < 4) return '*************';
  return `*********${value.slice(-4)}`;
}

function formatCreditLimit(value: Customer['creditLimit'], locale: string) {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
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
                        c,
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
                      {c.personalId ? maskPersonalId(c.personalId) : `${c.taxId} · ${c.branchCode}`}
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
              {selectedCustomer.personalId ? (
                <div className="text-gray-500">
                  {isThai ? 'เลขบุคคลธรรมดา' : 'Individual ID'}: {maskPersonalId(selectedCustomer.personalId)}
                </div>
              ) : (
                <div className="text-gray-500">
                  {isThai ? 'เลขผู้เสียภาษี' : 'Tax ID'}: {selectedCustomer.taxId} ({isThai ? 'สาขา' : 'branch'}{' '}
                  {selectedCustomer.branchCode})
                </div>
              )}
              <div className="text-gray-500">{selectedCustomer.addressTh}</div>
              {(selectedCustomer.creditDays !== null && selectedCustomer.creditDays !== undefined) || selectedCustomer.creditLimit ? (
                <div className="text-gray-500">
                  {[
                    selectedCustomer.creditDays !== null && selectedCustomer.creditDays !== undefined
                      ? (isThai ? `เครดิต ${selectedCustomer.creditDays} วัน` : `${selectedCustomer.creditDays} credit days`)
                      : '',
                    selectedCustomer.creditLimit
                      ? (isThai
                        ? `วงเงิน ${formatCreditLimit(selectedCustomer.creditLimit, 'th-TH')}`
                        : `Limit ${formatCreditLimit(selectedCustomer.creditLimit, 'en-US')}`)
                      : '',
                  ].filter(Boolean).join(' · ')}
                </div>
              ) : null}
              {selectedCustomer.readiness && (
                selectedCustomer.readiness.missingRequiredCount > 0 || selectedCustomer.readiness.recommendedMissingCount > 0
              ) && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {isThai
                      ? `ข้อมูลลูกค้ายังต้องตรวจ ${selectedCustomer.readiness.missingRequiredCount + selectedCustomer.readiness.recommendedMissingCount} รายการ แต่ยังสร้างเอกสารต่อได้`
                      : `${selectedCustomer.readiness.missingRequiredCount + selectedCustomer.readiness.recommendedMissingCount} customer readiness items need review. You can still continue.`}
                  </span>
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
