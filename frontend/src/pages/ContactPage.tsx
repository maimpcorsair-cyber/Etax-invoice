import { Mail, Phone, CreditCard, LifeBuoy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PublicPageLayout from '../components/PublicPageLayout';

export default function ContactPage() {
  const { t } = useTranslation();
  const channels = t('legal.contact.channels', { returnObjects: true }) as Array<{
    icon: 'mail' | 'phone';
    label: string;
    value: string;
    href: string;
  }>;
  const supportTopics = t('legal.contact.supportTopics', { returnObjects: true }) as string[];

  const iconMap = {
    mail: Mail,
    phone: Phone,
  };

  return (
    <PublicPageLayout
      eyebrow={t('legal.contact.eyebrow')}
      title={t('legal.contact.title')}
      description={t('legal.contact.description')}
    >
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels.map((channel) => {
            const Icon = iconMap[channel.icon];

            return (
              <a
                key={channel.label}
                href={channel.href}
                className="rounded-2xl border border-gray-200 bg-white px-5 py-5 hover:border-primary-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-500">{channel.label}</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{channel.value}</p>
                  </div>
                </div>
              </a>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-5 py-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
                <LifeBuoy className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">{t('legal.contact.supportTitle')}</h2>
            </div>
            <p className="text-sm text-gray-700 leading-7">{t('legal.contact.supportDescription')}</p>
          </div>

          <div className="rounded-2xl border border-green-100 bg-green-50/80 px-5 py-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-green-700 shadow-sm">
                <CreditCard className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">{t('legal.contact.billingTitle')}</h2>
            </div>
            <ul className="space-y-2">
              {supportTopics.map((topic) => (
                <li key={topic} className="text-sm text-gray-700 leading-7">
                  {topic}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </PublicPageLayout>
  );
}
