import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../../components/LanguageSwitcher';

// Application settings tab inside the Admin Panel. Originally lived in
// AdminPanel.tsx as an inline function — extracted to give that file a
// reasonable size and to make this surface easy to find when wiring real
// notification + API-key persistence later (currently UI-only).

export default function AppSettingsTab({ isThai }: { isThai: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-lg text-gray-900">
          {isThai ? 'การตั้งค่าแอปพลิเคชัน' : 'Application Settings'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isThai ? 'ตั้งค่าภาษา การแจ้งเตือน และ API Key ของบัญชีนี้' : 'Configure language, notifications, and API access for this account.'}
        </p>
      </div>

      {/* Language */}
      <div className="card space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">{t('settings.language')}</h3>
          <p className="mt-0.5 text-sm text-gray-500">{t('settings.languageDesc')}</p>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher variant="toggle" />
          <span className="text-sm text-gray-500">
            {isThai ? 'ภาษาปัจจุบัน: ภาษาไทย' : 'Current language: English'}
          </span>
        </div>
      </div>

      {/* Notifications */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-900">{t('settings.notifications')}</h3>
        <div className="space-y-3">
          {[
            { key: 'rd_success',        th: 'เมื่อส่ง RD สำเร็จ',              en: 'When RD submission succeeds' },
            { key: 'rd_failed',         th: 'เมื่อส่ง RD ล้มเหลว',             en: 'When RD submission fails' },
            { key: 'invoice_approved',  th: 'เมื่อใบกำกับภาษีได้รับการอนุมัติ', en: 'When invoice is approved' },
            { key: 'daily_summary',     th: 'สรุปรายวัน',                       en: 'Daily summary' },
          ].map((n) => (
            <div key={n.key} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{isThai ? n.th : n.en}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-200 transition-colors duration-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-transform after:duration-200 peer-checked:bg-primary-600" />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-900">{t('settings.api')}</h3>
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
