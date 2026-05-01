import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import type { Language } from '../types';

export function useLanguage() {
  const { i18n } = useTranslation();

  const currentLanguage = i18n.language as 'th' | 'en' | 'zh';
  const isThai = currentLanguage === 'th';
  const isEnglish = currentLanguage === 'en';
  const isChinese = currentLanguage === 'zh';

  const switchLanguage = useCallback(
    (lang: 'th' | 'en' | 'zh') => {
      i18n.changeLanguage(lang);
      document.documentElement.lang = lang;
      localStorage.setItem('etax_language', lang);
    },
    [i18n],
  );

  const toggleLanguage = useCallback(() => {
    if (isThai) switchLanguage('en');
    else if (isEnglish) switchLanguage('zh');
    else switchLanguage('th');
  }, [isThai, isEnglish, switchLanguage]);

  /** Pick the right localized field from bilingual objects */
  const localizedField = useCallback(
    <T extends Record<string, unknown>>(obj: T, fieldBase: string): string => {
      const thKey = `${fieldBase}Th` as keyof T;
      const enKey = `${fieldBase}En` as keyof T;
      if (isThai) return (obj[thKey] as string) ?? (obj[enKey] as string) ?? '';
      return (obj[enKey] as string) ?? (obj[thKey] as string) ?? '';
    },
    [isThai],
  );

  const formatCurrency = useCallback(
    (amount: number): string =>
      new Intl.NumberFormat(isThai ? 'th-TH' : isChinese ? 'zh-CN' : 'en-US', {
        style: 'currency',
        currency: 'THB',
        minimumFractionDigits: 2,
      }).format(amount),
    [isThai],
  );

  const formatDate = useCallback(
    (date: string | Date): string => {
      const d = typeof date === 'string' ? new Date(date) : date;
      if (isThai) {
        const buddhistYear = d.getFullYear() + 543;
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${buddhistYear}`;
      }
      return d.toLocaleDateString('en-GB');
    },
    [isThai],
  );

  const getDocumentLanguageLabel = useCallback(
    (lang: Language): string => {
      const labels: Record<Language, Record<'th' | 'en' | 'zh', string>> = {
        th: { th: 'ภาษาไทย', en: 'Thai', zh: '泰语' },
        en: { th: 'ภาษาอังกฤษ', en: 'English', zh: '英语' },
        both: { th: 'สองภาษา', en: 'Bilingual', zh: '双语' },
      };
      return labels[lang][currentLanguage] ?? labels[lang].en;
    },
    [currentLanguage],
  );

  return {
    currentLanguage,
    isThai,
    isEnglish,
    isChinese,
    switchLanguage,
    toggleLanguage,
    localizedField,
    formatCurrency,
    formatDate,
    getDocumentLanguageLabel,
  };
}
