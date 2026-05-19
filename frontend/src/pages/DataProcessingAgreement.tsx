import { useTranslation } from 'react-i18next';
import PublicPageLayout from '../components/PublicPageLayout';

export default function DataProcessingAgreement() {
  const { t } = useTranslation();
  const sections = t('legal.dpa.sections', { returnObjects: true }) as Array<{
    title: string;
    body: string[];
  }>;

  return (
    <PublicPageLayout
      eyebrow={t('legal.dpa.eyebrow')}
      title={t('legal.dpa.title')}
      description={t('legal.dpa.description')}
    >
      <div className="space-y-8">
        <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-5 py-4 text-sm text-amber-900">
          {t('legal.dpa.summary')}
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
