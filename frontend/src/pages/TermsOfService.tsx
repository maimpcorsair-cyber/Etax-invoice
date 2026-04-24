import { useTranslation } from 'react-i18next';
import PublicPageLayout from '../components/PublicPageLayout';

export default function TermsOfService() {
  const { t } = useTranslation();
  const sections = t('legal.terms.sections', { returnObjects: true }) as Array<{
    title: string;
    body: string[];
  }>;

  return (
    <PublicPageLayout
      eyebrow={t('legal.terms.eyebrow')}
      title={t('legal.terms.title')}
      description={t('legal.terms.description')}
    >
      <div className="space-y-8">
        <div className="rounded-2xl border border-green-100 bg-green-50/80 px-5 py-4 text-sm text-green-900">
          {t('legal.terms.summary')}
        </div>

        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-xl font-semibold text-gray-900">{section.title}</h2>
            <div className="space-y-3">
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-sm sm:text-base text-gray-700 leading-7">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PublicPageLayout>
  );
}
