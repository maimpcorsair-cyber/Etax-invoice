import { useLanguage } from '../hooks/useLanguage';
import { clsx } from 'clsx';

interface Props {
  variant?: 'button' | 'toggle' | 'dropdown';
  className?: string;
}

export default function LanguageSwitcher({ variant = 'toggle', className }: Props) {
  const { currentLanguage, switchLanguage } = useLanguage();

  if (variant === 'toggle') {
    return (
      <div className={clsx('flex items-center bg-gray-100 rounded-lg p-0.5', className)}>
        <button
          onClick={() => switchLanguage('th')}
          className={clsx(
            'px-3 py-1.5 text-sm font-semibold rounded-md transition-all duration-200',
            currentLanguage === 'th'
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
          aria-label="Switch to Thai"
        >
          TH
        </button>
        <button
          onClick={() => switchLanguage('en')}
          className={clsx(
            'px-3 py-1.5 text-sm font-semibold rounded-md transition-all duration-200',
            currentLanguage === 'en'
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
          aria-label="Switch to English"
        >
          EN
        </button>
      </div>
    );
  }

  if (variant === 'button') {
    return (
      <button
        onClick={() => switchLanguage(currentLanguage === 'th' ? 'en' : 'th')}
        className={clsx(
          'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors',
          className,
        )}
      >
        <span className="text-base">{currentLanguage === 'th' ? '🇹🇭' : '🇬🇧'}</span>
        <span>{currentLanguage === 'th' ? 'ไทย' : 'English'}</span>
      </button>
    );
  }

  return null;
}
