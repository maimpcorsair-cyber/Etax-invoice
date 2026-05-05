import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, ArrowRight } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import { getApexOrigin, getPlanePath } from '../lib/platform';
import { ProductDoodleField } from './ui/AppChrome';

type PublicPageLayoutProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export default function PublicPageLayout({
  eyebrow,
  title,
  description,
  children,
}: PublicPageLayoutProps) {
  const { t, i18n } = useTranslation();
  const isThai = i18n.language === 'th';

  return (
    <div className="app-shell">
      <ProductDoodleField />
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-gray-100/50 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <a href={getApexOrigin()} className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
              <FileText className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-lg text-gray-900 group-hover:text-primary-600 transition-colors">{t('app.shortName')}</span>
          </a>

          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="toggle" />
            <a href={getPlanePath('/login', 'app')} className="btn-secondary sm">
              {t('auth.login')}
            </a>
            <a href={getPlanePath('/login', 'ops')} className="hidden rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 sm:inline-flex">
              {isThai ? 'Owner Login' : 'Owner Login'}
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 pt-28 pb-16">
        <section className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="mb-10 text-center">
            <p className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-primary-700 shadow-sm">
              {eyebrow}
            </p>
            <h1 className="mt-5 text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight">{title}</h1>
            <p className="mt-4 max-w-3xl mx-auto text-base sm:text-lg text-gray-600">{description}</p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
            {children}
          </div>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/" className="btn-secondary lg justify-center">
              {isThai ? 'กลับหน้าแรก' : 'Back to home'}
            </Link>
            <Link to="/#pricing-checkout" className="btn-primary lg justify-center">
              {isThai ? 'ดูแพ็กเกจและสมัครใช้งาน' : 'View pricing and subscribe'}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
