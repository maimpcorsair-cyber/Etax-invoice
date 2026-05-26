import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// PDPA Section 19 — explicit consent before any non-essential cookie or
// tracker fires. We store the decision in localStorage so the banner stays
// dismissed across sessions, but the user can change their mind via the
// "Cookie Settings" link in the privacy policy footer (see /privacy).

const STORAGE_KEY = 'cookieConsent.v1';

type ConsentValue = 'accepted' | 'rejected' | null;

function readConsent(): ConsentValue {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'accepted' || raw === 'rejected') return raw;
  } catch {
    // localStorage blocked (private mode, third-party-cookie embed) — treat
    // as no-consent so the banner shows; user can dismiss per pageload.
  }
  return null;
}

function writeConsent(value: 'accepted' | 'rejected'): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Same blocked-storage case — silently ignore. The banner will show
    // again next pageload, which is the safe default under PDPA.
  }
}

export default function CookieBanner() {
  const { t, i18n } = useTranslation();
  const [consent, setConsent] = useState<ConsentValue>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setConsent(readConsent());
    setMounted(true);
  }, []);

  if (!mounted || consent !== null) return null;

  const isThai = i18n.language === 'th';

  const handle = (value: 'accepted' | 'rejected') => {
    writeConsent(value);
    setConsent(value);
    // Surface the decision to other listeners (e.g., analytics bootstrap).
    window.dispatchEvent(new CustomEvent('cookie-consent', { detail: value }));
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('cookieBanner.title', { defaultValue: isThai ? 'การใช้คุกกี้' : 'Cookie usage' })}
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-5xl px-3 pb-3 sm:pb-4"
    >
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5">
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
          <div className="flex-1 text-sm leading-6 text-slate-700">
            <p className="font-semibold text-slate-900">
              {t('cookieBanner.title', { defaultValue: isThai ? 'เราใช้คุกกี้' : 'We use cookies' })}
            </p>
            <p className="mt-1">
              {t('cookieBanner.body', {
                defaultValue: isThai
                  ? 'เราใช้คุกกี้ที่จำเป็นเพื่อให้ระบบทำงาน และคุกกี้สำหรับวิเคราะห์/รายงานข้อผิดพลาดเมื่อท่านอนุญาตเท่านั้น'
                  : 'We use cookies that are strictly necessary, and analytics/error-reporting cookies only with your consent.',
              })}{' '}
              <a href="/privacy" className="font-medium text-emerald-700 underline">
                {t('cookieBanner.learnMore', { defaultValue: isThai ? 'อ่านนโยบาย' : 'Learn more' })}
              </a>
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => handle('rejected')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('cookieBanner.reject', { defaultValue: isThai ? 'ปฏิเสธทั้งหมด' : 'Reject all' })}
            </button>
            <button
              type="button"
              onClick={() => handle('accepted')}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {t('cookieBanner.accept', { defaultValue: isThai ? 'ยอมรับ' : 'Accept' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
