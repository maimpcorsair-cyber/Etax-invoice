import { useTranslation } from 'react-i18next';
import type { CompanyProfile } from '../../types';

interface Props {
  company: CompanyProfile | null;
}

export default function SellerCard({ company }: Props) {
  const { t } = useTranslation();

  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-3">{t('invoice.seller')}</h3>
      <div className="space-y-3">
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
    </div>
  );
}
