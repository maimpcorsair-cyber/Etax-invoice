// Static placeholder form. The real company-edit page lives elsewhere;
// this tab exists so the admin sidebar has a "Company" landing card.

export default function CompanyTab({ isThai, t }: { isThai: boolean; t: (k: string) => string }) {
  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-lg text-gray-900">{t('admin.company')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{t('customer.nameTh')}</label>
          <input className="input-field" defaultValue="บริษัท สยาม เทคโนโลยี จำกัด" />
        </div>
        <div>
          <label className="label">{t('customer.nameEn')}</label>
          <input className="input-field" defaultValue="Siam Technology Co., Ltd." />
        </div>
        <div>
          <label className="label">{t('customer.taxId')}</label>
          <input className="input-field" defaultValue="0105560123456" />
        </div>
        <div>
          <label className="label">{isThai ? 'รหัส/ชื่อสาขา' : 'Branch Code/Name'}</label>
          <input className="input-field" defaultValue="00000 / สำนักงานใหญ่" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t('customer.addressTh')}</label>
          <textarea className="input-field" rows={2} defaultValue="123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t('customer.addressEn')}</label>
          <textarea className="input-field" rows={2} defaultValue="123 Sukhumvit Road, Khlong Toei, Bangkok 10110" />
        </div>
      </div>
      <button className="btn-primary">{t('settings.save')}</button>
    </div>
  );
}
