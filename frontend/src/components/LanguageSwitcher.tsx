import { useLanguage } from '../hooks/useLanguage';
import { clsx } from 'clsx';

interface Props {
  variant?: 'button' | 'toggle' | 'dropdown';
  className?: string;
}

export default function LanguageSwitcher({ variant = 'toggle', className }: Props) {
  const { currentLanguage, switchLanguage, toggleLanguage } = useLanguage();

  if (variant === 'toggle') {
    return (
      <div className={clsx('flex items-center bg-gray-100 rounded-lg p-0.5', className)}>
        {(['th', 'en', 'zh'] as const).map((lang) => (
          <button
            key={lang}
            onClick={() => switchLanguage(lang)}
            className={clsx(
              'px-2.5 py-1.5 text-sm font-semibold rounded-md transition-all duration-200',
              currentLanguage === lang
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
            aria-label={lang === 'th' ? 'Switch to Thai' : lang === 'en' ? 'Switch to English' : 'Switch to Chinese'}
          >
            {lang === 'th' ? 'TH' : lang === 'en' ? 'EN' : '中文'}
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'button') {
    const flags: Record<string, string> = { th: '🇹🇭', en: '🇬🇧', zh: '🇨🇳' };
    const labels: Record<string, string> = { th: 'ไทย', en: 'English', zh: '中文' };
    return (
      <button
        onClick={toggleLanguage}
        className={clsx(
          'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors',
          className,
        )}
      >
        <span className="text-base">{flags[currentLanguage] ?? '🌐'}</span>
        <span>{labels[currentLanguage] ?? currentLanguage}</span>
      </button>
    );
  }

  return null;
}
