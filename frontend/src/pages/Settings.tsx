import { useTranslation } from 'react-i18next';
import { useLanguage } from '../hooks/useLanguage';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { MascotHelperCard, PageHeader } from '../components/ui/AppChrome';

export default function Settings() {
  const { t } = useTranslation();
  const { isThai } = useLanguage();

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        eyebrow={isThai ? 'Workspace settings' : 'Workspace settings'}
        title={t('settings.title')}
        description={isThai ? 'ตั้งค่าภาษา การแจ้งเตือน และการเชื่อมต่อให้ทีมทำงานได้ชัดเจนขึ้น' : 'Tune language, notifications, and access settings for a calmer team workspace.'}
        mascot="poses"
      />

      <MascotHelperCard
        title={isThai ? 'Billoy แนะนำ' : 'Billoy tip'}
        description={isThai ? 'เปิดแจ้งเตือน RD failed และ daily summary ไว้เสมอ เพื่อไม่พลาดเอกสารที่ต้องแก้ก่อนกำหนดยื่น' : 'Keep RD failed and daily summary alerts on so the team catches documents before filing deadlines.'}
      />

      {/* Language */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-1">{t('settings.language')}</h2>
        <p className="text-sm text-gray-500 mb-4">{t('settings.languageDesc')}</p>
        <div className="flex items-center gap-4">
          <LanguageSwitcher variant="toggle" />
          <span className="text-sm text-gray-500">
            {isThai ? 'ภาษาปัจจุบัน: ภาษาไทย' : 'Current language: English'}
          </span>
        </div>
      </div>

      {/* Notifications */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">{t('settings.notifications')}</h2>
        <div className="space-y-3">
          {[
            { key: 'rd_success', th: 'เมื่อส่ง RD สำเร็จ', en: 'When RD submission succeeds' },
            { key: 'rd_failed', th: 'เมื่อส่ง RD ล้มเหลว', en: 'When RD submission fails' },
            { key: 'invoice_approved', th: 'เมื่อใบกำกับภาษีได้รับการอนุมัติ', en: 'When invoice is approved' },
            { key: 'daily_summary', th: 'สรุปรายวัน', en: 'Daily summary' },
          ].map((n) => (
            <div key={n.key} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{isThai ? n.th : n.en}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600" />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* API Keys */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">{t('settings.api')}</h2>
        <div className="space-y-3">
          <div>
            <label className="label">{isThai ? 'API Key (อ่านอย่างเดียว)' : 'API Key (Read-only)'}</label>
            <div className="flex gap-2">
              <input className="input-field font-mono text-xs" defaultValue="etax_sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" readOnly />
              <button className="btn-secondary text-xs px-3">
                {isThai ? 'คัดลอก' : 'Copy'}
              </button>
            </div>
          </div>
          <button className="btn-danger text-xs py-1.5">
            {isThai ? 'สร้าง API Key ใหม่' : 'Regenerate API Key'}
          </button>
        </div>
      </div>

      <button className="btn-primary">{t('settings.save')}</button>
    </div>
  );
}
