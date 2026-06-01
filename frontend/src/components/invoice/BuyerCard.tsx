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
  /** When provided, the "add new customer" link opens this popup instead of navigating away. */
  onAddCustomer?: () => void;
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
  onAddCustomer,
}: Props) {
  const { t } = useTranslation();
  const { isThai } = useLanguage();
  const selectedCustomer =
    customers.find((c) => c.id === selectedCustomerId) ?? null;
  const selectedCustomerName = selectedCustomer
    ? (isThai ? selectedCustomer.nameTh : (selectedCustomer.nameEn ?? selectedCustomer.nameTh))
    : customerSearch.trim();

  return (
    <div className="card">
      <button
        className="mb-3 flex w-full items-center justify-between font-semibold text-gray-900"
        onClick={onToggleSection}
      >
        <span className="flex items-center gap-2">
          {t('invoice.buyer')}
          {selectedCustomerId && (
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          )}
        </span>
        {showBuyerSection ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {showBuyerSection && (
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {isThai
              ? 'เอกสารจะดึงชื่อ ที่อยู่ และเลขผู้เสียภาษีจากลูกค้าที่เลือกไปใช้ทันที'
              : 'The selected customer name, address, and tax ID will be used on this document.'}
          </div>

          {selectedCustomerId && selectedCustomerName ? (
            <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium text-primary-700">
                    {isThai ? 'ลูกค้าที่เลือก' : 'Selected customer'}
                  </p>
                  <p className="truncate font-semibold text-slate-900">{selectedCustomerName}</p>
                  {selectedCustomer ? (
                    <>
                      <p className="text-xs text-slate-600">
                        {selectedCustomer.personalId
                          ? `${isThai ? 'เลขบุคคลธรรมดา' : 'Individual ID'}: ${maskPersonalId(selectedCustomer.personalId)}`
                          : `${isThai ? 'เลขผู้เสียภาษี' : 'Tax ID'}: ${selectedCustomer.taxId} (${isThai ? 'สาขา' : 'branch'} ${selectedCustomer.branchCode})`}
                      </p>
                      <p className="text-xs leading-5 text-slate-500">{selectedCustomer.addressTh}</p>
                      {((selectedCustomer.creditDays !== null && selectedCustomer.creditDays !== undefined) || selectedCustomer.creditLimit) && (
                        <p className="text-xs text-slate-500">
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
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClearCustomer}
                  className="shrink-0 rounded-full border border-primary-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50"
                >
                  {isThai ? 'เปลี่ยน' : 'Change'}
                </button>
              </div>

              {selectedCustomer?.readiness && (
                selectedCustomer.readiness.missingRequiredCount > 0 || selectedCustomer.readiness.recommendedMissingCount > 0
              ) && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {isThai
                      ? `ข้อมูลลูกค้ายังต้องตรวจ ${selectedCustomer.readiness.missingRequiredCount + selectedCustomer.readiness.recommendedMissingCount} รายการ แต่ยังสร้างเอกสารต่อได้`
                      : `${selectedCustomer.readiness.missingRequiredCount + selectedCustomer.readiness.recommendedMissingCount} customer readiness items need review. You can still continue.`}
                  </span>
                </div>
              )}
            </div>
          ) : (
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
                <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
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
                      className="w-full border-b border-gray-50 px-3 py-2 text-left text-sm hover:bg-gray-50 last:border-0"
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
          )}

          <p className="text-xs text-gray-400">
            {isThai ? 'ยังไม่มีลูกค้า?' : 'Customer not found?'}{' '}
            {onAddCustomer ? (
              <button
                type="button"
                onClick={onAddCustomer}
                className="text-primary-600 hover:underline"
              >
                {isThai ? 'เพิ่มลูกค้าใหม่' : 'Add new customer'}
              </button>
            ) : (
              <a
                href="/app/customers"
                target="_blank"
                className="text-primary-600 hover:underline"
              >
                {isThai ? 'เพิ่มลูกค้าใหม่' : 'Add new customer'}
              </a>
            )}
            <span className="ml-1">
              {isThai
                ? (onAddCustomer ? 'ได้เลยที่หน้านี้' : 'แล้วกลับมาเลือกที่หน้านี้ได้ทันที')
                : (onAddCustomer ? 'right here.' : 'then return here to select them.')}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
