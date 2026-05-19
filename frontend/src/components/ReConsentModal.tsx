import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';

// Shown when /api/auth/me returned `legal.reConsentRequired: true`. Blocks
// the app behind a backdrop until the user accepts the new doc version.
// On accept we POST /api/account/accept-legal then refetch /me so the new
// `legal.acceptedVersion` flows through the store and the modal goes away.

export default function ReConsentModal() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [accepted, setAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.legal?.reConsentRequired || !token) return null;

  const isThai = i18n.language === 'th';
  const isZh = i18n.language === 'zh' || i18n.language?.startsWith('zh');
  const currentVersion = user.legal.currentVersion;

  const handleAccept = async () => {
    if (!accepted) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/account/accept-legal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ version: currentVersion, marketingOptIn }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Refresh /me so the store picks up the new acceptedVersion and the
      // modal unmounts naturally on the next render.
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const meJson = await meRes.json();
        setAuth(token, meJson);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record consent');
    } finally {
      setSubmitting(false);
    }
  };

  const lead = t('reConsent.lead', {
    defaultValue: isThai
      ? 'เราอัปเดตข้อกำหนดและนโยบายของเรา กรุณาตรวจสอบและยอมรับเพื่อใช้งานต่อ'
      : isZh
      ? '我们更新了条款和政策。请审阅并接受后继续使用。'
      : 'We have updated our terms and policies. Please review and accept to continue.',
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('reConsent.title', { defaultValue: isThai ? 'อัปเดตข้อกำหนดและนโยบาย' : isZh ? '条款和政策更新' : 'Terms and policy update' })}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{lead}</p>
        <p className="mt-2 text-xs text-slate-500">
          {t('reConsent.version', {
            defaultValue: isThai
              ? `เวอร์ชันใหม่: ${currentVersion}`
              : isZh
              ? `新版本:${currentVersion}`
              : `New version: ${currentVersion}`,
          })}
        </p>

        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <label className="flex items-start gap-3 text-sm text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              {t('signup.consent.legal', { defaultValue: isThai ? 'ฉันได้อ่านและยอมรับ' : isZh ? '我已阅读并接受' : 'I have read and accept the' })}{' '}
              <a href="/terms" target="_blank" rel="noopener" className="text-emerald-700 underline">{t('signup.consent.terms', { defaultValue: isThai ? 'ข้อกำหนดการใช้บริการ' : isZh ? '服务条款' : 'Terms of Service' })}</a>
              {', '}
              <a href="/privacy" target="_blank" rel="noopener" className="text-emerald-700 underline">{t('signup.consent.privacy', { defaultValue: isThai ? 'นโยบายความเป็นส่วนตัว' : isZh ? '隐私政策' : 'Privacy Policy' })}</a>
              {' '}{isThai ? 'และ' : isZh ? '和' : 'and'}{' '}
              <a href="/legal/dpa" target="_blank" rel="noopener" className="text-emerald-700 underline">{t('signup.consent.dpa', { defaultValue: isThai ? 'ข้อตกลงการประมวลผลข้อมูล (DPA)' : isZh ? '数据处理协议(DPA)' : 'Data Processing Agreement (DPA)' })}</a>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>{t('signup.consent.marketing', { defaultValue: isThai
              ? 'ยินดีรับข่าวสาร โปรโมชั่น และอัปเดตฟีเจอร์ใหม่ทางอีเมล (ยกเลิกได้ตลอดเวลา)'
              : isZh
              ? '向我发送产品更新、技巧与促销邮件(可随时取消订阅)'
              : 'Send me product updates, tips, and promotions (you can unsubscribe at any time)' })}</span>
          </label>
        </div>

        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

        <button
          type="button"
          onClick={handleAccept}
          disabled={!accepted || submitting}
          className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting
            ? (isThai ? 'กำลังบันทึก…' : isZh ? '保存中…' : 'Saving…')
            : (isThai ? 'ยอมรับและใช้งานต่อ' : isZh ? '接受并继续' : 'Accept and continue')}
        </button>
      </div>
    </div>
  );
}
