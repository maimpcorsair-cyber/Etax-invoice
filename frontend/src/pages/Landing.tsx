import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Globe, FileCheck, Zap, ArrowRight, Check, Smartphone, Loader2, CreditCard, ShieldCheck, X, Lock, Users, Send, Files, FileSpreadsheet, ScrollText, QrCode, TicketPercent } from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { ProductDoodleField } from '../components/ui/AppChrome';
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
  nameTh: string;
  nameEn: string;
  price: string;
  limitTh: string;
  limitEn: string;
  summaryTh: string;
  summaryEn: string;
  popular?: boolean;
  priceEn?: string;
};

const pricingPlans: PricingPlan[] = [
  { key: 'free', nameTh: 'Free', nameEn: 'Free', price: 'ฟรี', limitTh: 'ทดลอง 20 เอกสาร/เดือน · 1 โปรเจค', limitEn: 'Try 20 docs/month · 1 project', summaryTh: 'สำหรับทดลองอ่านเอกสาร ออก draft และดู workflow ก่อนใช้งานจริง', summaryEn: 'Best for testing document intake, drafts, and the workflow before going live.', priceEn: 'Free' },
  { key: 'starter', nameTh: 'Solo', nameEn: 'Solo', price: '299', limitTh: '150 ใบ/เดือน · 10 โปรเจค · 3 ผู้ใช้', limitEn: '150 docs/month · 10 projects · 3 users', summaryTh: 'สำหรับเจ้าของใช้คนเดียวเป็นหลัก แต่เชิญบัญชี/ผู้ช่วยเข้ามาช่วยตรวจได้', summaryEn: 'Best for owner-led teams: one main admin with a bookkeeper or helper invited in.' },
  { key: 'business', nameTh: 'Team', nameEn: 'Team', price: '990', limitTh: '800 ใบ/เดือน · 50 โปรเจค · 8 ผู้ใช้', limitEn: '800 docs/month · 50 projects · 8 users', summaryTh: 'สำหรับทีมที่มีหลายไซต์งาน ต้องแยกโปรเจค LINE group Drive folder และ export ทุกเดือน', summaryEn: 'Best for multi-site teams that need projects, LINE groups, Drive folders, and exports.', popular: true },
  { key: 'enterprise', nameTh: 'Enterprise', nameEn: 'Enterprise', price: 'ติดต่อเรา', limitTh: 'ไม่จำกัด + SLA', limitEn: 'Unlimited + SLA', summaryTh: 'สำหรับองค์กรที่ต้องการโควตา โมเดลตรวจเอกสาร และ workflow เฉพาะ', summaryEn: 'Best for high-volume companies with custom verification and workflow needs.', priceEn: 'Contact us' },
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
  const heroMotionRef = useRef<HTMLElement | null>(null);
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
    // adminPassword is sent only when the user is going through the manual
    // fallback path (Google not configured / not used). Keep the field
    // empty until the user actually types — backend skips it on the
    // Google path.
    adminPassword: '',
    phone: '',
    acceptedLegal: false,
    marketingOptIn: false,
  });
  const [juristicLookupState, setJuristicLookupState] = useState<'idle' | 'loading' | 'found' | 'not_found' | 'error'>('idle');

  // Auto-fetch DBD open-data when the user finishes typing a 13-digit tax ID.
  // Pre-fills nameTh / nameEn / addressTh from the public juristic cache so
  // the signup form is 90% complete before the user types anything else.
  // We don't overwrite fields the user has already filled in manually.
  useEffect(() => {
    const taxId = form.taxId.replace(/\D/g, '');
    if (taxId.length !== 13) {
      if (juristicLookupState !== 'idle') setJuristicLookupState('idle');
      return;
    }
    let cancelled = false;
    setJuristicLookupState('loading');
    (async () => {
      try {
        const res = await fetch(`/api/billing/signup/lookup-juristic?taxId=${taxId}`);
        const json = await res.json() as { data?: { nameTh?: string | null; nameEn?: string | null; addressTh?: string | null } | null };
        if (cancelled) return;
        if (!res.ok || !json.data) {
          setJuristicLookupState('not_found');
          return;
        }
        setForm((prev) => ({
          ...prev,
          companyNameTh: prev.companyNameTh.trim() || json.data!.nameTh || prev.companyNameTh,
          companyNameEn: prev.companyNameEn.trim() || json.data!.nameEn || prev.companyNameEn,
          addressTh: prev.addressTh.trim() || json.data!.addressTh || prev.addressTh,
        }));
        setJuristicLookupState('found');
      } catch {
        if (!cancelled) setJuristicLookupState('error');
      }
    })();
    return () => { cancelled = true; };
  // Deliberately not depending on the form fields below — we only want to
  // fire when the tax ID itself changes, not every keystroke elsewhere.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.taxId]);

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
      { icon: Users, available: true, th: '10 โปรเจค, 3 ผู้ใช้, 3 กลุ่ม LINE', en: '10 projects, 3 users, 3 LINE groups' },
    ],
    business: [
      { icon: Users, available: true, th: 'สูงสุด 8 ผู้ใช้พร้อม role ภายในทีม', en: 'Up to 8 users with internal roles' },
      { icon: ScrollText, available: true, th: 'Audit logs, template และ status เอกสาร', en: 'Audit logs, templates, and document statuses' },
      { icon: FileSpreadsheet, available: true, th: '50 โปรเจค, Drive folder และ Google Sheets', en: '50 projects, Drive folders, and Google Sheets' },
      { icon: ShieldCheck, available: true, th: 'เหมาะกับหลายไซต์งานและอนุมัติงบ', en: 'Production-ready for multi-site budget approval' },
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
      labelTh: 'Project Room / แยกงบงาน',
      labelEn: 'Project rooms and budget control',
      values: { free: { th: '1 โปรเจค', en: '1 project' }, starter: { th: '10 โปรเจค', en: '10 projects' }, business: { th: '50 โปรเจค', en: '50 projects' }, enterprise: { th: 'ตามสัญญา', en: 'By contract' } },
    },
    {
      labelTh: 'LINE group ต่อโปรเจค',
      labelEn: 'LINE groups per project',
      values: { free: { th: '1 กลุ่ม', en: '1 group' }, starter: { th: '3 กลุ่ม', en: '3 groups' }, business: { th: '20 กลุ่ม', en: '20 groups' }, enterprise: { th: 'ตามสัญญา', en: 'By contract' } },
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
    const section = heroMotionRef.current;
    if (!section) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;

    const readScrollTop = () => Math.max(
      window.scrollY,
      document.documentElement.scrollTop,
      document.body.scrollTop,
    );

    const updateMotion = () => {
      frame = 0;
      const scrollDistance = Math.max(section.offsetHeight - window.innerHeight, 1);
      const rawProgress = (readScrollTop() - section.offsetTop) / scrollDistance;
      const clampedProgress = Math.max(0, Math.min(rawProgress, 1));
      const progress = reducedMotion.matches ? (clampedProgress >= 0.8 ? 1 : 0) : clampedProgress;
      section.style.setProperty('--hero-scroll', progress.toFixed(4));
    };

    const queueMotion = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateMotion);
    };

    updateMotion();
    window.addEventListener('scroll', queueMotion, { passive: true });
    window.addEventListener('resize', queueMotion);
    document.body.addEventListener('scroll', queueMotion, { passive: true });
    reducedMotion.addEventListener('change', queueMotion);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', queueMotion);
      window.removeEventListener('resize', queueMotion);
      document.body.removeEventListener('scroll', queueMotion);
      reducedMotion.removeEventListener('change', queueMotion);
    };
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
      : formValidation.companyNameTh ? (isThai ? 'ต้องมีอักษรไทยอย่างน้อย 1 ตัว' : 'Requires at least one Thai character') : '',
    taxId: form.taxId.length === 0
      ? (isThai ? 'กรุณากรอกเลขผู้เสียภาษี 13 หลัก' : '13-digit tax ID is required')
      : formValidation.taxId ? (isThai ? `ยังกรอกไม่ครบ (${form.taxId.length}/13 หลัก)` : `Incomplete (${form.taxId.length}/13 digits)`) : '',
    addressTh: form.addressTh.trim().length === 0
      ? (isThai ? 'กรุณากรอกที่อยู่บริษัทภาษาไทย' : 'Thai address is required')
      : form.addressTh.trim().length < 10 ? (isThai ? 'ที่อยู่สั้นเกินไป กรอกให้ครบถนน แขวง เขต จังหวัด รหัสไปรษณีย์' : 'Address too short — include street, district, province, postcode')
      : formValidation.addressTh ? (isThai ? 'ใช้ตัวอักษรไทยเท่านั้น' : 'Thai characters only') : '',
    adminEmail: !isGoogleBoundSignup && form.adminEmail.trim().length === 0
      ? (isThai ? 'กรุณากรอกอีเมล' : 'Email is required') : '',
    // Manual fallback (no Google) needs a password — backend requires it
    // so the freshly-created user can log back in via /api/auth/login.
    // Skip the check when Google is configured (password field is hidden
    // anyway) or when the user has signed in with Google.
    adminPassword: !isGoogleBoundSignup && !googleConfig?.enabled && form.adminPassword.trim().length < 8
      ? (isThai ? 'รหัสผ่านอย่างน้อย 8 ตัวอักษร' : 'Password must be at least 8 characters') : '',
    // PDPA Section 19 — without explicit consent we have no lawful basis to
    // process the data the user is about to upload. Refuse submission until
    // the checkbox is ticked; pure UX-side guard (backend re-enforces).
    acceptedLegal: !form.acceptedLegal
      ? (isThai ? 'กรุณายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัวก่อนสมัคร' : 'You must accept the terms before signing up') : '',
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
          // Pin the version the user actually saw — backend records it so we
          // know which doc revision their consent attaches to.
          acceptedLegalVersion: '2026-05-19',
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

  function scrollToWorkflow() {
    const section = heroMotionRef.current;
    if (!section) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const top = Math.max(section.offsetTop + section.offsetHeight - window.innerHeight, 0);
    const bodyIsScroller = document.body.scrollHeight > document.body.clientHeight;

    if (bodyIsScroller) {
      document.body.scrollTo({ top, behavior });
      return;
    }

    window.scrollTo({ top, behavior });
  }

  return (
    <div className="app-shell">
      <ProductDoodleField />
      {/* Header */}
      <header className="fixed inset-x-0 top-4 z-50 px-3 sm:px-4">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between rounded-[22px] border border-white/80 bg-white/90 px-3 text-slate-950 shadow-[0_20px_70px_rgba(30,58,138,0.16)] backdrop-blur-xl sm:px-5">
          <Link to="/" className="group flex items-center gap-3 text-slate-950 hover:text-primary-800">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-700 text-white shadow-[0_12px_30px_rgba(30,58,138,0.26)] transition group-hover:-translate-y-0.5">
              <FileText className="h-5 w-5" strokeWidth={2.6} />
            </span>
            <span className="text-lg font-bold">{t('app.shortName')}</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-500 md:flex">
            <a href="#features" className="text-slate-500 hover:text-primary-800">{isThai ? 'ระบบ' : 'Product'}</a>
            <button type="button" onClick={scrollToWorkflow} className="text-slate-500 hover:text-primary-800">
              Workflow
            </button>
            <a href="#pricing-checkout" className="text-slate-500 hover:text-primary-800">{isThai ? 'ราคา' : 'Pricing'}</a>
            <Link to="/contact" className="text-slate-500 hover:text-primary-800">{isThai ? 'ติดต่อ' : 'Contact'}</Link>
          </nav>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <LanguageSwitcher variant="toggle" />
            <a href={getPlanePath('/login', 'app')} className="hidden rounded-2xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-primary-50 hover:text-primary-800 sm:inline-flex">
              {t('auth.login')}
            </a>
            <button
              type="button"
              onClick={() => openCheckout('free')}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-primary-700 px-3 py-2 text-sm font-bold text-white shadow-[0_14px_34px_rgba(30,58,138,0.26)] transition hover:-translate-y-0.5 hover:bg-primary-800 sm:px-5"
            >
              {isThai ? 'เริ่มใช้ฟรี' : 'Start free'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section
        ref={heroMotionRef}
        className="relative isolate h-[1500px] overflow-clip bg-[#f4f8fc] text-slate-950 sm:h-[1650px] lg:h-[1800px]"
      >
        <div className="sticky top-0 h-[100svh] min-h-[720px] overflow-hidden">
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_22%,rgba(45,212,191,0.15),transparent_25rem),radial-gradient(circle_at_82%_16%,rgba(30,58,138,0.14),transparent_29rem),linear-gradient(180deg,#fbfdff_0%,#eef4fa_100%)]" />
          <div className="absolute inset-0 -z-10 opacity-70 [background-image:linear-gradient(rgba(30,58,138,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(30,58,138,0.045)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />
          <div
            className="absolute left-[8%] top-[31%] hidden h-32 w-32 rounded-full border border-primary-200/70 bg-white/80 shadow-[0_22px_70px_rgba(30,58,138,0.12)] lg:block"
            style={{
              opacity: 'calc(0.8 - var(--hero-scroll, 0) * 0.35)',
              transform: 'translate3d(calc(var(--hero-scroll, 0) * -90px), calc(var(--hero-scroll, 0) * -80px), 0) scale(calc(1 + var(--hero-scroll, 0) * 0.18))',
              willChange: 'transform, opacity',
            }}
          >
            <span className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-primary-700 shadow-[0_14px_34px_rgba(30,58,138,0.28)]" />
            <span className="absolute left-7 top-1/2 h-px w-20 -translate-y-1/2 bg-primary-200" />
          </div>

          <div
            className="relative z-20 mx-auto max-w-5xl px-4 pt-32 text-center sm:pt-36 lg:pt-[9.5rem]"
            style={{
              opacity: 'calc(1 - var(--hero-scroll, 0) * 1.08)',
              transform: 'translate3d(0, calc(var(--hero-scroll, 0) * -170px), 0) scale(calc(1 - var(--hero-scroll, 0) * 0.045))',
              willChange: 'transform, opacity',
            }}
          >
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white/85 px-4 py-2 text-xs font-bold text-primary-800 shadow-[0_12px_40px_rgba(30,58,138,0.1)] backdrop-blur">
              <Zap className="h-3.5 w-3.5 text-amber-600" />
              {isThai ? 'ผู้ช่วยเอกสารและภาษีสำหรับ SME ไทย' : 'The document and tax companion for Thai SMEs'}
            </div>
            <h1 className="mx-auto mt-7 max-w-5xl text-balance text-[clamp(3.2rem,7.4vw,6.8rem)] font-semibold leading-[0.92] text-slate-950">
              {isThai ? (
                <>
                  เอกสารเข้าแล้ว
                  <span className="block text-primary-800">ภาษีพร้อมต่อ</span>
                </>
              ) : (
                <>
                  Documents arrive.
                  <span className="block text-primary-800">Tax work moves.</span>
                </>
              )}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              {isThai
                ? 'ส่งบิลและสลิปจาก LINE ให้ AI อ่าน บัญชีกดยืนยัน แล้ว Billboy จัด Drive สมุดทะเบียน และงานยื่นภาษีต่อให้ครบ'
                : 'Send bills and slips from LINE. AI reads, accountants confirm, and Billboy organizes Drive evidence, registers, and filing work.'}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => openCheckout('free')}
                className="pointer-events-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary-700 px-6 py-3 text-base font-bold text-white shadow-[0_18px_46px_rgba(30,58,138,0.28)] transition duration-300 hover:-translate-y-1 hover:bg-primary-800"
              >
                {isThai ? 'เริ่มทดลองใช้ฟรี' : 'Start free trial'}
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={scrollToWorkflow}
                className="pointer-events-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-6 py-3 text-base font-bold text-primary-800 shadow-[0_16px_42px_rgba(15,23,42,0.08)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-primary-200 hover:bg-primary-50"
              >
                {isThai ? 'ดูการทำงาน' : 'See the workflow'}
                <Smartphone className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 z-10 mx-auto max-w-[1500px]">
            <div
              className="absolute left-[2%] top-[43%] hidden w-[240px] rounded-[20px] border border-white/90 bg-white/95 p-4 shadow-[0_28px_80px_rgba(30,58,138,0.17)] backdrop-blur-xl md:block lg:left-[4%] lg:w-[270px]"
              style={{
                opacity: 'calc(0.96 - var(--hero-scroll, 0) * 0.18)',
                transform: 'translate3d(calc(var(--hero-scroll, 0) * -95px), calc(var(--hero-scroll, 0) * -155px), 0) rotate(calc(-5deg - var(--hero-scroll, 0) * 4deg))',
                willChange: 'transform, opacity',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-800">
                    <Files className="h-4 w-4" />
                  </span>
                  AI Inbox
                </div>
                <span className="rounded-full bg-primary-700 px-2.5 py-1 text-xs font-bold text-white">89</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {[
                  { label: isThai ? 'ใบซื้อรอตรวจ' : 'Purchases to review', value: '34', width: '72%', tone: 'bg-amber-400' },
                  { label: isThai ? 'สลิปรอจับคู่' : 'Slips to match', value: '12', width: '46%', tone: 'bg-teal-500' },
                  { label: isThai ? 'พร้อมบันทึก' : 'Ready to post', value: '43', width: '84%', tone: 'bg-emerald-500' },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50/80 p-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-600">{item.label}</span>
                      <span className="font-bold text-slate-950">{item.value}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                      <div className={`h-1.5 rounded-full ${item.tone}`} style={{ width: item.width }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="absolute right-[2%] top-[41%] hidden w-[250px] rounded-[20px] border border-white/90 bg-white/95 p-4 shadow-[0_28px_80px_rgba(30,58,138,0.17)] backdrop-blur-xl md:block lg:right-[3%] lg:w-[280px]"
              style={{
                opacity: 'calc(0.96 - var(--hero-scroll, 0) * 0.15)',
                transform: 'translate3d(calc(var(--hero-scroll, 0) * 105px), calc(var(--hero-scroll, 0) * -185px), 0) rotate(calc(5deg + var(--hero-scroll, 0) * 3deg))',
                willChange: 'transform, opacity',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">{isThai ? 'ภาษีเดือนนี้' : 'This month tax'}</span>
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="mt-4 grid grid-cols-4 items-end gap-2">
                {[42, 58, 49, 86].map((height, index) => (
                  <div key={index} className="flex flex-col items-center gap-2">
                    <div className="flex h-24 w-full items-end rounded-lg bg-slate-100 p-1">
                      <div
                        className={`w-full rounded-md ${index === 3 ? 'bg-emerald-500' : index === 1 ? 'bg-amber-400' : 'bg-primary-300'}`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold leading-tight text-slate-500">{['ขาย', 'ซื้อ', 'WHT', 'PP30'][index]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100">
                <span>{isThai ? 'พร้อมยื่น ภ.พ.30' : 'PP.30 ready'}</span>
                <Check className="h-4 w-4" />
              </div>
            </div>

            <div
              className="absolute left-1/2 top-[46%] w-[min(94vw,1080px)] overflow-hidden rounded-[24px] border-[6px] border-slate-900 bg-slate-900 shadow-[0_50px_140px_rgba(30,58,138,0.3)] sm:border-[9px] lg:top-[44%]"
              style={{
                transform: 'translate3d(-50%, calc(140px - var(--hero-scroll, 0) * 380px), 0) rotate(calc(-4deg + var(--hero-scroll, 0) * 4deg)) scale(calc(0.84 + var(--hero-scroll, 0) * 0.11))',
                transformOrigin: '50% 12%',
                willChange: 'transform',
              }}
            >
              <div className="flex h-8 items-center gap-2 bg-slate-900 px-3 sm:h-10 sm:px-4">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b5f]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#f6c453]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#4ecb71]" />
                <span className="ml-auto rounded-md bg-white/10 px-3 py-1 text-xs font-semibold leading-tight text-slate-300">
                  app.billboy.co
                </span>
              </div>
              <picture>
                <source media="(max-width: 639px)" srcSet="/product/billboy-product-ledger-mobile.png" />
                <img
                  src="/product/billboy-product-ledger-desktop.png"
                  alt={isThai ? 'หน้าจอจัดการสินค้าและบริการของ Billboy' : 'Billboy product catalog ledger'}
                  className="aspect-[4/5] w-full object-cover object-top sm:aspect-[16/9]"
                />
              </picture>
            </div>

            <div
              className="absolute bottom-[4%] left-[5%] hidden w-[220px] rounded-[20px] border border-white/90 bg-white/95 p-4 shadow-[0_28px_80px_rgba(30,58,138,0.17)] backdrop-blur-xl lg:block"
              style={{
                transform: 'translate3d(calc(var(--hero-scroll, 0) * -45px), calc(var(--hero-scroll, 0) * -245px), 0) rotate(calc(4deg - var(--hero-scroll, 0) * 7deg)) scale(calc(1 + var(--hero-scroll, 0) * 0.08))',
                willChange: 'transform',
              }}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <Zap className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-3xl font-bold leading-none text-slate-950">3 min</div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">{isThai ? 'จากรูปถึง draft' : 'photo to draft'}</div>
                </div>
              </div>
            </div>

            <div
              className="absolute bottom-[7%] right-[4%] hidden w-[235px] rounded-[20px] bg-primary-700 p-4 text-white shadow-[0_30px_90px_rgba(30,58,138,0.28)] lg:block"
              style={{
                transform: 'translate3d(calc(var(--hero-scroll, 0) * 55px), calc(var(--hero-scroll, 0) * -265px), 0) rotate(calc(-4deg + var(--hero-scroll, 0) * 7deg)) scale(calc(1 + var(--hero-scroll, 0) * 0.08))',
                willChange: 'transform',
              }}
            >
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs font-semibold text-primary-100">{isThai ? 'หลักฐานครบ' : 'Evidence complete'}</div>
                  <div className="mt-2 text-4xl font-bold leading-none">96%</div>
                </div>
                <FileSpreadsheet className="h-8 w-8 text-teal-200" />
              </div>
              <div className="mt-4 h-2 rounded-full bg-white/15">
                <div className="h-2 w-[96%] rounded-full bg-teal-300" />
              </div>
              <div className="mt-3 text-[11px] font-semibold text-primary-100">{isThai ? 'Drive + สมุดทะเบียนซิงก์แล้ว' : 'Drive + register synced'}</div>
            </div>

            <img
              src="/brand/doodles/billoy-analytics-doodle.png"
              alt=""
              className="absolute bottom-[2%] right-[1%] hidden w-32 drop-shadow-[0_24px_42px_rgba(15,23,42,0.16)] xl:block"
              style={{
                opacity: 'calc(0.92 - var(--hero-scroll, 0) * 0.22)',
                transform: 'translate3d(calc(var(--hero-scroll, 0) * 65px), calc(var(--hero-scroll, 0) * -105px), 0) rotate(calc(5deg + var(--hero-scroll, 0) * 4deg))',
                willChange: 'transform, opacity',
              }}
            />
          </div>

          <div
            className="absolute inset-x-0 bottom-5 z-30 flex justify-center"
            style={{
              opacity: 'calc(1 - var(--hero-scroll, 0) * 1.5)',
              transform: 'translate3d(0, calc(var(--hero-scroll, 0) * 28px), 0)',
            }}
          >
            <span className="rounded-full border border-white/90 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-600 shadow-[0_14px_38px_rgba(30,58,138,0.12)] backdrop-blur">
              {isThai ? 'เลื่อนเพื่อดูเอกสารประกอบเป็นระบบ' : 'Scroll to assemble the workflow'}
            </span>
          </div>

          <div
            id="workflow"
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 border-y border-white/80 bg-white/[0.92] py-5 shadow-[0_-24px_70px_rgba(30,58,138,0.08)] backdrop-blur-xl"
            style={{
              opacity: 'calc(var(--hero-scroll, 0) * 1.7)',
              transform: 'translate3d(0, calc(160px - var(--hero-scroll, 0) * 160px), 0)',
              willChange: 'transform, opacity',
            }}
          >
            <div className="mx-auto grid max-w-5xl grid-cols-2 gap-x-2 gap-y-1 px-3 text-left sm:grid-cols-4 sm:gap-3 sm:px-4">
              {[
                { title: isThai ? 'ส่งเข้า LINE' : 'Send to LINE', desc: isThai ? 'ถ่ายบิลหรือสลิปจากมือถือ' : 'Capture bills and slips' },
                { title: isThai ? 'AI อ่านให้' : 'AI reads', desc: isThai ? 'แยกประเภทและเช็ค VAT' : 'Classifies and checks VAT' },
                { title: isThai ? 'บัญชีกดยืนยัน' : 'Accountant reviews', desc: isThai ? 'แก้เฉพาะรายการที่เสี่ยง' : 'Only risky items need edits' },
                { title: isThai ? 'พร้อมยื่นภาษี' : 'Tax-ready', desc: isThai ? 'Drive และสมุดทะเบียนครบ' : 'Drive and registers complete' },
              ].map((step, index) => (
                <div key={step.title} className="grid min-w-0 grid-cols-[28px_1fr] gap-2 rounded-xl px-1 py-1.5 sm:grid-cols-[32px_1fr] sm:gap-3 sm:px-3 sm:py-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-700 text-[11px] font-bold text-white sm:h-8 sm:w-8 sm:text-xs">0{index + 1}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold leading-5 text-slate-950 sm:text-sm">{step.title}</div>
                    <div className="mt-0.5 text-xs leading-5 text-slate-500">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative overflow-hidden border-y border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(242,247,252,0.92))] py-28 lg:py-40">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(45,212,191,0.1)_0%,transparent_34%),linear-gradient(250deg,rgba(201,168,76,0.13)_0%,transparent_32%)]" />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-end lg:gap-16">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700">
                {isThai ? 'เอกสารเดียว งานทั้งระบบเดินต่อ' : 'One document moves the whole system'}
              </div>
              <h2 className="mt-6 max-w-5xl text-balance text-[clamp(3rem,6.4vw,6.5rem)] font-semibold leading-[0.94] text-slate-950">
                {isThai ? (
                  <>
                    จากรูปหนึ่งใบ
                    <span className="block text-primary-800">ไปถึงภาษีทั้งเดือน</span>
                  </>
                ) : (
                  <>
                    One document in.
                    <span className="block text-primary-800">A whole month moves.</span>
                  </>
                )}
              </h2>
            </div>
            <p className="max-w-xl text-base leading-8 text-slate-600 lg:pb-2 lg:text-lg">
              {isThai
                ? 'เจ้าของส่งเอกสารจากมือถือ AI แยกประเภท ทีมบัญชียืนยัน แล้วหลักฐาน ทะเบียนภาษี และงานยื่นต่อกันโดยไม่ต้องเริ่มใหม่ทุกหน้าจอ'
                : 'Owners capture from mobile, AI classifies, accountants confirm, and evidence, tax registers, and filing work continue without restarting in each screen.'}
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:mt-24 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-slate-200">
            {features.map(({ icon: Icon, key }, i) => {
              const accents = ['text-primary-800 bg-primary-50', 'text-teal-700 bg-teal-50', 'text-amber-700 bg-amber-50', 'text-emerald-700 bg-emerald-50'];
              return (
                <div
                  key={key}
                  className="group border-t border-slate-200 pt-6 lg:border-t-0 lg:px-7 lg:pt-0 lg:first:pl-0 lg:last:pr-0"
                >
                  <div className="flex items-center justify-between">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accents[i % accents.length]}`}>
                      <Icon className="h-5 w-5" strokeWidth={2.2} />
                    </div>
                    <span className="text-xs font-bold text-slate-400">0{i + 1}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-bold text-slate-950">
                    {t(`landing.features.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {t(`landing.features.${key}.desc`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Document Operations Positioning */}
      <section className="border-y border-slate-200 bg-[#f6f8fb] py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <h2 className="text-3xl font-semibold leading-tight text-slate-950 sm:text-5xl">
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
                const iconBgs = ['bg-primary-700','bg-emerald-700','bg-slate-800','bg-amber-600'];
                return (
                  <div key={en} className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_44px_rgba(15,23,42,0.06)] transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[0_20px_58px_rgba(15,23,42,0.1)]">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconBgs[i % iconBgs.length]} shadow-sm`}>
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
              <article key={article.en} className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_14px_38px_rgba(15,23,42,0.05)]">
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
      <section id="pricing-checkout" className="bg-white py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="mb-3 text-sm font-semibold uppercase text-primary-700">
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
                className={`animate-slide-up relative flex h-full flex-col rounded-lg border bg-white p-6 shadow-sm transition-[border-color,box-shadow,transform] duration-300 ${
                  plan.popular
                    ? 'md:scale-105 border-primary-300 ring-2 ring-primary-500 ring-offset-2 shadow-xl'
                    : 'border-slate-200 hover:shadow-md'
                }`}
                style={{animationDelay: `${0.1 + pi * 0.1}s`}}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="rounded-md bg-primary-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm whitespace-nowrap">
                      {isThai ? 'แนะนำสำหรับทีมบัญชี' : 'RECOMMENDED'}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="font-bold text-xl text-gray-900 mb-2">{isThai ? plan.nameTh : plan.nameEn}</h3>
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
                    {planDetails[plan.key].map(({ icon: Icon, available, th, en }, index) => {
                      const iconTone = available
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500';
                      const labelTone = available ? 'text-gray-700' : 'text-gray-500';

                      return (
                        <li key={`${plan.key}-${index}`} className="flex items-start gap-3">
                          <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0 ${iconTone}`}>
                            <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
                          </div>
                          <span className={`text-sm font-medium leading-6 ${labelTone}`}>
                            {isThai ? th : en}
                          </span>
                        </li>
                      );
                    })}
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

          <div className="mt-10 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="grid min-w-[860px] grid-cols-[1.25fr_repeat(4,minmax(0,1fr))] border-b border-gray-200 bg-gray-50/80">
              <div className="px-5 py-4 text-sm font-semibold text-gray-900">
                {isThai ? 'เปรียบเทียบสิทธิ์การใช้งาน' : 'Feature comparison'}
              </div>
              {pricingPlans.map((plan) => (
                <div key={`head-${plan.key}`} className="px-4 py-4 text-center text-sm font-semibold text-gray-700">
                  {isThai ? plan.nameTh : plan.nameEn}
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
          <div className="relative overflow-hidden rounded-xl bg-primary-800 p-12 text-center text-white">
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
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-700 font-bold rounded-xl hover:bg-green-50 transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-1 shadow-lg hover:shadow-xl"
              >
                {t('landing.hero.cta')}
                <ArrowRight className="w-5 h-5" />
              </button>
              <p className="mt-4 text-green-200 text-sm">{isThai ? 'ฟรี 20 เอกสาร ไม่ต้องใช้บัตรเครดิต' : 'Free 20 documents — no credit card needed'}</p>
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
            <p>© {new Date().getFullYear()} {t('app.name')} • {isThai ? 'ตามมาตรฐานกรมสรรพากร' : 'Thailand Revenue Department Compliant'}</p>
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
                          className={`rounded-lg border p-4 text-left transition-[background-color,border-color,box-shadow] duration-200 ${
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
                      <p className="text-xs leading-5 text-slate-500">{isThai ? 'ใช้แสดงในเอกสารและแยกข้อมูลของแต่ละบริษัท' : 'Used on documents and to keep each company’s data separate.'}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedPlan !== 'free' && (
                    <div className="sm:col-span-2">
                      <label className="label">{isThai ? 'วิธีชำระเงิน' : 'Payment method'}</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(config?.paymentMethods ?? []).filter((method) => method.enabled).map((method) => (
                          <button
                            key={method.key}
                            type="button"
                            disabled={!method.enabled}
                            onClick={() => setPaymentMethod(method.key)}
                            className={`rounded-lg border p-4 text-left transition-[background-color,border-color,box-shadow] duration-200 ${
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
                        ? <p className="mt-1 text-xs text-red-600">{formErrors.companyNameTh}</p>
                        : <p className={inputGuide(formValidation.companyNameTh)}>{isThai ? 'มีอักษรไทยอย่างน้อย 1 ตัว — แทรกอังกฤษได้ เช่น บริษัท K&K Logistics จำกัด' : 'At least one Thai character — English allowed, e.g. บริษัท K&K Logistics จำกัด'}</p>
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
                        ? <p className="mt-1 text-xs text-red-600">{formErrors.taxId}</p>
                        : juristicLookupState === 'loading'
                          ? <p className="mt-1 text-xs text-slate-500">{isThai ? 'กำลังค้นข้อมูลจาก DBD...' : 'Looking up DBD records...'}</p>
                          : juristicLookupState === 'found'
                            ? <p className="mt-1 text-xs text-emerald-600">{isThai ? 'เติมชื่อบริษัท/ที่อยู่จาก DBD ให้แล้ว — แก้ไขได้' : 'Pre-filled from DBD — editable'}</p>
                            : juristicLookupState === 'not_found'
                              ? <p className="mt-1 text-xs text-amber-600">{isThai ? 'ไม่พบในระบบ DBD — กรอกเองได้' : 'Not in DBD cache — fill in manually'}</p>
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
                    ) : googleConfig?.enabled ? (
                      // Google is available — don't ask for email/name manually;
                      // the user should pick Google above. Show a gentle prompt
                      // instead of two now-redundant input fields.
                      <div className="sm:col-span-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3">
                        <p className="text-sm text-slate-700">
                          {isThai
                            ? 'กดปุ่ม "Sign in with Google" ด้านบนเพื่อใช้บัญชี Google ของคุณ — ระบบจะดึงอีเมล+ชื่อให้อัตโนมัติ'
                            : 'Click "Sign in with Google" above — your name and email will be filled automatically.'}
                        </p>
                      </div>
                    ) : (
                      // Google sign-in unavailable (config missing). Fall back to
                      // manual entry so signup still works end-to-end.
                      <>
                        <div>
                          <label className="label">{isThai ? 'ชื่อผู้ดูแลบริษัท' : 'Administrator Name'}</label>
                          <input
                            className="input-field"
                            value={form.adminName}
                            onChange={(e) => setForm((prev) => ({ ...prev, adminName: e.target.value }))}
                            required={selectedPlan === 'free'}
                          />
                        </div>
                        <div>
                          <label className="label">{isThai ? 'อีเมลผู้ดูแล' : 'Admin Email'}</label>
                          <input
                            className="input-field"
                            type="email"
                            value={form.adminEmail}
                            onChange={(e) => setForm((prev) => ({ ...prev, adminEmail: e.target.value }))}
                            required={selectedPlan === 'free'}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="label">{isThai ? 'รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)' : 'Password (min 8 characters)'}</label>
                          <input
                            className="input-field"
                            type="password"
                            value={form.adminPassword}
                            onChange={(e) => setForm((prev) => ({ ...prev, adminPassword: e.target.value }))}
                            minLength={8}
                            required={selectedPlan === 'free'}
                            autoComplete="new-password"
                          />
                          <p className={inputGuide(false)}>
                            {isThai
                              ? 'ใช้สำหรับลงชื่อเข้าใช้ครั้งต่อไป — สามารถเปลี่ยนได้ภายหลัง'
                              : 'You will use this to sign in next time — changeable later.'}
                          </p>
                        </div>
                      </>
                    )}
                    <div className="sm:col-span-2">
                      <label className="label">{isThai ? 'ที่อยู่บริษัท (ไทย)' : 'Company Address (Thai)'}</label>
                      <textarea className={guardedInputClass(formValidation.addressTh, 'min-h-[96px]')} value={form.addressTh} onChange={(e) => setForm((prev) => ({ ...prev, addressTh: thaiTextOnly(e.target.value) }))} required />
                      {formErrors.addressTh
                        ? <p className="mt-1 text-xs text-red-600">{formErrors.addressTh}</p>
                        : <p className={inputGuide(false)}>{isThai ? 'ที่อยู่ภาษาไทย เช่น เลขที่ ถนน แขวง เขต จังหวัด รหัสไปรษณีย์' : 'Use Thai address text: street, district, province, postal code.'}</p>
                      }
                    </div>
                    </div>
                  </div>

                  {error && (
                    <div data-checkout-error className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
                      <span>{error}</span>
                    </div>
                  )}

                  {signupComplete && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      {isThai
                        ? `สร้างบัญชี Free ให้ ${signupComplete.adminEmail} แล้ว เข้าสู่ระบบด้วย Google หรืออีเมล/รหัสผ่านได้`
                        : `Free account created for ${signupComplete.adminEmail}. Sign in with Google or with your email + password.`}
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
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
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
                              ? 'หลังโอนชำระแล้ว ระบบจะตรวจสอบและเปิดบัญชีให้ภายใน 1 วันทำการ'
                              : 'After transfer, your account will be verified and activated within 1 business day.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <label className="flex items-start gap-3 text-sm text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.acceptedLegal}
                        onChange={(e) => setForm((prev) => ({ ...prev, acceptedLegal: e.target.checked }))}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        required
                      />
                      <span>
                        {t('signup.consent.legal', { defaultValue: isThai
                          ? 'ฉันได้อ่านและยอมรับ'
                          : 'I have read and accept the' })}{' '}
                        <a href="/terms" target="_blank" rel="noopener" className="text-emerald-700 underline">{t('signup.consent.terms', { defaultValue: isThai ? 'ข้อกำหนดการใช้บริการ' : 'Terms of Service' })}</a>
                        {', '}
                        <a href="/privacy" target="_blank" rel="noopener" className="text-emerald-700 underline">{t('signup.consent.privacy', { defaultValue: isThai ? 'นโยบายความเป็นส่วนตัว' : 'Privacy Policy' })}</a>
                        {' '}{isThai ? 'และ' : 'and'}{' '}
                        <a href="/legal/dpa" target="_blank" rel="noopener" className="text-emerald-700 underline">{t('signup.consent.dpa', { defaultValue: isThai ? 'ข้อตกลงการประมวลผลข้อมูล (DPA)' : 'Data Processing Agreement (DPA)' })}</a>
                      </span>
                    </label>
                    {formErrors.acceptedLegal && (
                      <p className="text-xs text-rose-600">{formErrors.acceptedLegal}</p>
                    )}
                    <label className="flex items-start gap-3 text-sm text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.marketingOptIn}
                        onChange={(e) => setForm((prev) => ({ ...prev, marketingOptIn: e.target.checked }))}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{t('signup.consent.marketing', { defaultValue: isThai
                        ? 'ยินดีรับข่าวสาร โปรโมชั่น และอัปเดตฟีเจอร์ใหม่ทางอีเมล (ยกเลิกได้ตลอดเวลา)'
                        : 'Send me product updates, tips, and promotions (you can unsubscribe at any time)' })}</span>
                    </label>
                  </div>

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
                <p className="text-xs font-semibold uppercase text-slate-300">
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
