import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Globe, FileCheck, Zap, ArrowRight, Check, Smartphone, Loader2, CreditCard, ShieldCheck, X, Lock, Users, Send, Files, FileSpreadsheet, ScrollText, QrCode, TicketPercent } from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { buildPlaneUrl, getPlanePath } from '../lib/platform';
import { digitsOnly, englishTextOnly, guardedInputClass, inputGuide, isEnglishText, isThaiText, isThirteenDigitId, thaiTextOnly } from '../lib/inputGuards';
import { useAuthStore } from '../store/authStore';

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
  { key: 'free', price: 'ฟรี', limitTh: 'ทดลอง 20 เอกสาร/เดือน', limitEn: 'Try 20 docs/month', summaryTh: 'สำหรับทดลองอ่านเอกสาร ออก draft และดู workflow ก่อนใช้งานจริง', summaryEn: 'Best for testing document intake, drafts, and the workflow before going live.', priceEn: 'Free' },
  { key: 'starter', price: '790', limitTh: 'สูงสุด 150 ใบ/เดือน', limitEn: 'Up to 150 docs/month', summaryTh: 'สำหรับเจ้าของธุรกิจที่ต้องอ่านบิล เก็บหลักฐาน และออก e-Tax จริง', summaryEn: 'Best for owner-led businesses that need OCR, evidence, and real e-Tax.' },
  { key: 'business', price: '1,990', limitTh: 'สูงสุด 800 ใบ/เดือน', limitEn: 'Up to 800 docs/month', summaryTh: 'สำหรับทีมบัญชีที่ต้องตรวจเอกสาร ซื้อ-ขาย ส่ง RD และ export ทุกเดือน', summaryEn: 'Best for accounting teams handling purchases, sales, RD submission, and exports.', popular: true },
  { key: 'enterprise', price: 'ติดต่อเรา', limitTh: 'ไม่จำกัด + SLA', limitEn: 'Unlimited + SLA', summaryTh: 'สำหรับองค์กรที่ต้องการโควตา โมเดลตรวจเอกสาร และ workflow เฉพาะ', summaryEn: 'Best for high-volume companies with custom verification and workflow needs.', priceEn: 'Contact us' },
];

const documentOpsPillars = [
  {
    icon: FileCheck,
    th: 'AI อ่านเอกสารก่อนบันทึก',
    en: 'AI reads before posting',
    descTh: 'PDF text, รูปถ่าย, สลิปธนาคาร, ใบเสร็จ, บิลเงินสด, ทางด่วน และเอกสารค่าใช้จ่ายไทย/อังกฤษ ถูกแยกประเภทก่อนเข้าระบบ',
    descEn: 'PDF text, photos, bank slips, receipts, cash bills, toll receipts, and Thai/English expense documents are classified before posting.',
  },
  {
    icon: ShieldCheck,
    th: 'ตรวจซ้ำด้วยกฎบัญชี',
    en: 'Accounting rule checks',
    descTh: 'ตรวจ VAT 7%, เลขผู้เสียภาษี, วันที่, ยอดรวม, เอกสารซ้ำ และช่องที่ขาด แล้วให้ผู้ใช้ยืนยันก่อนบันทึก',
    descEn: 'Checks VAT, tax IDs, dates, totals, duplicates, and missing fields before users confirm.',
  },
  {
    icon: Send,
    th: 'ต่อยอดถึง e-Tax และ RD',
    en: 'Extends to e-Tax and RD',
    descTh: 'ไม่ได้หยุดแค่เก็บค่าใช้จ่าย แต่เชื่อมกับการออกใบกำกับภาษี XML, ลงลายเซ็น, timestamp และส่งกรมสรรพากร',
    descEn: 'Goes beyond expense capture with XML e-Tax, signing, timestamping, and Revenue Department submission.',
  },
  {
    icon: FileSpreadsheet,
    th: 'พร้อมส่งสำนักงานบัญชี',
    en: 'Accountant-ready exports',
    descTh: 'เก็บไฟล์แนบเป็นคลังเอกสาร แยกที่มาจาก LINE/เว็บ และ export เป็น Excel, Google Sheets หรือ Drive folder',
    descEn: 'Keeps an evidence library, tracks LINE/web sources, and exports to Excel, Google Sheets, or Drive folders.',
  },
];

const marketingArticles = [
  {
    th: 'ลดงานคีย์ใบเสร็จปลายเดือน',
    en: 'Cut month-end receipt entry',
    bodyTh: 'ให้ทีมโยนเอกสารเข้าระบบทุกวัน AI อ่านและจัดหมวดทันที สิ้นเดือนเหลือแค่ตรวจรายการที่มั่นใจต่ำ',
    bodyEn: 'Let the team drop documents daily. AI reads and categorizes them, leaving low-confidence items for month-end review.',
  },
  {
    th: 'สลิปธนาคารควรถูกบันทึกคู่กับเอกสาร',
    en: 'Bank slips should attach to records',
    bodyTh: 'สลิปโอนเงินช่วยยืนยันการจ่าย แต่ต้องผูกกับใบซื้อหรือใบสำคัญจ่าย เพื่อให้ตรวจย้อนหลังได้ครบ',
    bodyEn: 'Transfer slips prove payment, but they should attach to purchase documents or payment vouchers for audit trails.',
  },
  {
    th: 'เว็บแชท AI ลดต้นทุน LINE quota',
    en: 'Web AI chat avoids LINE quota burn',
    bodyTh: 'คำถามวิเคราะห์ข้อมูลให้คุยในเว็บ ส่วน LINE ใช้กับงานรับเอกสารและแจ้งเตือนสำคัญ เพื่อลดต้นทุนข้อความ',
    bodyEn: 'Use web chat for data analysis and reserve LINE for document intake and important notifications.',
  },
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
  const { setAuth } = useAuthStore();
  const googleSignupRef = useRef<HTMLDivElement | null>(null);
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
  const [googleCredential, setGoogleCredential] = useState('');
  const [googleSignupReady, setGoogleSignupReady] = useState(false);
  const [googleConfig, setGoogleConfig] = useState<null | { enabled: boolean; clientId: string | null }>(null);
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
      { icon: Files, available: true, th: 'ทดลองได้ 20 เอกสาร/เดือน', en: 'Up to 20 documents per month' },
      { icon: FileCheck, available: true, th: 'AI อ่านเอกสารผ่านเว็บแบบทดลอง', en: 'Trial web AI document intake' },
      { icon: Users, available: false, th: 'ยังไม่รองรับหลายผู้ใช้', en: 'No multi-user access yet' },
      { icon: Send, available: false, th: 'ยังส่งข้อมูลไป RD ไม่ได้', en: 'RD submission is not included' },
    ],
    starter: [
      { icon: Send, available: true, th: 'ส่งข้อมูลไป RD ได้จริง', en: 'Real RD submission included' },
      { icon: FileCheck, available: true, th: 'อ่านเอกสารเว็บ/LINE พร้อมรอยืนยัน', en: 'Web/LINE AI intake with review queue' },
      { icon: ShieldCheck, available: true, th: 'Certificate, email และ Excel export', en: 'Certificate, email, and Excel export' },
      { icon: Users, available: true, th: 'สูงสุด 3 ผู้ใช้', en: 'Up to 3 users' },
    ],
    business: [
      { icon: Users, available: true, th: 'สูงสุด 8 ผู้ใช้พร้อม role ภายในทีม', en: 'Up to 8 users with internal roles' },
      { icon: ScrollText, available: true, th: 'Audit logs, template และ status เอกสาร', en: 'Audit logs, templates, and document statuses' },
      { icon: FileSpreadsheet, available: true, th: 'Excel, Google Sheets และ Drive workflow', en: 'Excel, Google Sheets, and Drive workflow' },
      { icon: ShieldCheck, available: true, th: 'เหมาะกับงาน production ซื้อ-ขายเต็มรูปแบบ', en: 'Production-ready for purchase and sales operations' },
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
      labelTh: 'AI อ่านเอกสารซื้อ/สลิป/ใบเสร็จ',
      labelEn: 'AI purchase, slip, and receipt intake',
      values: { free: { th: 'เว็บทดลอง', en: 'Web trial' }, starter: { th: 'เว็บ + LINE', en: 'Web + LINE' }, business: { th: 'เว็บ + LINE + queue', en: 'Web + LINE + queue' }, enterprise: { th: 'กำหนดเอง', en: 'Custom' } },
    },
    {
      labelTh: 'ส่งข้อมูลไปกรมสรรพากร',
      labelEn: 'Submit to Revenue Department',
      values: { free: false, starter: true, business: true, enterprise: true },
    },
    {
      labelTh: 'หลายผู้ใช้ในบริษัทเดียวกัน',
      labelEn: 'Multi-user access in one company',
      values: { free: false, starter: { th: 'สูงสุด 3', en: 'Up to 3' }, business: { th: 'สูงสุด 8', en: 'Up to 8' }, enterprise: { th: 'ตามสัญญา', en: 'By contract' } },
    },
    {
      labelTh: 'Export และ Audit Logs',
      labelEn: 'Export and audit logs',
      values: { free: false, starter: { th: 'Excel', en: 'Excel' }, business: true, enterprise: true },
    },
    {
      labelTh: 'Google Drive / Sheets',
      labelEn: 'Google Drive / Sheets',
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
    let active = true;
    async function loadGoogleConfig() {
      try {
        const res = await fetch('/api/auth/google/config');
        if (!res.ok) return;
        const json = await res.json() as { enabled: boolean; clientId: string | null };
        if (active) setGoogleConfig(json);
      } catch {
        if (active) setGoogleConfig({ enabled: false, clientId: null });
      }
    }
    loadGoogleConfig();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!checkoutOpen || !googleConfig?.enabled || !googleConfig.clientId || !googleSignupRef.current) {
      return undefined;
    }

    let cancelled = false;
    const renderGoogleSignupButton = () => {
      if (cancelled || !googleSignupRef.current || !window.google) {
        return false;
      }

      googleSignupRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: googleConfig.clientId!,
        callback: (response) => {
          setGoogleCredential(response.credential);
          setGoogleSignupReady(true);
          setError('');

          const payloadBase64 = response.credential.split('.')[1];
          if (payloadBase64) {
            try {
              const payloadJson = window.atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
              const payload = JSON.parse(decodeURIComponent(Array.from(payloadJson).map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''))) as { email?: string; name?: string };
              setForm((prev) => ({
                ...prev,
                adminEmail: payload.email ?? prev.adminEmail,
                adminName: payload.name ?? prev.adminName,
              }));
            } catch {
              // The backend still verifies the credential; prefill is best-effort.
            }
          }
        },
      });
      window.google.accounts.id.renderButton(googleSignupRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'signup_with',
        width: Math.min(420, googleSignupRef.current.clientWidth || 420),
        logo_alignment: 'left',
      });
      return true;
    };

    if (renderGoogleSignupButton()) {
      return () => { cancelled = true; };
    }

    const intervalId = window.setInterval(() => {
      if (renderGoogleSignupButton()) {
        window.clearInterval(intervalId);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [checkoutOpen, googleConfig]);

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
  const planPriceLabel = (plan?: PricingPlan) => {
    if (!plan) return '';
    if (plan.key === 'free') return isThai ? plan.price : plan.priceEn ?? plan.price;
    if (plan.key === 'enterprise') return isThai ? plan.price : plan.priceEn ?? plan.price;
    return `฿${isThai ? plan.price : plan.priceEn ?? plan.price}`;
  };
  const showMonthlyPrice = (plan?: PricingPlan) => plan?.key === 'starter' || plan?.key === 'business';
  const isGoogleBoundSignup = googleSignupReady;
  const formValidation = {
    companyNameTh: form.companyNameTh.trim().length > 0 && !isThaiText(form.companyNameTh, true),
    companyNameEn: form.companyNameEn.trim().length > 0 && !isEnglishText(form.companyNameEn),
    taxId: form.taxId.length > 0 && !isThirteenDigitId(form.taxId),
    addressTh: form.addressTh.trim().length > 0 && !isThaiText(form.addressTh, true),
  };
  const formErrors = {
    companyNameTh: form.companyNameTh.trim().length === 0
      ? (isThai ? 'กรุณากรอกชื่อบริษัทภาษาไทย' : 'Thai company name is required')
      : formValidation.companyNameTh ? (isThai ? 'ใช้ตัวอักษรไทยเท่านั้น' : 'Thai characters only') : '',
    taxId: form.taxId.length === 0
      ? (isThai ? 'กรุณากรอกเลขผู้เสียภาษี 13 หลัก' : '13-digit tax ID is required')
      : formValidation.taxId ? (isThai ? `ยังกรอกไม่ครบ (${form.taxId.length}/13 หลัก)` : `Incomplete (${form.taxId.length}/13 digits)`) : '',
    addressTh: form.addressTh.trim().length === 0
      ? (isThai ? 'กรุณากรอกที่อยู่บริษัทภาษาไทย' : 'Thai address is required')
      : form.addressTh.trim().length < 10 ? (isThai ? 'ที่อยู่สั้นเกินไป กรอกให้ครบถนน แขวง เขต จังหวัด รหัสไปรษณีย์' : 'Address too short — include street, district, province, postcode')
      : formValidation.addressTh ? (isThai ? 'ใช้ตัวอักษรไทยเท่านั้น' : 'Thai characters only') : '',
    adminEmail: !isGoogleBoundSignup && form.adminEmail.trim().length === 0
      ? (isThai ? 'กรุณากรอกอีเมล Google' : 'Google email is required') : '',
  };
  const hasFormErrors = Object.values(formErrors).some(Boolean) || Object.values(formValidation).some(Boolean);

  async function handleCheckout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (hasFormErrors) {
      setError(isThai ? 'กรุณากรอกข้อมูลให้ครบและถูกต้องก่อนดำเนินการ' : 'Please fill in all required fields correctly.');
      return;
    }
    setSubmitting(true);
    setCheckoutResult(null);

    try {
      const isFreeSignup = selectedPlan === 'free';
      const res = await fetch(isFreeSignup ? '/api/billing/free-signup' : '/api/billing/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...(isFreeSignup ? { googleCredential: googleCredential || undefined } : { plan: selectedPlan, paymentMethod, couponCode }),
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
          token?: string;
          user?: {
            id: string;
            email: string;
            name: string;
            role: 'super_admin' | 'admin' | 'accountant' | 'viewer';
            companyId: string;
            auth?: { hasPassword: boolean; hasGoogle: boolean };
            company?: { nameTh: string; nameEn?: string | null; taxId: string };
          };
        };
        error?: string;
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? 'Unable to start checkout');
      }

      if (isFreeSignup && json.data.token && json.data.user) {
        setAuth(json.data.token, json.data.user);
        window.location.href = buildPlaneUrl('/app/dashboard', 'app', { token: json.data.token, user: json.data.user });
      } else if (isFreeSignup) {
        setSignupComplete({ plan: 'free', adminEmail: json.data.user?.email ?? form.adminEmail });
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
      const raw = (err as Error).message;
      const thaiErrors: Record<string, string> = {
        'This tax ID is already registered in the system': 'เลขผู้เสียภาษีนี้มีในระบบแล้ว กรุณาตรวจสอบหรือติดต่อเรา',
        'This admin email is already registered in the system': 'อีเมลนี้มีในระบบแล้ว กรุณาใช้อีเมลอื่นหรือเข้าสู่ระบบ',
        'Unable to start checkout': 'ไม่สามารถเริ่มการชำระเงินได้ กรุณาลองใหม่อีกครั้ง',
        'Missing checkout URL': 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
      };
      const msg = isThai ? (thaiErrors[raw] ?? raw) : raw;
      setError(msg);
      // scroll error into view
      setTimeout(() => {
        document.querySelector('[data-checkout-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    } finally {
      setSubmitting(false);
    }
  }

  function openCheckout(plan: 'free' | 'starter' | 'business') {
    setSelectedPlan(plan);
    setError('');
    setCheckoutResult(null);
    setSignupComplete(null);
    setGoogleCredential('');
    setGoogleSignupReady(false);
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
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.06),transparent_30%)]" />

        {/* Floating doodle background — scroll with page, sketch-style e-Tax illustrations */}

        {/* Receipt with zigzag bottom — top left */}
        <div className="pointer-events-none absolute left-4 top-28 opacity-[0.18] hidden lg:block rotate-[-10deg]" style={{animation:'float 7s ease-in-out infinite', animationDelay:'0s'}}>
          <svg width="100" height="140" viewBox="0 0 100 140" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="6" width="84" height="110" rx="5"/>
            <line x1="20" y1="28" x2="80" y2="28"/>
            <line x1="20" y1="42" x2="66" y2="42"/>
            <line x1="20" y1="56" x2="74" y2="56"/>
            <line x1="20" y1="70" x2="58" y2="70"/>
            <line x1="20" y1="84" x2="72" y2="84"/>
            <line x1="20" y1="100" x2="80" y2="100" strokeWidth="3"/>
            {/* Zigzag bottom tear */}
            <path d="M8 116 L16 106 L24 116 L32 106 L40 116 L48 106 L56 116 L64 106 L72 116 L80 106 L88 106 L92 116" strokeWidth="2"/>
          </svg>
        </div>

        {/* Mini Billy face doodle — left middle */}
        <div className="pointer-events-none absolute left-8 top-[42%] opacity-[0.16] hidden xl:block rotate-[6deg]" style={{animation:'float 8.5s ease-in-out infinite', animationDelay:'1.2s'}}>
          <svg width="72" height="96" viewBox="0 0 72 96" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {/* Mini receipt body */}
            <rect x="4" y="16" width="64" height="72" rx="4"/>
            {/* Zigzag top */}
            <path d="M4,16 L10,8 L16,16 L22,8 L28,16 L34,8 L40,16 L46,8 L52,16 L58,8 L64,16 L68,16" strokeWidth="2"/>
            {/* Eyes */}
            <circle cx="26" cy="38" r="7" strokeWidth="2.5"/>
            <circle cx="46" cy="38" r="7" strokeWidth="2.5"/>
            <circle cx="28" cy="36" r="2.5" fill="#059669" stroke="none"/>
            <circle cx="48" cy="36" r="2.5" fill="#059669" stroke="none"/>
            {/* Smile */}
            <path d="M22 52 Q36 64 50 52"/>
            {/* Scarf hint */}
            <path d="M10 75 Q36 84 62 75" strokeWidth="3"/>
          </svg>
        </div>

        {/* Squiggly arrow — bottom left */}
        <div className="pointer-events-none absolute left-10 bottom-20 opacity-[0.22] hidden xl:block" style={{animation:'float 9s ease-in-out infinite', animationDelay:'1.5s'}}>
          <svg width="100" height="80" viewBox="0 0 100 80" fill="none" stroke="#86efac" strokeWidth="3" strokeLinecap="round">
            <path d="M8 68 C18 48, 28 58, 38 38 C48 18, 58 33, 68 18 C78 6, 86 10, 88 6"/>
            <path d="M80 4 L88 6 L84 14"/>
          </svg>
        </div>

        {/* Invoice / A4 doc with folded corner — top right */}
        <div className="pointer-events-none absolute right-4 top-24 opacity-[0.18] hidden lg:block rotate-[10deg]" style={{animation:'float 8s ease-in-out infinite', animationDelay:'0.8s'}}>
          <svg width="96" height="124" viewBox="0 0 96 124" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4 L68 4 L90 26 L90 120 Q90 122 88 122 L6 122 Q4 122 4 120 L4 6 Q4 4 6 4Z"/>
            <path d="M68 4 L68 26 L90 26" strokeWidth="2"/>
            {/* Content lines */}
            <line x1="16" y1="44" x2="78" y2="44"/>
            <line x1="16" y1="56" x2="58" y2="56"/>
            <line x1="16" y1="68" x2="70" y2="68"/>
            <line x1="16" y1="80" x2="50" y2="80"/>
            <line x1="16" y1="92" x2="64" y2="92"/>
            {/* Total box */}
            <rect x="16" y="104" width="60" height="12" rx="2" strokeWidth="2"/>
          </svg>
        </div>

        {/* Sparkle stars — right side */}
        <div className="pointer-events-none absolute right-12 top-[45%] opacity-[0.25] hidden lg:block" style={{animation:'float 6s ease-in-out infinite', animationDelay:'0.4s'}}>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round">
            {/* 4-point star */}
            <path d="M35 8 L38 28 L58 31 L38 34 L35 54 L32 34 L12 31 L32 28 Z"/>
            {/* Small star */}
            <path d="M58 12 L59.5 18 L66 19.5 L59.5 21 L58 27 L56.5 21 L50 19.5 L56.5 18 Z"/>
            {/* Dot */}
            <circle cx="14" cy="52" r="3" fill="#4ade80" stroke="none" opacity="0.5"/>
          </svg>
        </div>

        {/* QR Code sketch — bottom right */}
        <div className="pointer-events-none absolute right-8 bottom-16 opacity-[0.20] hidden xl:block rotate-[-6deg]" style={{animation:'float 6.5s ease-in-out infinite', animationDelay:'2s'}}>
          <svg width="84" height="84" viewBox="0 0 80 80" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="6" width="26" height="26" rx="3"/>
            <rect x="14" y="14" width="10" height="10"/>
            <rect x="48" y="6" width="26" height="26" rx="3"/>
            <rect x="56" y="14" width="10" height="10"/>
            <rect x="6" y="48" width="26" height="26" rx="3"/>
            <rect x="14" y="56" width="10" height="10"/>
            <line x1="48" y1="48" x2="56" y2="48"/>
            <line x1="60" y1="48" x2="74" y2="48"/>
            <line x1="48" y1="56" x2="48" y2="68"/>
            <line x1="60" y1="56" x2="74" y2="56"/>
            <line x1="60" y1="64" x2="60" y2="74"/>
            <line x1="68" y1="64" x2="74" y2="64"/>
          </svg>
        </div>

        {/* Stamp circle — mid left lower */}
        <div className="pointer-events-none absolute left-6 top-[65%] opacity-[0.16] hidden xl:block" style={{animation:'float 10s ease-in-out infinite', animationDelay:'3s'}}>
          <svg width="82" height="82" viewBox="0 0 90 90" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round">
            <circle cx="45" cy="45" r="38" strokeDasharray="6 4"/>
            <circle cx="45" cy="45" r="30"/>
            <text x="45" y="40" textAnchor="middle" fontSize="8" fontFamily="sans-serif" stroke="#16a34a" fill="#16a34a" strokeWidth="0.3">กรมสรรพากร</text>
            <text x="45" y="54" textAnchor="middle" fontSize="8" fontFamily="sans-serif" stroke="#16a34a" fill="#16a34a" strokeWidth="0.3">e-TAX ✓</text>
          </svg>
        </div>

        {/* Calculator sketch — top center-left */}
        <div className="pointer-events-none absolute left-[18%] top-32 opacity-[0.14] hidden xl:block rotate-[4deg]" style={{animation:'float 7.5s ease-in-out infinite', animationDelay:'2.5s'}}>
          <svg width="64" height="80" viewBox="0 0 60 76" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="52" height="68" rx="6"/>
            <rect x="10" y="10" width="40" height="18" rx="3"/>
            {/* Keypad dots */}
            <circle cx="18" cy="42" r="3"/> <circle cx="30" cy="42" r="3"/> <circle cx="42" cy="42" r="3"/>
            <circle cx="18" cy="54" r="3"/> <circle cx="30" cy="54" r="3"/> <circle cx="42" cy="54" r="3"/>
            <circle cx="18" cy="66" r="3"/> <circle cx="30" cy="66" r="3"/>
            <rect x="36" y="60" width="10" height="10" rx="2"/>
          </svg>
        </div>

        {/* Pencil sketch — right center */}
        <div className="pointer-events-none absolute right-[14%] top-[35%] opacity-[0.18] hidden xl:block rotate-[-30deg]" style={{animation:'float 11s ease-in-out infinite', animationDelay:'4s'}}>
          <svg width="32" height="100" viewBox="0 0 32 100" fill="none" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="10" width="16" height="72" rx="3"/>
            {/* Eraser */}
            <rect x="8" y="6" width="16" height="8" rx="2" stroke="#4ade80"/>
            {/* Tip */}
            <path d="M8 82 L16 96 L24 82"/>
            {/* Lines on pencil */}
            <line x1="8" y1="30" x2="24" y2="30"/>
            <line x1="8" y1="50" x2="24" y2="50"/>
          </svg>
        </div>

        <div className="max-w-6xl mx-auto px-4">
          <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <div className="max-w-3xl">

              <h1 className="animate-slide-in-left max-w-4xl text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl leading-tight mb-6" style={{animationDelay:'0.15s'}}>
                {t('landing.hero.title')}
              </h1>

              <p className="animate-slide-in-left max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl mb-10" style={{animationDelay:'0.3s'}}>
                {t('landing.hero.subtitle')}
              </p>

              <div className="animate-slide-in-left flex flex-col sm:flex-row gap-4 mb-8" style={{animationDelay:'0.45s'}}>
                <button type="button" onClick={() => openCheckout('free')} className="btn-primary lg">
                  {t('landing.hero.cta')}
                  <ArrowRight className="w-5 h-5" />
                </button>
                <a href="#pricing-checkout" className="btn-secondary lg">
                  {isThai ? 'ดูแพ็กเกจและวิธีชำระเงิน' : 'View plans and payment options'}
                  <Smartphone className="w-5 h-5" />
                </a>
              </div>

              <p className="animate-fade-in text-sm font-medium text-slate-500" style={{animationDelay:'0.55s'}}>{t('landing.hero.trustText')}</p>

              <div className="animate-slide-up mt-10 grid gap-3 sm:grid-cols-3" style={{animationDelay:'0.6s'}}>
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

            <aside className="animate-slide-in-right animate-float rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl" style={{animationDelay:'0.2s'}}>
              {/* Billy mascot — faithful SVG of the 3D receipt character */}
              <div className="flex justify-center mb-2">
                <svg viewBox="0 0 200 280" width="160" height="224" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* ── Ground shadow ── */}
                  <ellipse cx="100" cy="272" rx="52" ry="7" fill="#bbf7d0" opacity="0.7"/>

                  {/* ── Legs ── */}
                  <rect x="62" y="216" width="22" height="38" rx="10" fill="#f1f5f9"/>
                  <rect x="116" y="216" width="22" height="38" rx="10" fill="#f1f5f9"/>
                  {/* Leg shading */}
                  <rect x="62" y="216" width="6" height="38" rx="10" fill="#e2e8f0"/>
                  <rect x="116" y="216" width="6" height="38" rx="10" fill="#e2e8f0"/>

                  {/* ── Green sneakers ── */}
                  {/* Left shoe */}
                  <ellipse cx="73" cy="254" rx="20" ry="11" fill="#16a34a"/>
                  <ellipse cx="70" cy="252" rx="14" ry="7" fill="#15803d"/>
                  {/* Sole white stripe */}
                  <ellipse cx="73" cy="258" rx="19" ry="5" fill="white" opacity="0.3"/>
                  {/* Lace dots */}
                  <circle cx="68" cy="250" r="1.5" fill="white" opacity="0.8"/>
                  <circle cx="73" cy="248" r="1.5" fill="white" opacity="0.8"/>
                  <circle cx="78" cy="250" r="1.5" fill="white" opacity="0.8"/>
                  {/* Right shoe */}
                  <ellipse cx="127" cy="254" rx="20" ry="11" fill="#16a34a"/>
                  <ellipse cx="124" cy="252" rx="14" ry="7" fill="#15803d"/>
                  <ellipse cx="127" cy="258" rx="19" ry="5" fill="white" opacity="0.3"/>
                  <circle cx="122" cy="250" r="1.5" fill="white" opacity="0.8"/>
                  <circle cx="127" cy="248" r="1.5" fill="white" opacity="0.8"/>
                  <circle cx="132" cy="250" r="1.5" fill="white" opacity="0.8"/>

                  {/* ── Left arm (holding phone) ── */}
                  <path d="M42 140 C24 148 20 168 26 180 C30 188 38 190 44 186" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="1"/>
                  <ellipse cx="34" cy="170" rx="14" ry="22" fill="#f1f5f9" transform="rotate(-20 34 170)"/>
                  {/* Round hand */}
                  <circle cx="30" cy="182" r="12" fill="#f1f5f9"/>
                  <circle cx="30" cy="182" r="10" fill="white"/>

                  {/* ── Phone in left hand ── */}
                  <rect x="10" y="148" width="36" height="58" rx="6" fill="#1e293b"/>
                  <rect x="13" y="152" width="30" height="50" rx="4" fill="#334155"/>
                  {/* Camera bump */}
                  <circle cx="16" cy="156" r="3" fill="#0f172a"/>
                  <circle cx="16" cy="156" r="2" fill="#1e293b"/>
                  {/* Screen glow */}
                  <rect x="14" y="153" width="28" height="48" rx="3" fill="#4ade80" opacity="0.15"/>
                  {/* B on phone */}
                  <text x="28" y="181" textAnchor="middle" fontFamily="Arial Black, sans-serif" fontSize="14" fontWeight="900" fill="white" opacity="0.9">B</text>

                  {/* ── Right arm ── */}
                  <ellipse cx="166" cy="160" rx="14" ry="22" fill="#f1f5f9" transform="rotate(15 166 160)"/>
                  <circle cx="170" cy="176" r="12" fill="#f1f5f9"/>
                  <circle cx="170" cy="176" r="10" fill="white"/>

                  {/* ── Receipt body — main white body ── */}
                  {/* Shadow/depth layer */}
                  <rect x="36" y="50" width="130" height="178" rx="14" fill="#e2e8f0"/>
                  {/* Main body */}
                  <rect x="32" y="46" width="130" height="178" rx="14" fill="#f8fafc"/>
                  {/* White inner */}
                  <rect x="36" y="50" width="122" height="170" rx="12" fill="white"/>

                  {/* ── Crown / spike top edge ── */}
                  <path d="M32,46 L44,22 L56,44 L68,16 L80,44 L92,16 L104,44 L116,16 L128,44 L140,22 L154,42 L162,46"
                    fill="white" stroke="#e2e8f0" strokeWidth="1.5" strokeLinejoin="round"/>
                  {/* Fill spikes white */}
                  <path d="M32,46 L44,22 L56,44 L68,16 L80,44 L92,16 L104,44 L116,16 L128,44 L140,22 L154,42 L162,46 L162,60 L32,60 Z"
                    fill="white"/>

                  {/* ── Eyebrows — thin arch above eyes ── */}
                  <path d="M66 82 Q76 74 86 80" stroke="#1e293b" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                  <path d="M110 80 Q120 74 130 82" stroke="#1e293b" strokeWidth="3.5" fill="none" strokeLinecap="round"/>

                  {/* ── Eyes — big round black with white shine ── */}
                  <circle cx="76" cy="96" r="17" fill="#1e293b"/>
                  <circle cx="120" cy="96" r="17" fill="#1e293b"/>
                  {/* Iris highlight */}
                  <circle cx="83" cy="89" r="6" fill="white"/>
                  <circle cx="127" cy="89" r="6" fill="white"/>
                  <circle cx="86" cy="87" r="2.5" fill="white" opacity="0.6"/>
                  <circle cx="130" cy="87" r="2.5" fill="white" opacity="0.6"/>

                  {/* ── Cheeks ── */}
                  <ellipse cx="54" cy="112" rx="12" ry="8" fill="#fda4af" opacity="0.5"/>
                  <ellipse cx="142" cy="112" rx="12" ry="8" fill="#fda4af" opacity="0.5"/>

                  {/* ── Open smiling mouth ── */}
                  {/* Mouth path — open happy */}
                  <path d="M72 120 Q98 144 124 120" fill="#ef4444" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round"/>
                  {/* Teeth */}
                  <path d="M76 121 Q98 138 120 121" fill="white" stroke="none"/>
                  {/* Tongue hint */}
                  <ellipse cx="98" cy="134" rx="10" ry="5" fill="#f87171" opacity="0.6"/>

                  {/* ── Receipt lines on body ── */}
                  <line x1="52" y1="155" x2="144" y2="155" stroke="#e5e7eb" strokeWidth="2"/>
                  <line x1="52" y1="166" x2="120" y2="166" stroke="#e5e7eb" strokeWidth="2"/>
                  <line x1="52" y1="177" x2="130" y2="177" stroke="#e5e7eb" strokeWidth="2"/>
                  <line x1="52" y1="188" x2="108" y2="188" stroke="#e5e7eb" strokeWidth="2"/>

                  {/* ── Green scarf / cape ── */}
                  {/* Cape back */}
                  <path d="M120 138 C150 140 172 155 168 195 C162 210 145 215 132 210 L128 192 C138 196 148 192 150 180 C153 162 138 148 118 148 Z" fill="#15803d"/>
                  {/* Scarf front band */}
                  <path d="M55 138 Q98 152 142 138 L145 154 Q98 168 52 154 Z" fill="#16a34a"/>
                  {/* Scarf fold */}
                  <path d="M68 138 Q98 148 128 138 L126 148 Q98 158 70 148 Z" fill="#15803d"/>
                  {/* Knot at center */}
                  <ellipse cx="98" cy="148" rx="14" ry="10" fill="#4ade80"/>
                  <ellipse cx="98" cy="148" rx="9" ry="7" fill="#16a34a"/>
                  <ellipse cx="98" cy="148" rx="5" ry="4" fill="#22c55e"/>

                  {/* ── Green B badge ── */}
                  <circle cx="98" cy="175" r="14" fill="#16a34a"/>
                  <circle cx="98" cy="175" r="12" fill="#15803d"/>
                  <text x="98" y="180" textAnchor="middle" fontFamily="Arial Black, sans-serif" fontSize="15" fontWeight="900" fill="white">B</text>

                  {/* ── Sparkle decorations ── */}
                  <path d="M168 60 L170 53 L172 60 L179 62 L172 64 L170 71 L168 64 L161 62 Z" fill="#4ade80" opacity="0.9"/>
                  <path d="M20 100 L21.5 95 L23 100 L28 101.5 L23 103 L21.5 108 L20 103 L15 101.5 Z" fill="#86efac" opacity="0.8"/>
                  <path d="M170 110 L171 106 L172 110 L176 111 L172 112 L171 116 L170 112 L166 111 Z" fill="#4ade80" opacity="0.7"/>
                </svg>
              </div>
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
          {features.map(({ icon: Icon, key }, i) => {
            const gradients = [
              'from-primary-600 to-primary-dark',
              'from-accent-500 to-accent-dark',
              'from-emerald-500 to-emerald-700',
              'from-violet-500 to-violet-700',
            ];
            return (
              <div
                key={key}
                className="animate-slide-up group rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-2 hover:shadow-card-hover hover:border-primary-200 card-hover"
                style={{animationDelay: `${0.1 + i * 0.1}s`}}
              >
                <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${gradients[i % gradients.length]} shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                  <Icon className="w-7 h-7 text-white" strokeWidth={2} />
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-base">
                  {t(`landing.features.${key}.title`)}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {t(`landing.features.${key}.desc`)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Document Operations Positioning */}
      <section className="border-y border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-700">
                {isThai ? 'แข่งด้วย workflow ทั้งระบบ' : 'Compete on the whole workflow'}
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">
                {isThai
                  ? 'ไม่ใช่แค่เก็บใบเสร็จ แต่พาเอกสารไปถึงบัญชีและ e-Tax'
                  : 'Not just receipt capture. Documents move all the way to accounting and e-Tax.'}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
                {isThai
                  ? 'เครื่องมือเก็บค่าใช้จ่ายทั่วไปเก่งเรื่องบันทึกบิล แต่ระบบนี้รวมฝั่งซื้อ ฝั่งขาย เอกสารแนบ การยืนยันจากคน และการส่งกรมสรรพากรไว้ในที่เดียว'
                  : 'Typical expense tools focus on bill capture. This system brings purchases, sales, attachments, human review, and Revenue Department submission into one workspace.'}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {documentOpsPillars.map(({ icon: Icon, th, en, descTh, descEn }, i) => {
                const iconBgs = ['from-primary-600 to-primary-dark','from-accent-500 to-accent-dark','from-emerald-500 to-emerald-700','from-violet-500 to-violet-700'];
                return (
                  <div key={en} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${iconBgs[i % iconBgs.length]} shadow-sm`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-slate-950">{isThai ? th : en}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{isThai ? descTh : descEn}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {marketingArticles.map((article) => (
              <article key={article.en} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {isThai ? 'คู่มือใช้งานจริง' : 'Playbook'}
                </p>
                <h3 className="mt-3 text-lg font-bold text-slate-950">
                  {isThai ? article.th : article.en}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {isThai ? article.bodyTh : article.bodyEn}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing-checkout" className="py-24 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_30%)]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary-700">
              {isThai ? 'เริ่มถูกกว่า ซื้อเพิ่มเฉพาะตอนโต' : 'Lower entry price, scale when volume grows'}
            </p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {isThai ? 'แพ็กเกจสำหรับแข่งงานเอกสารจริง' : 'Pricing built for real document operations'}
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              {isThai
                ? 'รวม AI อ่านเอกสาร, คลังไฟล์แนบ, e-Tax, RD และ export ในระบบเดียว ไม่ต้องซื้อเครื่องมือแยกหลายตัว'
                : 'AI document intake, evidence library, e-Tax, RD submission, and exports in one workspace.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
            {pricingPlans.map((plan, pi) => (
              <div
                key={plan.key}
                className={`animate-slide-up relative flex h-full flex-col rounded-[28px] border bg-white p-6 shadow-sm transition-all duration-300 ${
                  plan.popular
                    ? 'md:scale-105 border-primary-300 ring-2 ring-primary-500 ring-offset-2 shadow-xl'
                    : 'border-slate-200 hover:shadow-md'
                }`}
                style={{animationDelay: `${0.1 + pi * 0.1}s`}}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1.5 text-white text-xs font-bold rounded-full shadow-lg whitespace-nowrap" style={{background: 'linear-gradient(135deg,#16a34a,#059669)'}}>
                      ⭐ {isThai ? 'ยอดนิยม' : 'MOST POPULAR'}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="font-bold text-xl text-gray-900 capitalize mb-2">{plan.key}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-primary-600">
                      {planPriceLabel(plan)}
                    </span>
                    {showMonthlyPrice(plan) && (
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
                      {typeof value === 'object' && value !== null && 'th' in value && <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-primary-700">{isThai ? (value as {th:string;en:string}).th : (value as {th:string;en:string}).en}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4">
          <div className="relative overflow-hidden rounded-3xl p-12 text-center text-white" style={{background: 'linear-gradient(135deg,#16a34a 0%,#059669 50%,#047857 100%)'}}>
            {/* Floating doodles inside CTA — Billy themed */}
            {/* Mini Billy face — top left */}
            <div className="pointer-events-none absolute left-8 top-6 opacity-20" style={{animation:'float 7s ease-in-out infinite', animationDelay:'0s'}}>
              <svg width="64" height="88" viewBox="0 0 64 88" fill="none">
                <rect x="4" y="18" width="56" height="66" rx="6" fill="white"/>
                <path d="M4,18 L9,8 L14,18 L19,8 L24,18 L29,8 L34,18 L39,8 L44,18 L49,8 L54,8 L60,18" fill="white" stroke="white" strokeWidth="1"/>
                <circle cx="22" cy="36" r="8" fill="#1e293b"/>
                <circle cx="42" cy="36" r="8" fill="#1e293b"/>
                <circle cx="25" cy="33" r="3" fill="white"/>
                <circle cx="45" cy="33" r="3" fill="white"/>
                <path d="M18 48 Q32 60 46 48" stroke="#1e293b" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <ellipse cx="32" cy="68" rx="18" ry="8" fill="#16a34a" opacity="0.8"/>
              </svg>
            </div>
            {/* Receipt sketch — bottom left */}
            <div className="pointer-events-none absolute left-16 bottom-4 opacity-15" style={{animation:'float 9s ease-in-out infinite', animationDelay:'1s'}}>
              <svg width="50" height="70" viewBox="0 0 50 70" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <rect x="4" y="4" width="42" height="58" rx="4"/>
                <line x1="10" y1="18" x2="40" y2="18"/>
                <line x1="10" y1="26" x2="32" y2="26"/>
                <line x1="10" y1="34" x2="36" y2="34"/>
                <line x1="10" y1="46" x2="40" y2="46" strokeWidth="3"/>
                <path d="M4 58 L10 50 L16 58 L22 50 L28 58 L34 50 L40 58 L46 50 L46 58" strokeWidth="1.5"/>
              </svg>
            </div>
            {/* Sparkle — top right */}
            <div className="pointer-events-none absolute right-16 top-8 opacity-25" style={{animation:'float 6s ease-in-out infinite', animationDelay:'0.5s'}}>
              <svg width="60" height="60" viewBox="0 0 60 60" fill="white">
                <path d="M30 5 L32.5 24 L52 27.5 L32.5 31 L30 50 L27.5 31 L8 27.5 L27.5 24 Z"/>
                <path d="M52 8 L53.5 14 L60 15.5 L53.5 17 L52 23 L50.5 17 L44 15.5 L50.5 14 Z" opacity="0.6"/>
              </svg>
            </div>
            {/* Mini QR — bottom right */}
            <div className="pointer-events-none absolute right-10 bottom-6 opacity-15" style={{animation:'float 8s ease-in-out infinite', animationDelay:'2s'}}>
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="18" height="18" rx="2"/>
                <rect x="8" y="8" width="10" height="10"/>
                <rect x="34" y="4" width="18" height="18" rx="2"/>
                <rect x="38" y="8" width="10" height="10"/>
                <rect x="4" y="34" width="18" height="18" rx="2"/>
                <rect x="8" y="38" width="10" height="10"/>
                <line x1="34" y1="34" x2="40" y2="34"/>
                <line x1="44" y1="34" x2="52" y2="34"/>
                <line x1="34" y1="42" x2="34" y2="52"/>
                <line x1="44" y1="42" x2="52" y2="42"/>
                <line x1="44" y1="50" x2="52" y2="50"/>
              </svg>
            </div>
            {/* Squiggle arrow — mid right */}
            <div className="pointer-events-none absolute right-6 top-[40%] opacity-20" style={{animation:'float 11s ease-in-out infinite', animationDelay:'3s'}}>
              <svg width="50" height="70" viewBox="0 0 50 70" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 60 C12 44 18 52 24 36 C30 20 36 30 42 14"/>
                <path d="M38 10 L42 14 L38 20"/>
              </svg>
            </div>

            {/* CTA content */}
            <div className="relative z-10">
              {/* Billy mini icon above title */}
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <svg viewBox="0 0 40 48" width="32" height="38" fill="none">
                    <rect x="4" y="12" width="32" height="34" rx="4" fill="white"/>
                    <path d="M4,12 L7,5 L10,12 L13,5 L16,12 L19,5 L22,12 L25,5 L28,12 L31,5 L34,5 L36,12" fill="white" stroke="white" strokeWidth="1"/>
                    <circle cx="14" cy="22" r="5" fill="#1e293b"/>
                    <circle cx="26" cy="22" r="5" fill="#1e293b"/>
                    <circle cx="16" cy="20" r="2" fill="white"/>
                    <circle cx="28" cy="20" r="2" fill="white"/>
                    <path d="M12 30 Q20 37 28 30" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                {isThai ? 'พร้อมเริ่มต้นหรือยัง?' : 'Ready to get started?'}
              </h2>
              <p className="text-green-100 mb-8 text-lg max-w-2xl mx-auto">
                {isThai
                  ? 'ให้ Billboy ช่วยจัดการบัญชีและภาษีให้คุณ ง่าย ครบ จบที่เดียว'
                  : 'Let Billboy handle your accounting and tax — simple, complete, all in one place'}
              </p>
              <button
                type="button"
                onClick={() => openCheckout('free')}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-700 font-bold rounded-xl hover:bg-green-50 transition-all duration-200 hover:-translate-y-1 shadow-lg hover:shadow-xl"
              >
                {t('landing.hero.cta')}
                <ArrowRight className="w-5 h-5" />
              </button>
              <p className="mt-4 text-green-200 text-sm">{isThai ? 'ฟรี 20 เอกสาร ไม่ต้องใช้บัตรเครดิต' : 'Free 20 documents — no credit card needed'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Download App Section ── */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-4 text-center">
          {/* Badge */}
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-50 border border-primary-100 px-4 py-1.5 text-sm font-medium text-primary-700 mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-600" />
            </span>
            {isThai ? 'แอปมือถือ — เร็วๆ นี้' : 'Mobile App — Coming Soon'}
          </span>

          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            {isThai ? 'ใช้งานได้ทุกที่ ทุกเวลา' : 'Use anywhere, anytime'}
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto mb-10">
            {isThai
              ? 'แอป e-Tax Invoice บน Android และ iOS กำลังจะเปิดให้โหลดเร็วๆ นี้ ลงทะเบียนรับแจ้งเตือนก่อนใคร'
              : 'The e-Tax Invoice app for Android and iOS is coming soon. Register to be notified first.'}
          </p>

          {/* Store Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-10">
            {/* Google Play */}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="group relative flex items-center gap-4 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl px-6 py-4 min-w-[200px] transition-all duration-200 hover:scale-105 hover:shadow-xl cursor-not-allowed"
              title={isThai ? 'เร็วๆ นี้' : 'Coming Soon'}
            >
              {/* Google Play icon */}
              <svg viewBox="0 0 24 24" className="w-8 h-8 flex-shrink-0" fill="currentColor">
                <path d="M3.18 23.76c.37.2.8.2 1.18 0l11.1-6.42-2.5-2.5-9.78 8.92zM.5 2.02C.19 2.4 0 2.93 0 3.6v16.8c0 .67.19 1.2.5 1.58l.08.08 9.41-9.41v-.22L.58 1.94.5 2.02zM20.65 10.44l-2.56-1.48-2.8 2.8 2.8 2.8 2.58-1.49c.74-.43.74-1.2-.02-1.63zM4.36.24L15.46 6.66l-2.5 2.5L3.18.24C3.56.04 3.98.04 4.36.24z"/>
              </svg>
              <div className="text-left">
                <p className="text-xs text-gray-400 leading-none mb-0.5">
                  {isThai ? 'เร็วๆ นี้บน' : 'Coming soon on'}
                </p>
                <p className="text-base font-semibold leading-none">Google Play</p>
              </div>
              <span className="absolute -top-2 -right-2 bg-amber-400 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full">
                Soon
              </span>
            </a>

            {/* App Store */}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="group relative flex items-center gap-4 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl px-6 py-4 min-w-[200px] transition-all duration-200 hover:scale-105 hover:shadow-xl cursor-not-allowed"
              title={isThai ? 'เร็วๆ นี้' : 'Coming Soon'}
            >
              {/* Apple icon */}
              <svg viewBox="0 0 24 24" className="w-8 h-8 flex-shrink-0" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div className="text-left">
                <p className="text-xs text-gray-400 leading-none mb-0.5">
                  {isThai ? 'เร็วๆ นี้บน' : 'Coming soon on'}
                </p>
                <p className="text-base font-semibold leading-none">App Store</p>
              </div>
              <span className="absolute -top-2 -right-2 bg-amber-400 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full">
                Soon
              </span>
            </a>
          </div>

          {/* Features preview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto text-sm text-gray-500">
            <div className="flex items-center justify-center gap-2">
              <span className="text-green-500">✓</span>
              {isThai ? 'สร้างใบกำกับภาษีบนมือถือ' : 'Create invoices on mobile'}
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-green-500">✓</span>
              {isThai ? 'แชร์ PDF ผ่าน LINE / Email' : 'Share PDF via LINE / Email'}
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-green-500">✓</span>
              {isThai ? 'ส่ง RD อัตโนมัติ' : 'Auto RD submission'}
            </div>
          </div>
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
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-3 py-5 sm:px-6 sm:py-10">
          <div className="absolute inset-0" onClick={closeCheckout} />
          <div className="relative w-full max-w-6xl overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
              <div className="max-w-3xl">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary-700" />
                    {isThai ? 'ยืนยันผ่าน Google' : 'Google verified'}
                  </span>
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    {isThai ? 'แยกข้อมูลตามบริษัท' : 'Tenant isolated'}
                  </span>
                </div>
                <p className="text-sm font-semibold text-primary-800 mb-1">
                  {selectedPlan === 'free'
                    ? (isThai ? 'สมัครใช้งานฟรี' : 'Start your free workspace')
                    : (isThai ? 'สมัครใช้งานและชำระเงินออนไลน์' : 'Subscribe and pay online')}
                </p>
                <h3 className="text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">
                  {isThai ? 'เปิดบริษัทใหม่และเริ่มใช้งานระบบ' : 'Create your company and start operating'}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
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

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_380px]">
              <div className="bg-white p-5 sm:p-7">
                <div className="mb-6 grid gap-3 sm:grid-cols-3">
                  {[
                    isThai ? 'เลือกแพ็กเกจ' : 'Choose plan',
                    isThai ? 'ยืนยันผู้ดูแล' : 'Verify admin',
                    isThai ? 'ข้อมูลบริษัท' : 'Company profile',
                  ].map((step, index) => (
                    <div key={step} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-primary-800 ring-1 ring-slate-200">
                        {index + 1}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">{step}</span>
                    </div>
                  ))}
                </div>

                <form className="space-y-4" onSubmit={handleCheckout}>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">
                            {isThai ? 'สมัครด้วย Google หรือกรอกเอง' : 'Sign up with Google or enter details manually'}
                          </p>
                          <p className="text-xs leading-5 text-slate-600">
                            {selectedPlan === 'free'
                              ? (isThai ? 'แนะนำให้ใช้ Google เพื่อยืนยันอีเมลและเข้าใช้งานต่อได้ทันที' : 'Recommended for verified email and immediate access after signup.')
                              : (isThai ? 'ใช้ Google เพื่อดึงข้อมูลอีเมลผู้ดูแลอัตโนมัติ' : 'Use Google to auto-fill your admin email for checkout.')}
                          </p>
                        </div>
                        {googleSignupReady && (
                          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                            <Check className="h-3.5 w-3.5" />
                            {isThai ? 'เชื่อมต่อแล้ว' : 'Connected'}
                          </span>
                        )}
                      </div>
                      <div ref={googleSignupRef} className="min-h-[44px] w-full" />
                      {!googleConfig?.enabled && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          {isThai ? 'Google Sign-In ยังไม่พร้อมใช้งาน สามารถกรอกข้อมูลเองได้' : 'Google Sign-In is not available yet. You can still enter details manually.'}
                        </div>
                      )}
                  </div>

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
                          className={`rounded-lg border p-4 text-left transition-all ${
                            isSelected
                              ? 'border-primary-700 bg-primary-50 shadow-sm ring-1 ring-primary-700/15'
                              : 'border-slate-200 bg-white hover:border-primary-200 hover:bg-slate-50'
                          } ${!isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="font-semibold text-slate-950 capitalize">{plan.key}</span>
                            {plan.popular && (
                              <span className="rounded-full bg-primary-700 px-2.5 py-1 text-[11px] font-bold text-white">
                                {isThai ? 'ยอดนิยม' : 'Popular'}
                              </span>
                            )}
                          </div>
                          <div className="text-2xl font-bold text-primary-800">
                            {planPriceLabel(plan)}
                            {showMonthlyPrice(plan) && (
                              <span className="ml-1 text-sm font-medium text-slate-500">/{isThai ? 'เดือน' : 'month'}</span>
                            )}
                          </div>
                          <p className="mt-2 text-sm leading-5 text-slate-600">{isThai ? plan.limitTh : plan.limitEn}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{isThai ? 'ข้อมูลบริษัท' : 'Company details'}</p>
                      <p className="text-xs leading-5 text-slate-500">{isThai ? 'ใช้สำหรับตั้งค่าเอกสารและแยกข้อมูลของ tenant' : 'Used for document setup and tenant isolation.'}</p>
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
                            className={`rounded-lg border p-4 text-left transition-all ${
                              paymentMethod === method.key
                                ? 'border-primary-700 bg-primary-50 shadow-sm ring-1 ring-primary-700/15'
                                : 'border-slate-200 bg-white hover:border-primary-200'
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
                      <input className={guardedInputClass(formValidation.companyNameTh)} value={form.companyNameTh} onChange={(e) => setForm((prev) => ({ ...prev, companyNameTh: thaiTextOnly(e.target.value) }))} required />
                      {formErrors.companyNameTh
                        ? <p className="mt-1 text-xs text-red-600">⚠ {formErrors.companyNameTh}</p>
                        : <p className={inputGuide(formValidation.companyNameTh)}>{isThai ? 'ใช้ตัวอักษรไทย เช่น บริษัท ตัวอย่าง จำกัด' : 'Use Thai characters, e.g. บริษัท ตัวอย่าง จำกัด'}</p>
                      }
                    </div>
                    <div>
                      <label className="label">{isThai ? 'ชื่อบริษัท (อังกฤษ)' : 'Company Name (English)'}</label>
                      <input className={guardedInputClass(formValidation.companyNameEn)} value={form.companyNameEn} onChange={(e) => setForm((prev) => ({ ...prev, companyNameEn: englishTextOnly(e.target.value) }))} />
                      <p className={inputGuide(formValidation.companyNameEn)}>
                        {isThai ? 'ใช้ตัวอักษรอังกฤษเท่านั้น เช่น Example Co., Ltd.' : 'Use English characters, e.g. Example Co., Ltd.'}
                      </p>
                    </div>
                    <div>
                      <label className="label">{isThai ? 'เลขประจำตัวผู้เสียภาษี 13 หลัก' : '13-digit Tax ID'}</label>
                      <input className={guardedInputClass(formValidation.taxId, 'font-mono')} value={form.taxId} onChange={(e) => setForm((prev) => ({ ...prev, taxId: digitsOnly(e.target.value, 13) }))} inputMode="numeric" maxLength={13} required />
                      {formErrors.taxId
                        ? <p className="mt-1 text-xs text-red-600">⚠ {formErrors.taxId}</p>
                        : <p className={inputGuide(false)}>{isThai ? `กรอกตัวเลข ${form.taxId.length}/13 หลัก` : `Enter ${form.taxId.length}/13 digits`}</p>
                      }
                    </div>
                    <div>
                      <label className="label">{isThai ? 'เบอร์โทรติดต่อ' : 'Phone Number'}</label>
                      <input className="input-field" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
                    </div>
                    {isGoogleBoundSignup ? (
                      <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 ring-1 ring-emerald-200">
                            <Check className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-emerald-950">
                              {isThai ? 'บัญชีผู้ดูแลจาก Google' : 'Google admin account'}
                            </p>
                            <p className="mt-1 text-sm text-emerald-900">
                              {form.adminName || form.adminEmail}
                              {form.adminEmail && <span className="text-emerald-800"> · {form.adminEmail}</span>}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="label">{isThai ? 'ชื่อผู้ดูแลระบบ' : 'Admin Name'}</label>
                          <input
                            className="input-field"
                            value={form.adminName}
                            onChange={(e) => setForm((prev) => ({ ...prev, adminName: e.target.value }))}
                            required={selectedPlan === 'free'}
                          />
                        </div>
                        <div>
                          <label className="label">{isThai ? 'อีเมล Google ของผู้ดูแล' : 'Admin Google Email'}</label>
                          <input
                            className="input-field"
                            type="email"
                            value={form.adminEmail}
                            onChange={(e) => setForm((prev) => ({ ...prev, adminEmail: e.target.value }))}
                            required={selectedPlan === 'free'}
                          />
                        </div>
                      </>
                    )}
                    <div className="sm:col-span-2">
                      <label className="label">{isThai ? 'ที่อยู่บริษัท (ไทย)' : 'Company Address (Thai)'}</label>
                      <textarea className={guardedInputClass(formValidation.addressTh, 'min-h-[96px]')} value={form.addressTh} onChange={(e) => setForm((prev) => ({ ...prev, addressTh: thaiTextOnly(e.target.value) }))} required />
                      {formErrors.addressTh
                        ? <p className="mt-1 text-xs text-red-600">⚠ {formErrors.addressTh}</p>
                        : <p className={inputGuide(false)}>{isThai ? 'ที่อยู่ภาษาไทย เช่น เลขที่ ถนน แขวง เขต จังหวัด รหัสไปรษณีย์' : 'Use Thai address text: street, district, province, postal code.'}</p>
                      }
                    </div>
                    </div>
                  </div>

                  {error && (
                    <div data-checkout-error className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
                      <span className="shrink-0 font-bold">⚠</span>
                      <span>{error}</span>
                    </div>
                  )}

                  {signupComplete && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      {isThai
                        ? `สร้างบัญชี Free ให้ ${signupComplete.adminEmail} แล้ว สามารถเข้าสู่ระบบด้วย Google ได้ทันที`
                        : `Free account created for ${signupComplete.adminEmail}. You can now sign in with Google.`}
                    </div>
                  )}

                  {selectedPlan !== 'free' && !configLoading && !config?.enabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      {isThai
                        ? 'ระบบรับชำระออนไลน์ยังไม่ถูกตั้งค่าในเครื่องนี้ กรุณาใส่ Stripe หรือ PromptPay config ก่อน'
                        : 'No online payment method is configured yet. Add Stripe and/or PromptPay config first.'}
                    </div>
                  )}

                  {checkoutResult?.paymentMethod === 'promptpay_qr' && checkoutResult.promptPay && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-slate-950">
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
                    disabled={submitting || !!signupComplete || hasFormErrors || (selectedPlan !== 'free' && (configLoading || !config?.enabled))}
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

              <div className="border-t border-slate-200 bg-slate-900 px-5 py-6 text-white lg:border-l lg:border-t-0 sm:px-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  {selectedPlan === 'free' ? (isThai ? 'สิ่งที่จะได้' : 'What happens next') : (isThai ? 'หลังเปิดใช้งาน' : 'After activation')}
                </p>
                <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-300">{isThai ? 'แพ็กเกจปัจจุบัน' : 'Selected plan'}</p>
                      <p className="mt-1 text-2xl font-bold capitalize text-white">{selectedPlanMeta?.key}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-white">{planPriceLabel(selectedPlanMeta)}</p>
                      {showMonthlyPrice(selectedPlanMeta) && (
                        <p className="text-xs text-slate-300">/{isThai ? 'เดือน' : 'month'}</p>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {isThai ? selectedPlanMeta?.summaryTh : selectedPlanMeta?.summaryEn}
                  </p>
                </div>

                <ul className="mt-5 space-y-3 text-sm text-slate-200">
                  {[
                    isThai ? 'สร้างบริษัทในระบบให้อัตโนมัติ' : 'Automatically creates your company profile',
                    isThai ? 'สร้างบัญชีผู้ดูแลจากอีเมล Google ที่สมัคร' : 'Creates your admin account from the Google email used during signup',
                    selectedPlan === 'free' ? (isThai ? 'ใช้ฟรี 20 เอกสาร/เดือน' : 'Free access with 20 documents per month') : (isThai ? 'เปิดสิทธิ์แพ็กเกจและบันทึกสถานะสมาชิก' : 'Activates your plan and stores subscription status'),
                    isThai ? 'เข้าใช้ต่อด้วย Continue with Google ได้ทันที' : 'Lets you continue with Google right away',
                  ].map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/25">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="leading-6">{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-200">
                  <p className="font-semibold text-white">{isThai ? 'ข้อมูลปลอดภัย' : 'Secure by design'}</p>
                  <p className="mt-1 text-slate-200">
                    {isThai
                      ? 'บัญชีใหม่ถูกแยกตามบริษัทและใช้ Google เพื่อยืนยันตัวตนผู้ดูแล'
                      : 'New workspaces are isolated by company and verified with Google identity.'}
                  </p>
                </div>

                {selectedPlan !== 'free' && (
                <div className="mt-6 rounded-lg bg-white/5 border border-white/10 p-4">
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
