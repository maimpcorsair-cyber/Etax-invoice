import { useState } from 'react';
import { Building2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../hooks/useLanguage';
import type { CompanyProfile } from '../../types';

interface Props {
  company: CompanyProfile | null;
}

export default function SellerCard({ company }: Props) {
  const { t } = useTranslation();
  const { isThai } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card space-y-3 border-slate-200 bg-slate-50/80">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-600 ring-1 ring-slate-200">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">{t('invoice.seller')}</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                {isThai ? 'มาจาก Settings' : 'From Settings'}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              {isThai
                ? 'ข้อมูลผู้ขายใช้ข้อมูลบริษัทที่ตั้งค่าไว้แล้ว จึงไม่ต้องกรอกซ้ำทุกครั้ง หากต้องแก้ข้อมูลถาวรให้ไปที่หน้าตั้งค่า'
                : 'Seller details come from the saved company profile, so this step is only for review. Make permanent edits in Settings.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? (isThai ? 'ซ่อนรายละเอียด' : 'Hide details') : (isThai ? 'ดูรายละเอียด' : 'View details')}
          </button>
          <Link
            to="/app/settings"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {isThai ? 'แก้ใน Settings' : 'Edit in Settings'}
          </Link>
        </div>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-[1.3fr_0.8fr_1fr]">
        <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
          <div className="text-[11px] font-medium text-slate-500">{t('customer.nameTh')}</div>
          <div className="mt-0.5 truncate font-semibold text-slate-900">{company?.nameTh || '-'}</div>
        </div>
        <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
          <div className="text-[11px] font-medium text-slate-500">{t('customer.taxId')}</div>
          <div className="mt-0.5 truncate font-semibold text-slate-900">{company?.taxId || '-'}</div>
        </div>
        <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
          <div className="text-[11px] font-medium text-slate-500">{isThai ? 'สาขา' : 'Branch'}</div>
          <div className="mt-0.5 truncate font-semibold text-slate-900">{company?.branchCode || '-'}</div>
        </div>
      </div>

      {expanded && (
        <div className="grid gap-3 pt-1 md:grid-cols-2">
          <div>
            <label className="label">{t('customer.nameTh')}</label>
            <input className="input-field" value={company?.nameTh ?? ''} readOnly />
          </div>
          <div>
            <label className="label">{t('customer.nameEn')}</label>
            <input className="input-field" value={company?.nameEn ?? ''} readOnly />
          </div>
          <div>
            <label className="label">{t('customer.taxId')}</label>
            <input className="input-field" value={company?.taxId ?? ''} readOnly />
          </div>
          <div>
            <label className="label">{t('customer.addressTh')}</label>
            <textarea
              className="input-field"
              rows={2}
              value={company?.addressTh ?? ''}
              readOnly
            />
          </div>
        </div>
      )}
    </div>
  );
}
