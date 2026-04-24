import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Globe, FileCheck, Zap, ArrowRight, Check, Smartphone, Loader2, CreditCard, ShieldCheck, X, Lock, Users, Send, Files, FileSpreadsheet, ScrollText, QrCode, TicketPercent } from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { getPlanePath } from '../lib/platform';

const features = [
  { icon: FileCheck, key: 'rd' },
  { icon: Globe, key: 'bilingual' },
  { icon: FileText, key: 'pdf' },
  { icon: Zap, key: 'queue' },
];

type PricingPlan = {
  key: 'free' | 'starter' | 'business' | 'enterprise';
  price: string;
  limitTh: string;
  limitEn: string;
  summaryTh: string;
  summaryEn: string;
  popular?: boolean;
  priceEn?: string;
};

const pricingPlans: PricingPlan[] = [
  { key: 'free', price: 'ฟรี', limitTh: 'ทดลอง 10 เอกสาร/เดือน', limitEn: 'Try 10 docs/month', summaryTh: 'สำหรับทดลอง workflow และ preview ก่อนใช้งานจริง', summaryEn: 'Best for evaluating the workflow before going live.', priceEn: 'Free' },
  { key: 'starter', price: '990', limitTh: 'สูงสุด 100 ใบ/เดือน', limitEn: 'Up to 100 docs/month', summaryTh: 'สำหรับธุรกิจเล็กที่ใช้งานจริงคนเดียว', summaryEn: 'Best for solo operators running real invoices.' },
  { key: 'business', price: '2,490', limitTh: 'สูงสุด 500 ใบ/เดือน', limitEn: 'Up to 500 docs/month', summaryTh: 'สำหรับทีมบัญชีที่ต้องทำงานร่วมกันทุกวัน', summaryEn: 'Best for teams that need shared access and controls.', popular: true },
  { key: 'enterprise', price: 'ติดต่อเรา', limitTh: 'ไม่จำกัด', limitEn: 'Unlimited', summaryTh: 'สำหรับองค์กรที่ต้องการโควตาและการตั้งค่าเฉพาะ', summaryEn: 'Best for higher-volume companies with custom requirements.', priceEn: 'Contact us' },
];

function currency(value: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(value);
}

export default function Landing() {
  const { t, i18n } = useTranslation();
  const isThai = i18n.language === 'th';
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'starter' | 'business'>('business');
  const [config, setConfig] = useState<{
    enabled: boolean;
    plans: Array<{ key: string; isConfigured: boolean; purchasable: boolean }>;
    paymentMethods: Array<{ key: 'stripe' | 'stripe_promptpay' | 'promptpay_qr'; enabled: boolean; supportsOnlineConfirmation: boolean; supportsCoupons: boolean }>;
  } | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'stripe_promptpay' | 'promptpay_qr'>('stripe');
  const [couponCode, setCouponCode] = useState('');
  const [signupComplete, setSignupComplete] = useState<null | { plan: 'free'; adminEmail: string }>(null);
  const [checkoutResult, setCheckoutResult] = useState<null | {
      paymentMethod: 'stripe' | 'stripe_promptpay' | 'promptpay_qr';
    reference?: string;
    amountSummary?: {
      subtotalAmount: number;
      discountAmount: number;
      totalAmount: number;
      couponCode?: string | null;
    };
    promptPay?: {
      qrImageDataUrl: string;
      qrPayload: string;
    };
  }>(null);
  const [form, setForm] = useState({
    companyNameTh: '',
    companyNameEn: '',
    taxId: '',
    addressTh: '',
    adminName: '',
    adminEmail: '',
    phone: '',
  });

  const planDetails = useMemo(() => ({
    free: [
      { icon: FileText, available: true, th: 'Preview, PDF และ XML draft', en: 'Preview, PDF, and XML draft' },
      { icon: Files, available: true, th: 'ทดลองได้ 10 เอกสาร/เดือน', en: 'Up to 10 documents per month' },
      { icon: Users, available: false, th: 'ยังไม่รองรับหลายผู้ใช้', en: 'No multi-user access yet' },
      { icon: Send, available: false, th: 'ยังส่งข้อมูลไป RD ไม่ได้', en: 'RD submission is not included' },
    ],
    starter: [
      { icon: Send, available: true, th: 'ส่งข้อมูลไป RD ได้จริง', en: 'Real RD submission included' },
      { icon: ShieldCheck, available: true, th: 'ใช้งาน certificate และ email ได้', en: 'Certificate and email sending included' },
      { icon: Users, available: false, th: '1 ผู้ใช้หลักเท่านั้น', en: 'Single primary user only' },
      { icon: Lock, available: false, th: 'ยังไม่มี audit log / custom template', en: 'No audit logs or custom templates yet' },
    ],
    business: [
      { icon: Users, available: true, th: 'หลายผู้ใช้พร้อม role ภายในทีม', en: 'Multi-user access with internal roles' },
      { icon: ScrollText, available: true, th: 'Audit logs และ document templates', en: 'Audit logs and document templates' },
      { icon: FileSpreadsheet, available: true, th: 'Export Excel และ Google Sheets', en: 'Excel and Google Sheets export' },
      { icon: ShieldCheck, available: true, th: 'เหมาะกับงาน production เต็มรูปแบบ', en: 'Production-ready for day-to-day operations' },
    ],
    enterprise: [
      { icon: Files, available: true, th: 'โควตาเอกสารและผู้ใช้ตามสัญญา', en: 'Custom document and user limits' },
      { icon: ShieldCheck, available: true, th: 'Onboarding และ branding เฉพาะองค์กร', en: 'Custom onboarding and branding support' },
      { icon: Users, available: true, th: 'รองรับทีมใหญ่หรือหลายหน่วยงาน', en: 'Suitable for larger and more complex teams' },
      { icon: CreditCard, available: true, th: 'จัดแพ็กเกจตาม requirement จริง', en: 'Commercial terms tailored to your requirements' },
    ],
  }), []);

  const comparisonRows = useMemo(() => ([
    {
      labelTh: 'สร้างเอกสารและ Preview',
      labelEn: 'Create invoices and preview',
      values: { free: true, starter: true, business: true, enterprise: true },
    },
    {
      labelTh: 'ส่งข้อมูลไปกรมสรรพากร',
      labelEn: 'Submit to Revenue Department',
      values: { free: false, starter: true, business: true, enterprise: true },
    },
    {
      labelTh: 'หลายผู้ใช้ในบริษัทเดียวกัน',
      labelEn: 'Multi-user access in one company',
      values: { free: false, starter: false, business: 'สูงสุด 5', enterprise: 'ตามสัญญา' },
    },
    {
      labelTh: 'Export และ Audit Logs',
      labelEn: 'Export and audit logs',
      values: { free: false, starter: false, business: true, enterprise: true },
    },
    {
      labelTh: 'Document Templates แบบกำหนดเอง',
      labelEn: 'Custom document templates',
      values: { free: false, starter: false, business: true, enterprise: true },
    },
  ]), []);

  useEffect(() => {
    let active = true;
    async function loadBillingConfig() {
      try {
        const res = await fetch('/api/billing/config');
        const json = await res.json() as typeof config;
        if (active) setConfig(json);
      } catch {
        if (active) setConfig(null);
      } finally {
        if (active) setConfigLoading(false);
      }
    }
    loadBillingConfig();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!checkoutOpen) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        setCheckoutOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [checkoutOpen, submitting]);

  const purchasablePlans = new Set(
    (config?.plans ?? [])
      .filter((plan) => plan.purchasable && plan.isConfigured)
      .map((plan) => plan.key),
  );
  const selectedPlanMeta = pricingPlans.find((plan) => plan.key === selectedPlan);

  async function handleCheckout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    setCheckoutResult(null);

    try {
      const isFreeSignup = selectedPlan === 'free';
      const res = await fetch(isFreeSignup ? '/api/billing/free-signup' : '/api/billing/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...(isFreeSignup ? {} : { plan: selectedPlan, paymentMethod, couponCode }),
          locale: isThai ? 'th' : 'en',
        }),
      });

      const json = await res.json() as {
        data?: {
          url?: string;
          paymentMethod?: 'stripe' | 'stripe_promptpay' | 'promptpay_qr';
          reference?: string;
          amountSummary?: {
            subtotalAmount: number;
            discountAmount: number;
            totalAmount: number;
            couponCode?: string | null;
          };
          promptPay?: {
            qrImageDataUrl: string;
            qrPayload: string;
          };
        };
        error?: string;
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? 'Unable to start checkout');
      }

      if (isFreeSignup) {
        setSignupComplete({ plan: 'free', adminEmail: form.adminEmail });
      } else if (json.data.paymentMethod === 'promptpay_qr' && json.data.promptPay) {
        setCheckoutResult({
          paymentMethod: 'promptpay_qr',
          reference: json.data.reference,
          amountSummary: json.data.amountSummary,
          promptPay: json.data.promptPay,
        });
      } else if (json.data.url) {
        window.location.href = json.data.url;
      } else {
        throw new Error('Missing checkout URL');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function openCheckout(plan: 'free' | 'starter' | 'business') {
    setSelectedPlan(plan);
    setError('');
    setCheckoutResult(null);
    setSignupComplete(null);
    setCheckoutOpen(true);
  }

  function closeCheckout() {
    if (submitting) return;
    setCheckoutOpen(false);
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)]">
      {/* Header */}
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-gray-100/50 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
              <FileText className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-lg text-gray-900 group-hover:text-primary-600 transition-colors">{t('app.shortName')}</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="toggle" />
            <a href={getPlanePath('/login', 'app')} className="btn-secondary sm">
              {t('auth.login')}
            </a>
            <a href={getPlanePath('/login', 'ops')} className="hidden rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 sm:inline-flex">
              {isThai ? 'Owner Login' : 'Owner Login'}
            </a>
            <button type="button" onClick={() => openCheckout('free')} className="btn-primary sm hidden sm:flex">
              {t('landing.hero.cta')}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-24 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.06),transparent_30%)]" />

        <div className="max-w-6xl mx-auto px-4">
          <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-primary-700 mb-8 shadow-sm">
            <FileCheck className="w-4 h-4 flex-shrink-0" />
            <span>{isThai ? '🇹🇭 มาตรฐาน e-Tax Invoice v2.0' : '🇹🇭 e-Tax Invoice v2.0 Compliant'}</span>
          </div>

              <h1 className="max-w-4xl text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl leading-tight mb-6">
                {t('landing.hero.title')}
              </h1>

              <p className="max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl mb-10">
                {t('landing.hero.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <button type="button" onClick={() => openCheckout('free')} className="btn-primary lg">
                  {t('landing.hero.cta')}
                  <ArrowRight className="w-5 h-5" />
                </button>
                <a href="#pricing-checkout" className="btn-secondary lg">
                  {isThai ? 'ดูแพ็กเกจและวิธีชำระเงิน' : 'View plans and payment options'}
                  <Smartphone className="w-5 h-5" />
                </a>
              </div>

              <p className="text-sm font-medium text-slate-500">{t('landing.hero.trustText')}</p>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{isThai ? 'เหมาะกับ' : 'Best for'}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{isThai ? 'ทีมบัญชีและธุรกิจ SME' : 'Accounting teams and SME operators'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{isThai ? 'รองรับ' : 'Supports'}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{isThai ? 'RD submit, PDF, XML, audit logs' : 'RD submit, PDF, XML, and audit logs'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{isThai ? 'ชำระเงิน' : 'Payments'}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{isThai ? 'บัตรเครดิต, Stripe PromptPay, QR' : 'Card, Stripe PromptPay, and QR'}</div>
                </div>
              </div>
            </div>

            <aside className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{isThai ? 'Operational Snapshot' : 'Operational Snapshot'}</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">{isThai ? 'ระบบที่พร้อมใช้งานจริง' : 'Built for real operations'}</h2>
                </div>
                <div className="rounded-2xl bg-slate-900 p-3 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{isThai ? 'Owner Control Plane' : 'Owner Control Plane'}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {isThai
                      ? 'เจ้าของระบบดูรายได้, subscription, coupon, renewals, และธุรกรรมทุกช่องทางได้จากหน้าเดียว'
                      : 'Owners can monitor revenue, subscriptions, coupons, renewals, and transactions from one control surface.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{isThai ? 'Tenant Isolation' : 'Tenant Isolation'}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {isThai
                      ? 'ข้อมูลแต่ละบริษัทถูกแยกด้วย role + domain split + PostgreSQL RLS'
                      : 'Each company is isolated with role checks, domain split, and PostgreSQL RLS.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{isThai ? 'Workflow' : 'Workflow'}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {isThai
                      ? 'สร้างเอกสาร, sign XML, timestamp, ส่ง RD, และติดตามสถานะแบบครบ flow'
                      : 'Create documents, sign XML, timestamp, submit to RD, and track status end-to-end.'}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 max-w-6xl mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            {t('landing.features.title')}
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            {isThai ? 'ระบบที่สมบูรณ์สำหรับการออกใบกำกับภาษีอิเล็กทรอนิกส์' : 'Everything you need for seamless e-Invoice management'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map(({ icon: Icon, key }) => (
            <div
              key={key}
              className="group rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-primary-700">
                <Icon className="w-6 h-6 text-primary-600" strokeWidth={2} />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2 text-lg">
                {t(`landing.features.${key}.title`)}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {t(`landing.features.${key}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing-checkout" className="py-24 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_30%)]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {isThai ? 'แพ็กเกจราคา' : 'Simple, Transparent Pricing'}
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              {isThai ? 'เลือกแพ็กเกจที่เหมาะสมกับธุรกิจของคุณ' : 'Choose the perfect plan for your business'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
            {pricingPlans.map((plan) => (
              <div
                key={plan.key}
                className={`relative flex h-full flex-col rounded-[28px] border bg-white p-6 shadow-sm transition-all duration-300 ${
                  plan.popular
                    ? 'md:scale-105 border-primary-300 ring-2 ring-primary-500 ring-offset-2 shadow-xl'
                    : 'border-slate-200 hover:shadow-md'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-full shadow-lg">
                      ⭐ {isThai ? 'ยอดนิยม' : 'MOST POPULAR'}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="font-bold text-xl text-gray-900 capitalize mb-2">{plan.key}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-primary-600">
                      ฿{isThai ? plan.price : (plan.priceEn ?? plan.price)}
                    </span>
                    {plan.key !== 'enterprise' && (
                      <span className="text-base font-semibold text-gray-500">
                        /{isThai ? 'เดือน' : 'month'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-3 font-medium">
                    {isThai ? plan.limitTh : plan.limitEn}
                  </p>
                  <p className="text-sm text-gray-500 mt-2 leading-6">
                    {isThai ? plan.summaryTh : plan.summaryEn}
                  </p>
                </div>

                <div className="flex-1">
                  <ul className="space-y-3.5 mb-8">
                    {planDetails[plan.key].map(({ icon: Icon, available, th, en }, index) => (
                      <li key={`${plan.key}-${index}`} className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0 ${
                          available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                        }`}>
                          <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
                        </div>
                        <span className={`text-sm font-medium leading-6 ${available ? 'text-gray-700' : 'text-gray-400'}`}>
                          {isThai ? th : en}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {plan.key === 'free' ? (
                  <button
                    type="button"
                    onClick={() => openCheckout('free')}
                    className="w-full justify-center font-semibold btn-secondary lg"
                  >
                    {isThai ? 'เริ่มใช้ฟรี' : 'Start free'}
                  </button>
                ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (plan.key === 'starter' || plan.key === 'business') {
                      openCheckout(plan.key);
                    }
                  }}
                  className={`w-full justify-center font-semibold ${
                    plan.popular ? 'btn-primary lg' : 'btn-secondary lg'
                  }`}
                >
                  {plan.key === 'enterprise'
                    ? (isThai ? 'ติดต่อฝ่ายขาย' : 'Contact Sales')
                    : (isThai ? 'จ่ายเงินและเริ่มใช้งาน' : 'Pay & Start')}
                </button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-10 overflow-x-auto rounded-[28px] border border-gray-200 bg-white shadow-sm">
            <div className="grid min-w-[860px] grid-cols-[1.25fr_repeat(4,minmax(0,1fr))] border-b border-gray-200 bg-gray-50/80">
              <div className="px-5 py-4 text-sm font-semibold text-gray-900">
                {isThai ? 'เปรียบเทียบสิทธิ์การใช้งาน' : 'Feature comparison'}
              </div>
              {pricingPlans.map((plan) => (
                <div key={`head-${plan.key}`} className="px-4 py-4 text-center text-sm font-semibold text-gray-700 capitalize">
                  {plan.key}
                </div>
              ))}
            </div>
            {comparisonRows.map((row) => (
              <div key={row.labelEn} className="grid min-w-[860px] grid-cols-[1.25fr_repeat(4,minmax(0,1fr))] border-b border-gray-100 last:border-b-0">
                <div className="px-5 py-4 text-sm text-gray-700">
                  {isThai ? row.labelTh : row.labelEn}
                </div>
                {pricingPlans.map((plan) => {
                  const value = row.values[plan.key];
                  return (
                    <div key={`${row.labelEn}-${plan.key}`} className="px-4 py-4 text-center text-sm text-gray-700">
                      {value === true && <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-green-700"><Check className="w-3.5 h-3.5" />{isThai ? 'มี' : 'Included'}</span>}
                      {value === false && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-gray-500"><Lock className="w-3.5 h-3.5" />{isThai ? 'ไม่มี' : 'Not included'}</span>}
                      {typeof value === 'string' && <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-primary-700">{value}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-slate-900 relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {isThai ? 'พร้อมเริ่มต้นหรือยัง?' : 'Ready to get started?'}
          </h2>
          <p className="text-primary-100 mb-8 text-lg max-w-2xl mx-auto">
            {isThai
              ? 'เข้าร่วมระบบ e-Tax Invoice ที่มีความปลอดภัยและเชื่อถือได้'
              : 'Join thousands of businesses using our secure and reliable e-Invoice system'}
          </p>
          <button type="button" onClick={() => openCheckout('free')} className="inline-flex btn-primary lg bg-white text-slate-900 hover:bg-slate-50">
            {t('landing.hero.cta')}
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50/50 py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-primary-600" />
                <span className="font-bold text-gray-900">{t('app.shortName')}</span>
              </div>
              <p className="text-sm text-gray-600">
                {isThai ? 'ระบบใบกำกับภาษีอิเล็กทรอนิกส์ที่ปลอดภัยและเชื่อถือได้' : 'Secure and reliable e-Tax Invoice system'}
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">{isThai ? 'ผลิตภัณฑ์' : 'Product'}</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="#features" className="hover:text-primary-600 transition-colors">{isThai ? 'คุณสมบัติ' : 'Features'}</a></li>
                <li><a href="#pricing-checkout" className="hover:text-primary-600 transition-colors">{isThai ? 'ราคา' : 'Pricing'}</a></li>
                <li><Link to="/privacy" className="hover:text-primary-600 transition-colors">{isThai ? 'ความเป็นส่วนตัว' : 'Privacy'}</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">{isThai ? 'บริษัท' : 'Company'}</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link to="/terms" className="hover:text-primary-600 transition-colors">{isThai ? 'ข้อกำหนดการใช้งาน' : 'Terms of Service'}</Link></li>
                <li><Link to="/contact" className="hover:text-primary-600 transition-colors">{isThai ? 'ติดต่อเรา' : 'Contact'}</Link></li>
                <li><Link to="/privacy" className="hover:text-primary-600 transition-colors">{isThai ? 'ข้อมูลส่วนบุคคล' : 'Privacy Policy'}</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">{isThai ? 'กฎหมาย' : 'Legal'}</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link to="/privacy" className="hover:text-primary-600 transition-colors">{isThai ? 'นโยบายความเป็นส่วนตัว' : 'Privacy'}</Link></li>
                <li><Link to="/terms" className="hover:text-primary-600 transition-colors">{isThai ? 'เงื่อนไข' : 'Terms'}</Link></li>
                <li><Link to="/contact" className="hover:text-primary-600 transition-colors">{isThai ? 'ช่องทางติดต่อ' : 'Contact'}</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-8 text-center text-sm text-gray-600">
            <p>© {new Date().getFullYear()} {t('app.name')} • {isThai ? '✓ ตามมาตรฐานกรมสรรพากร' : '✓ Thailand Revenue Department Compliant'}</p>
          </div>
        </div>
      </footer>

      {checkoutOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 sm:py-12">
          <div className="absolute inset-0" onClick={closeCheckout} />
          <div className="relative w-full max-w-5xl rounded-[28px] bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 sm:px-8">
              <div>
                <p className="text-sm font-semibold text-primary-700 mb-2">
                  {selectedPlan === 'free'
                    ? (isThai ? 'สมัครใช้งานฟรี' : 'Start your free workspace')
                    : (isThai ? 'สมัครใช้งานและชำระเงินออนไลน์' : 'Subscribe and pay online')}
                </p>
                <h3 className="text-2xl font-bold text-gray-900">
                  {isThai ? 'เปิดบริษัทใหม่และเริ่มใช้งานระบบ' : 'Create your company and start operating'}
                </h3>
                <p className="text-sm text-gray-600 mt-2 max-w-2xl">
                  {selectedPlan === 'free'
                    ? (isThai
                      ? 'ระบบจะเปิดบริษัทและบัญชีผู้ดูแลแพ็กเกจ Free ให้ทันที จากนั้นเข้าสู่ระบบด้วย Google อีเมลเดียวกัน'
                      : 'We will create a Free workspace and admin account immediately. Then sign in with the same Google email.')
                    : isThai
                    ? 'หลังชำระสำเร็จ ระบบจะเปิดบริษัทและบัญชีผู้ดูแลให้ทันที โดยใช้อีเมล Google เดียวกับที่สมัคร'
                    : 'After payment succeeds, we provision your company and admin account automatically for the same Google email.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCheckout}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                aria-label={isThai ? 'ปิดหน้าต่าง' : 'Close dialog'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-0 items-start">
              <div className="p-6 sm:p-8">
                <div className="mb-6 flex flex-wrap items-center gap-2 rounded-full bg-slate-100 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 w-fit">
                  <ShieldCheck className="w-4 h-4" />
                  {isThai ? 'Secure Checkout' : 'Secure Checkout'}
                </div>

                <div className="mb-6 rounded-2xl border border-primary-100 bg-primary-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-primary-700">
                        {isThai ? 'แพ็กเกจที่เลือก' : 'Selected plan'}
                      </p>
                      <p className="mt-1 text-xl font-bold text-gray-900 capitalize">{selectedPlanMeta?.key}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary-700">
                        ฿{isThai ? selectedPlanMeta?.price : selectedPlanMeta?.priceEn ?? selectedPlanMeta?.price}
                      </p>
                      <p className="text-xs text-gray-500">/{isThai ? 'เดือน' : 'month'}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">
                    {isThai ? selectedPlanMeta?.summaryTh : selectedPlanMeta?.summaryEn}
                  </p>
                </div>

                <form className="space-y-4" onSubmit={handleCheckout}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(['free', 'starter', 'business'] as const).map((planKey) => {
                      const plan = pricingPlans.find((item) => item.key === planKey)!;
                      const isSelected = selectedPlan === planKey;
                      const isAvailable = planKey === 'free' || configLoading || purchasablePlans.has(planKey);
                      return (
                        <button
                          key={planKey}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => setSelectedPlan(planKey)}
                          className={`rounded-2xl border p-4 text-left transition-all ${
                            isSelected
                              ? 'border-primary-500 bg-primary-50 shadow-md'
                              : 'border-gray-200 bg-white hover:border-primary-200'
                          } ${!isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="font-semibold text-gray-900 capitalize">{plan.key}</span>
                            {plan.popular && (
                              <span className="rounded-full bg-primary-600 px-2.5 py-1 text-[11px] font-bold text-white">
                                {isThai ? 'ยอดนิยม' : 'Popular'}
                              </span>
                            )}
                          </div>
                          <div className="text-2xl font-bold text-primary-700">
                            ฿{isThai ? plan.price : (plan.priceEn ?? plan.price)}
                            <span className="ml-1 text-sm font-medium text-gray-500">/{isThai ? 'เดือน' : 'month'}</span>
                          </div>
                          <p className="mt-2 text-sm text-gray-600">{isThai ? plan.limitTh : plan.limitEn}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedPlan !== 'free' && (
                    <div className="sm:col-span-2">
                      <label className="label">{isThai ? 'วิธีชำระเงิน' : 'Payment method'}</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(config?.paymentMethods ?? []).map((method) => (
                          <button
                            key={method.key}
                            type="button"
                            disabled={!method.enabled}
                            onClick={() => setPaymentMethod(method.key)}
                            className={`rounded-2xl border p-4 text-left transition-all ${
                              paymentMethod === method.key
                                ? 'border-primary-500 bg-primary-50 shadow-md'
                                : 'border-gray-200 bg-white hover:border-primary-200'
                            } ${!method.enabled ? 'cursor-not-allowed opacity-50' : ''}`}
                          >
                            <div className="flex items-center gap-2 font-semibold text-gray-900">
                              {method.key === 'stripe' ? <CreditCard className="h-4 w-4 text-primary-700" /> : <QrCode className="h-4 w-4 text-emerald-700" />}
                              {method.key === 'stripe' ? 'Stripe / Card' : method.key === 'stripe_promptpay' ? 'Stripe PromptPay' : 'Manual PromptPay QR'}
                            </div>
                            <p className="mt-2 text-sm text-gray-600">
                              {method.key === 'stripe'
                                ? (isThai ? 'ชำระออนไลน์และยืนยันอัตโนมัติ' : 'Online card checkout with automatic confirmation')
                                : method.key === 'stripe_promptpay'
                                  ? (isThai ? 'สแกน PromptPay ผ่าน Stripe แล้วเปิดใช้งานอัตโนมัติ' : 'Scan PromptPay through Stripe and activate automatically')
                                  : (isThai ? 'สร้าง QR ให้ลูกค้าจ่าย แล้ว owner ค่อยกดยืนยันเปิดใช้งาน' : 'Generate a QR code, then let the owner approve activation')}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                    )}
                    {selectedPlan !== 'free' && (
                    <div className="sm:col-span-2">
                      <label className="label">{isThai ? 'Coupon Code' : 'Coupon Code'}</label>
                      <div className="relative">
                        <TicketPercent className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input className="input-field pl-10" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder={isThai ? 'เช่น LAUNCH20' : 'e.g. LAUNCH20'} />
                      </div>
                    </div>
                    )}
                    <div>
                      <label className="label">{isThai ? 'ชื่อบริษัท (ไทย)' : 'Company Name (Thai)'}</label>
                      <input className="input-field" value={form.companyNameTh} onChange={(e) => setForm((prev) => ({ ...prev, companyNameTh: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="label">{isThai ? 'ชื่อบริษัท (อังกฤษ)' : 'Company Name (English)'}</label>
                      <input className="input-field" value={form.companyNameEn} onChange={(e) => setForm((prev) => ({ ...prev, companyNameEn: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">{isThai ? 'เลขประจำตัวผู้เสียภาษี 13 หลัก' : '13-digit Tax ID'}</label>
                      <input className="input-field" value={form.taxId} onChange={(e) => setForm((prev) => ({ ...prev, taxId: e.target.value.replace(/\D/g, '').slice(0, 13) }))} required />
                    </div>
                    <div>
                      <label className="label">{isThai ? 'เบอร์โทรติดต่อ' : 'Phone Number'}</label>
                      <input className="input-field" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">{isThai ? 'ชื่อผู้ดูแลระบบ' : 'Admin Name'}</label>
                      <input className="input-field" value={form.adminName} onChange={(e) => setForm((prev) => ({ ...prev, adminName: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="label">{isThai ? 'อีเมล Google ของผู้ดูแล' : 'Admin Google Email'}</label>
                      <input className="input-field" type="email" value={form.adminEmail} onChange={(e) => setForm((prev) => ({ ...prev, adminEmail: e.target.value }))} required />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">{isThai ? 'ที่อยู่บริษัท (ไทย)' : 'Company Address (Thai)'}</label>
                      <textarea className="input-field min-h-[96px]" value={form.addressTh} onChange={(e) => setForm((prev) => ({ ...prev, addressTh: e.target.value }))} required />
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  {signupComplete && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      {isThai
                        ? `สร้างบัญชี Free ให้ ${signupComplete.adminEmail} แล้ว สามารถเข้าสู่ระบบด้วย Google ได้ทันที`
                        : `Free account created for ${signupComplete.adminEmail}. You can now sign in with Google.`}
                    </div>
                  )}

                  {selectedPlan !== 'free' && !configLoading && !config?.enabled && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {isThai
                        ? 'ระบบรับชำระออนไลน์ยังไม่ถูกตั้งค่าในเครื่องนี้ กรุณาใส่ Stripe หรือ PromptPay config ก่อน'
                        : 'No online payment method is configured yet. Add Stripe and/or PromptPay config first.'}
                    </div>
                  )}

                  {checkoutResult?.paymentMethod === 'promptpay_qr' && checkoutResult.promptPay && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-gray-900">
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                        <QrCode className="h-4 w-4" />
                        {isThai ? 'PromptPay QR พร้อมชำระ' : 'PromptPay QR ready'}
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
                        <img src={checkoutResult.promptPay.qrImageDataUrl} alt="PromptPay QR" className="w-full max-w-[220px] rounded-2xl border border-emerald-200 bg-white p-3" />
                        <div className="space-y-2 text-sm">
                          <p><span className="font-semibold">{isThai ? 'Reference:' : 'Reference:'}</span> {checkoutResult.reference}</p>
                          <p><span className="font-semibold">{isThai ? 'ยอดก่อนส่วนลด:' : 'Subtotal:'}</span> {currency(checkoutResult.amountSummary?.subtotalAmount ?? 0)}</p>
                          <p><span className="font-semibold">{isThai ? 'ส่วนลด:' : 'Discount:'}</span> {currency(checkoutResult.amountSummary?.discountAmount ?? 0)}</p>
                          <p><span className="font-semibold">{isThai ? 'ยอดสุทธิ:' : 'Net amount:'}</span> {currency(checkoutResult.amountSummary?.totalAmount ?? 0)}</p>
                          <p className="text-emerald-800">
                            {isThai
                              ? 'หลังลูกค้าชำระแล้ว Owner สามารถเข้า Owner Control Plane เพื่อกดยืนยันและเปิด tenant ได้ทันที'
                              : 'After payment, the owner can approve the transaction in Owner Control Plane and activate the tenant immediately.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !!signupComplete || (selectedPlan !== 'free' && (configLoading || !config?.enabled))}
                    className="btn-primary lg w-full justify-center"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : selectedPlan === 'free' ? <ArrowRight className="w-5 h-5" /> : paymentMethod === 'stripe' ? <CreditCard className="w-5 h-5" /> : <QrCode className="w-5 h-5" />}
                    {selectedPlan === 'free'
                      ? (isThai ? 'สร้างบัญชี Free' : 'Create free account')
                      : paymentMethod === 'stripe'
                      ? (isThai ? 'ไปหน้าชำระเงินด้วยบัตรเครดิต' : 'Continue to secure card checkout')
                      : paymentMethod === 'stripe_promptpay'
                        ? (isThai ? 'ไปหน้าชำระเงิน PromptPay ของ Stripe' : 'Continue to Stripe PromptPay checkout')
                        : (isThai ? 'สร้าง PromptPay QR' : 'Generate PromptPay QR')}
                  </button>
                  {signupComplete && (
                    <a href={getPlanePath('/login', 'app')} className="btn-secondary lg w-full justify-center">
                      {isThai ? 'ไปหน้า Login' : 'Go to login'}
                    </a>
                  )}
                </form>
              </div>

              <div className="border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-900 px-6 py-6 sm:px-8 sm:py-8 text-white">
                <p className="text-xs uppercase tracking-[0.18em] text-primary-200 mb-3">
                  {isThai ? 'หลังชำระสำเร็จ' : 'After payment succeeds'}
                </p>
                <ul className="space-y-3 text-sm text-gray-200">
                  <li className="flex gap-3"><Check className="w-4 h-4 mt-0.5 text-green-400" />{isThai ? 'สร้างบริษัทในระบบให้อัตโนมัติ' : 'Automatically creates your company profile'}</li>
                  <li className="flex gap-3"><Check className="w-4 h-4 mt-0.5 text-green-400" />{isThai ? 'สร้างบัญชีผู้ดูแลจากอีเมล Google ที่สมัคร' : 'Creates your admin account from the Google email used during checkout'}</li>
                  <li className="flex gap-3"><Check className="w-4 h-4 mt-0.5 text-green-400" />{selectedPlan === 'free' ? (isThai ? 'ใช้ฟรี 10 เอกสาร/เดือน' : 'Free access with 10 documents per month') : (isThai ? 'เปิดสิทธิ์แพ็กเกจและบันทึกสถานะสมาชิก' : 'Activates your plan and stores subscription status')}</li>
                  <li className="flex gap-3"><Check className="w-4 h-4 mt-0.5 text-green-400" />{isThai ? 'เข้าใช้ต่อด้วย Continue with Google ได้ทันที' : 'Lets you continue with Google right away'}</li>
                </ul>

                {selectedPlan !== 'free' && (
                <div className="mt-8 rounded-2xl bg-white/8 border border-white/10 p-4">
                  <h4 className="font-semibold text-white mb-3">
                    {isThai ? 'การตั้งค่าที่ต้องมีใน Stripe' : 'Stripe setup checklist'}
                  </h4>
                  <ul className="space-y-2 text-sm text-gray-300">
                    <li>{isThai ? 'สร้าง Product/Price สำหรับ Starter รายเดือน' : 'Create a monthly Product/Price for Starter'}</li>
                    <li>{isThai ? 'สร้าง Product/Price สำหรับ Business รายเดือน' : 'Create a monthly Product/Price for Business'}</li>
                    <li>{isThai ? 'ตั้ง webhook ไปที่ /api/billing/stripe/webhook' : 'Register a webhook for /api/billing/stripe/webhook'}</li>
                    <li>{isThai ? 'เปิด Customer Portal ถ้าต้องการให้ลูกค้าจัดการบัตรเอง' : 'Enable Customer Portal if you want self-service billing management'}</li>
                  </ul>
                </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
