import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Send, Plus, Trash2, CheckCircle, XCircle,
  Loader2, AlertTriangle, FileText, ArrowRight, Clock, Receipt, Truck,
  Download, Copy, ExternalLink, Eye, Share2, BriefcaseBusiness,
  ChevronDown, GitBranch, Maximize2,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';
import DeleteButton from '../components/ui/DeleteButton';
import CustomerFormModal from '../components/customer/CustomerFormModal';
import ProductFormModal from '../components/product/ProductFormModal';
import ProductPicker from '../components/product/ProductPicker';
import type { Customer, Product, Quotation, QuotationStatus } from '../types';
import {
  DEFAULT_SYSTEM_DOCUMENT_TEMPLATE_ID,
  DEFAULT_SYSTEM_DOCUMENT_TEMPLATE_SWATCHES,
  builtinDocumentTemplates,
} from '../lib/documentTemplatePresets';

// ใบเสนอราคา — Build (new/edit draft) + view (non-draft) + status actions
// in one page. Routed as:
//   /app/quotations/new       → new draft form
//   /app/quotations/:id       → view (or edit if status = 'draft')

const STATUS_META: Record<QuotationStatus, { th: string; en: string; tone: string }> = {
  draft:     { th: 'แบบร่าง',  en: 'Draft',     tone: 'bg-slate-100 text-slate-700' },
  sent:      { th: 'ส่งแล้ว',  en: 'Sent',      tone: 'bg-blue-100 text-blue-700' },
  accepted:  { th: 'ยอมรับ',   en: 'Accepted',  tone: 'bg-emerald-100 text-emerald-700' },
  converted: { th: 'แปลงแล้ว', en: 'Converted', tone: 'bg-primary-100 text-primary-700' },
  rejected:  { th: 'ปฏิเสธ',   en: 'Rejected',  tone: 'bg-rose-100 text-rose-700' },
  expired:   { th: 'หมดอายุ',  en: 'Expired',   tone: 'bg-amber-100 text-amber-700' },
  cancelled: { th: 'ยกเลิก',   en: 'Cancelled', tone: 'bg-slate-100 text-slate-500' },
};

interface ItemDraft {
  productId?: string | null;
  sectionTitle?: string | null;
  nameTh: string;
  nameEn?: string | null;
  descriptionTh?: string | null;
  descriptionEn?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountAmount: number;
  vatType: 'vat7' | 'vatExempt' | 'vatZero';
}

const blankItem: ItemDraft = {
  nameTh: '',
  descriptionTh: '',
  quantity: 1,
  unit: 'รายการ',
  unitPrice: 0,
  discountAmount: 0,
  vatType: 'vat7',
};

interface FormState {
  buyerId: string;
  projectId: string;
  quotationDate: string; // YYYY-MM-DD
  validUntil: string;    // YYYY-MM-DD or ''
  language: 'th' | 'en' | 'both';
  kind: QuotationKind;
  serviceDetails: {
    scope: string;
    deliverables: string;
    exclusions: string;
    duration: string;
    warranty: string;
    depositPercent: number;
    revisionRounds: number;
    revisionTerms: string;
    contractDuration: string;
    billingCycle: string;
    sla: string;
    cancellationTerms: string;
    securityDeposit: number;
    origin: string;
    destination: string;
    incoterms: string;
    shipmentMode: string;
    cargoDetails: string;
    currency: string;
    exchangeRate: number;
    freightCharge: number;
    localCharge: number;
    customsFee: number;
    insurance: number;
    milestones: Array<{ title: string; amount: number; dueDate: string; note: string }>;
  };
  templateId: string | null;
  items: ItemDraft[];
  discountAmount: number;
  feePercent: number;
  feeLabel: string;
  whtRate: '' | '1' | '3' | '5';
  notes: string;
  paymentTerms: string;
  deliveryTerms: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDaysIso = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
const STANDARD_TEMPLATE_VALUE = '__system_standard__';
const blankMilestone = () => ({ title: '', amount: 0, dueDate: '', note: '' });
type QuotationKind = 'general' | 'service' | 'service_project' | 'boq_contract' | 'recurring_rental' | 'logistics_import_export';
const QUOTATION_KIND_OPTIONS: Array<{ value: QuotationKind; th: string; en: string; hintTh: string; hintEn: string }> = [
  { value: 'general', th: 'สินค้า / ทั่วไป', en: 'Goods / general', hintTh: 'รายการสินค้า บริการ ค่าขนส่ง และเงื่อนไขส่งของ', hintEn: 'Goods, services, shipping, and delivery terms' },
  { value: 'service', th: 'งานบริการ', en: 'Services', hintTh: 'ขอบเขต สิ่งส่งมอบ สิ่งที่ไม่รวม และรับประกัน', hintEn: 'Scope, deliverables, exclusions, and warranty' },
  { value: 'service_project', th: 'Project / Scope งาน', en: 'Project / scoped work', hintTh: 'มัดจำ งวดงาน ระยะเวลา และเงื่อนไขแก้งาน', hintEn: 'Deposit, milestones, timeline, and revisions' },
  { value: 'boq_contract', th: 'BOQ / งานเหมา', en: 'BOQ / contract work', hintTh: 'แบ่งหมวดวัสดุ ค่าแรง งวดงาน และรับประกัน', hintEn: 'Grouped materials, labor, milestones, and warranty' },
  { value: 'recurring_rental', th: 'รายเดือน / Subscription / เช่า', en: 'Recurring / subscription / rental', hintTh: 'รอบบิล ระยะสัญญา SLA เงินประกัน และการยกเลิก', hintEn: 'Billing cycle, term, SLA, deposit, and cancellation' },
  { value: 'logistics_import_export', th: 'Logistics / Import-Export', en: 'Logistics / Import-Export', hintTh: 'ต้นทาง ปลายทาง Incoterms สกุลเงิน และค่าใช้จ่ายนำเข้า/ส่งออก', hintEn: 'Origin, destination, Incoterms, currency, and trade charges' },
];

interface ProjectOption {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

function projectDuration(project: ProjectOption): string {
  const start = project.startDate?.slice(0, 10);
  const end = project.endDate?.slice(0, 10);
  if (start && end) return `${start} ถึง ${end}`;
  if (start) return `เริ่ม ${start}`;
  if (end) return `สิ้นสุด ${end}`;
  return '';
}

function computeLine(item: ItemDraft) {
  const gross = item.quantity * item.unitPrice;
  const amount = Math.max(0, gross - ((gross * item.discountAmount) / 100));
  const vatRate = item.vatType === 'vat7' ? 0.07 : 0;
  const vatAmount = +(amount * vatRate).toFixed(2);
  const totalAmount = +(amount + vatAmount).toFixed(2);
  return { amount: +amount.toFixed(2), vatAmount, totalAmount };
}

export default function QuotationBuilder() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { isThai, formatCurrency } = useLanguage();

  const [existing, setExisting] = useState<Quotation | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  // Row index to fill when the product popup saves; null = append as a new line.
  const [addProductRow, setAddProductRow] = useState<number | null>(null);
  const [addProductName, setAddProductName] = useState('');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [revising, setRevising] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<'open' | 'download' | null>(null);
  const [copying, setCopying] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [quotePreviewHtml, setQuotePreviewHtml] = useState<string | null>(null);
  const [quotePreviewLoading, setQuotePreviewLoading] = useState(false);
  const [quotePreviewError, setQuotePreviewError] = useState<string | null>(null);
  const [quotePreviewPdfBusy, setQuotePreviewPdfBusy] = useState<'open' | 'download' | null>(null);
  const quotePreviewRef = useRef<HTMLDivElement | null>(null);
  const [quotePreviewScale, setQuotePreviewScale] = useState(0.52);

  const [form, setForm] = useState<FormState>({
    buyerId: '',
    projectId: '',
    quotationDate: todayIso(),
    validUntil: plusDaysIso(30),
    language: 'th',
    kind: 'general',
    serviceDetails: {
      scope: '',
      deliverables: '',
      exclusions: '',
      duration: '',
      warranty: '',
      depositPercent: 0,
      revisionRounds: 0,
      revisionTerms: '',
      contractDuration: '',
      billingCycle: '',
      sla: '',
      cancellationTerms: '',
      securityDeposit: 0,
      origin: '',
      destination: '',
      incoterms: '',
      shipmentMode: '',
      cargoDetails: '',
      currency: 'THB',
      exchangeRate: 0,
      freightCharge: 0,
      localCharge: 0,
      customsFee: 0,
      insurance: 0,
      milestones: [],
    },
    templateId: null,
    items: [blankItem],
    discountAmount: 0,
    feePercent: 0,
    feeLabel: '',
    whtRate: '',
    notes: '',
    paymentTerms: 'ชำระภายใน 30 วันหลังได้รับใบกำกับภาษี',
    deliveryTerms: '',
  });

  // Load customers + (if editing) the existing quotation
  useEffect(() => {
    if (!token) return;
    (async () => {
      const headers = { Authorization: `Bearer ${token}` };
      const [custRes, projectRes, productRes] = await Promise.all([
        fetch('/api/customers?limit=200', { headers }),
        fetch('/api/projects?status=active', { headers }),
        fetch('/api/products?limit=500', { headers }),
      ]);
      const [custJson, projectJson, productJson] = await Promise.all([custRes.json(), projectRes.json(), productRes.json()]);
      setCustomers(custJson.data ?? []);
      setProjects(projectJson.data ?? []);
      setProducts(productJson.data ?? []);
      if (!isNew && id) {
        const res = await fetch(`/api/quotations/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const json = await res.json();
          const q: Quotation = json.data;
          setExisting(q);
          setForm({
            buyerId: q.buyerId,
            projectId: q.projectId ?? '',
            quotationDate: q.quotationDate.slice(0, 10),
            validUntil: q.validUntil ? q.validUntil.slice(0, 10) : '',
            language: q.language,
            kind: q.kind ?? 'general',
            serviceDetails: {
              scope: q.serviceDetails?.scope ?? '',
              deliverables: q.serviceDetails?.deliverables ?? '',
              exclusions: q.serviceDetails?.exclusions ?? '',
              duration: q.serviceDetails?.duration ?? '',
              warranty: q.serviceDetails?.warranty ?? '',
              depositPercent: q.serviceDetails?.depositPercent ?? 0,
              revisionRounds: q.serviceDetails?.revisionRounds ?? 0,
              revisionTerms: q.serviceDetails?.revisionTerms ?? '',
              contractDuration: q.serviceDetails?.contractDuration ?? '',
              billingCycle: q.serviceDetails?.billingCycle ?? '',
              sla: q.serviceDetails?.sla ?? '',
              cancellationTerms: q.serviceDetails?.cancellationTerms ?? '',
              securityDeposit: q.serviceDetails?.securityDeposit ?? 0,
              origin: q.serviceDetails?.origin ?? '',
              destination: q.serviceDetails?.destination ?? '',
              incoterms: q.serviceDetails?.incoterms ?? '',
              shipmentMode: q.serviceDetails?.shipmentMode ?? '',
              cargoDetails: q.serviceDetails?.cargoDetails ?? '',
              currency: q.serviceDetails?.currency ?? 'THB',
              exchangeRate: q.serviceDetails?.exchangeRate ?? 0,
              freightCharge: q.serviceDetails?.freightCharge ?? 0,
              localCharge: q.serviceDetails?.localCharge ?? 0,
              customsFee: q.serviceDetails?.customsFee ?? 0,
              insurance: q.serviceDetails?.insurance ?? 0,
              milestones: (q.serviceDetails?.milestones ?? []).map((milestone) => ({
                title: milestone.title,
                amount: milestone.amount,
                dueDate: milestone.dueDate ?? '',
                note: milestone.note ?? '',
              })),
            },
            templateId: q.templateId ?? null,
            items: q.items.map((it) => ({
              productId: it.productId ?? null,
              sectionTitle: it.sectionTitle ?? '',
              nameTh: it.nameTh,
              nameEn: it.nameEn ?? null,
              descriptionTh: it.descriptionTh ?? '',
              descriptionEn: it.descriptionEn ?? null,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              discountAmount: it.discountAmount,
              vatType: it.vatType,
            })),
            discountAmount: q.discountAmount,
            feePercent: q.feePercent ?? 0,
            feeLabel: q.feeLabel ?? '',
            whtRate: (q.whtRate as FormState['whtRate']) ?? '',
            notes: q.notes ?? '',
            paymentTerms: q.paymentTerms ?? '',
            deliveryTerms: q.deliveryTerms ?? '',
          });
        }
        setLoading(false);
      }
    })();
  }, [token, id, isNew]);

  const editable = isNew || existing?.status === 'draft';
  const totals = useMemo(() => {
    const lines = form.items.map(computeLine);
    const subtotal = +lines.reduce((s, l) => s + l.amount, 0).toFixed(2);
    const itemVat = lines.reduce((s, l) => s + l.vatAmount, 0);
    const pct = form.feePercent > 0 ? form.feePercent : 0;
    const feeAmount = +((subtotal * pct) / 100).toFixed(2);
    const feeVat = +(feeAmount * 0.07).toFixed(2);
    const vatAmount = +(itemVat + feeVat).toFixed(2);
    const total = +(subtotal + feeAmount + vatAmount - form.discountAmount).toFixed(2);
    const whtRateNum = form.whtRate ? parseFloat(form.whtRate) : 0;
    const whtAmount = whtRateNum > 0 ? +(((subtotal + feeAmount) * whtRateNum) / 100).toFixed(2) : 0;
    const netPayable = +(total - whtAmount).toFixed(2);
    return { lines, subtotal, feeAmount, vatAmount, total, whtAmount, netPayable };
  }, [form.items, form.discountAmount, form.feePercent, form.whtRate]);
  const milestoneTotal = useMemo(
    () => +form.serviceDetails.milestones.reduce((sum, milestone) => sum + (Number(milestone.amount) || 0), 0).toFixed(2),
    [form.serviceDetails.milestones],
  );
  const hasStructuredDetails = form.kind !== 'general';
  const supportsProject = form.kind === 'service_project' || form.kind === 'boq_contract';
  const supportsMilestones = form.kind === 'service_project' || form.kind === 'boq_contract';
  const supportsRevisions = form.kind === 'service' || form.kind === 'service_project';
  const supportsRecurringTerms = form.kind === 'recurring_rental';
  const supportsLogisticsTerms = form.kind === 'logistics_import_export';
  const boqSectionTotals = useMemo(() => {
    const sections = new Map<string, number>();
    form.items.forEach((item) => {
      const title = item.sectionTitle?.trim();
      if (!title) return;
      sections.set(title, (sections.get(title) ?? 0) + computeLine(item).amount);
    });
    return [...sections.entries()];
  }, [form.items]);

  function setItem(idx: number, patch: Partial<ItemDraft>) {
    setForm((prev) => ({ ...prev, items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, { ...blankItem }] }));
  }
  function productToItemPatch(p: Product): Partial<ItemDraft> {
    return {
      productId: p.id,
      nameTh: p.nameTh,
      nameEn: p.nameEn ?? '',
      descriptionTh: p.descriptionTh ?? '',
      descriptionEn: p.descriptionEn ?? '',
      unit: p.unit || 'รายการ',
      unitPrice: p.unitPrice,
      vatType: p.vatType,
    };
  }
  // Open the "add new product" popup from a line (idx) or the header (idx=null).
  function openAddProduct(idx: number | null, typedName = '') {
    setAddProductRow(idx);
    setAddProductName(typedName);
    setShowAddProduct(true);
  }
  function removeItem(idx: number) {
    setForm((prev) => ({ ...prev, items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== idx) : prev.items }));
  }

  function setMilestone(idx: number, patch: Partial<FormState['serviceDetails']['milestones'][number]>) {
    setForm((prev) => ({
      ...prev,
      serviceDetails: {
        ...prev.serviceDetails,
        milestones: prev.serviceDetails.milestones.map((milestone, index) => index === idx ? { ...milestone, ...patch } : milestone),
      },
    }));
  }

  function selectProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    setForm((prev) => ({
      ...prev,
      projectId,
      serviceDetails: project ? {
        ...prev.serviceDetails,
        scope: prev.serviceDetails.scope || project.description || '',
        duration: prev.serviceDetails.duration || projectDuration(project),
      } : prev.serviceDetails,
    }));
  }

  const surfaceError = useCallback((errJson: { error?: string; details?: Array<{ path?: (string|number)[]; message?: string }> }) => {
    if (errJson.details && errJson.details.length > 0) {
      const fields = errJson.details.map((d) => `${(d.path ?? []).join('.')}: ${d.message ?? ''}`).join(' · ');
      return fields;
    }
    return errJson.error ?? 'Save failed';
  }, []);

  const refreshExistingQuotationStatus = useCallback(async () => {
    if (!token || !id || isNew) return null;
    const res = await fetch(`/api/quotations/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: Quotation };
    if (json.data) setExisting(json.data);
    return json.data ?? null;
  }, [id, isNew, token]);

  // Live preview: re-render the quotation HTML from current form data
  // (debounced) whenever the form changes, like the invoice builder.
  useEffect(() => {
    if (!token) return;
    if (!form.items.some((it) => it.nameTh.trim())) {
      setQuotePreviewHtml(null);
      setQuotePreviewError(null);
      setQuotePreviewLoading(false);
      return;
    }
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setQuotePreviewLoading(true);
      setQuotePreviewError(null);
      try {
        const res = await fetch('/api/quotations/preview?format=html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(buildBody()),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error ?? (isThai ? 'สร้างตัวอย่างไม่สำเร็จ' : 'Preview failed'));
        }
        setQuotePreviewHtml(await res.text());
      } catch (error) {
        if (controller.signal.aborted) return;
        setQuotePreviewError(error instanceof Error ? error.message : (isThai ? 'สร้างตัวอย่างไม่สำเร็จ' : 'Preview failed'));
      } finally {
        if (!controller.signal.aborted) setQuotePreviewLoading(false);
      }
    }, 600);
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, form]);

  useEffect(() => {
    const node = quotePreviewRef.current;
    if (!node) return;
    const updateScale = () => {
      const width = node.clientWidth;
      if (!width) return;
      setQuotePreviewScale(Math.min(Math.max((width - 32) / 794, 0.38), 0.68));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, [quotePreviewHtml]);

  // Body shared by save + live preview. Excludes buyerId (preview uses a
  // sample buyer; save adds the real buyerId).
  function buildBody() {
    return {
        projectId: supportsProject ? form.projectId || null : null,
        quotationDate: form.quotationDate,
        validUntil: form.validUntil || null,
        language: form.language,
        kind: form.kind,
        serviceDetails: form.kind !== 'general' ? {
          scope: form.serviceDetails.scope || null,
          deliverables: form.serviceDetails.deliverables || null,
          exclusions: form.serviceDetails.exclusions || null,
          duration: form.serviceDetails.duration || null,
          warranty: form.serviceDetails.warranty || null,
          depositPercent: supportsMilestones ? Number(form.serviceDetails.depositPercent) || 0 : null,
          revisionRounds: supportsRevisions ? Number(form.serviceDetails.revisionRounds) || 0 : null,
          revisionTerms: supportsRevisions ? form.serviceDetails.revisionTerms || null : null,
          contractDuration: supportsRecurringTerms ? form.serviceDetails.contractDuration || null : null,
          billingCycle: supportsRecurringTerms ? form.serviceDetails.billingCycle || null : null,
          sla: supportsRecurringTerms ? form.serviceDetails.sla || null : null,
          cancellationTerms: supportsRecurringTerms ? form.serviceDetails.cancellationTerms || null : null,
          securityDeposit: supportsRecurringTerms ? Number(form.serviceDetails.securityDeposit) || 0 : null,
          origin: supportsLogisticsTerms ? form.serviceDetails.origin || null : null,
          destination: supportsLogisticsTerms ? form.serviceDetails.destination || null : null,
          incoterms: supportsLogisticsTerms ? form.serviceDetails.incoterms || null : null,
          shipmentMode: supportsLogisticsTerms ? form.serviceDetails.shipmentMode || null : null,
          cargoDetails: supportsLogisticsTerms ? form.serviceDetails.cargoDetails || null : null,
          currency: supportsLogisticsTerms ? form.serviceDetails.currency || 'THB' : null,
          exchangeRate: supportsLogisticsTerms ? Number(form.serviceDetails.exchangeRate) || 0 : null,
          freightCharge: supportsLogisticsTerms ? Number(form.serviceDetails.freightCharge) || 0 : null,
          localCharge: supportsLogisticsTerms ? Number(form.serviceDetails.localCharge) || 0 : null,
          customsFee: supportsLogisticsTerms ? Number(form.serviceDetails.customsFee) || 0 : null,
          insurance: supportsLogisticsTerms ? Number(form.serviceDetails.insurance) || 0 : null,
          milestones: supportsMilestones ? form.serviceDetails.milestones
            .filter((milestone) => milestone.title.trim())
            .map((milestone) => ({
              title: milestone.title,
              amount: Number(milestone.amount) || 0,
              dueDate: milestone.dueDate || null,
              note: milestone.note || null,
            })) : [],
        } : null,
        templateId: form.templateId,
        items: form.items.map((it) => ({
          productId: it.productId ?? null,
          sectionTitle: form.kind === 'boq_contract' ? it.sectionTitle || null : null,
          nameTh: it.nameTh,
          nameEn: it.nameEn ?? null,
          descriptionTh: it.descriptionTh?.trim() || null,
          descriptionEn: it.descriptionEn?.trim() || null,
          quantity: Number(it.quantity),
          unit: it.unit,
          unitPrice: Number(it.unitPrice),
          discountAmount: Number(it.discountAmount),
          vatType: it.vatType,
        })),
        discountAmount: Number(form.discountAmount),
        feePercent: form.feePercent > 0 ? Number(form.feePercent) : null,
        feeLabel: form.feePercent > 0 ? (form.feeLabel.trim() || null) : null,
        whtRate: form.whtRate || null,
        notes: form.notes || null,
        paymentTerms: form.paymentTerms || null,
        deliveryTerms: form.deliveryTerms || null,
    };
  }

  async function save(action: 'draft' | 'send') {
    if (!token) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = { buyerId: form.buyerId, ...buildBody() };

      const url = isNew ? '/api/quotations' : `/api/quotations/${id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json() as { data?: Quotation; error?: string; details?: Array<{ path?: (string|number)[]; message?: string }> };
      if (!res.ok) {
        const message = surfaceError(json);
        if (!isNew && message.includes("Cannot edit a quotation in status 'sent'")) {
          await refreshExistingQuotationStatus();
          setMsg({
            type: 'ok',
            text: isThai
              ? 'ใบเสนอราคานี้ถูกส่งแล้ว ระบบเปลี่ยนเป็นหน้าส่งให้ลูกค้าให้แล้ว'
              : 'This quotation has already been sent. The send view is now open.',
          });
          return;
        }
        throw new Error(message);
      }
      const savedQuotation = json.data;
      const savedId = savedQuotation?.id ?? id;
      if (savedQuotation) setExisting(savedQuotation);
      if (!savedId) throw new Error(isThai ? 'บันทึกไม่สำเร็จ' : 'Save failed');

      if (action === 'send') {
        const sendRes = await fetch(`/api/quotations/${savedId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'sent' }),
        });
        const sendJson = await sendRes.json() as { data?: Quotation; error?: string; details?: Array<{ path?: (string|number)[]; message?: string }> };
        if (!sendRes.ok) {
          throw new Error(surfaceError(sendJson));
        }
        if (sendJson.data) setExisting(sendJson.data);
      }

      setMsg({
        type: 'ok',
        text: action === 'send'
          ? (isThai ? 'บันทึกแล้ว พร้อมส่งให้ลูกค้า' : 'Saved and ready to send')
          : (isThai ? 'บันทึกแล้ว' : 'Saved'),
      });
      navigate(`/app/quotations/${savedId}`, { replace: !isNew });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(newStatus: QuotationStatus, reason?: string) {
    if (!token || !id) return;
    setActing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/quotations/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(surfaceError(json));
      setExisting(json.data);
      setMsg({ type: 'ok', text: isThai ? 'อัปเดตสถานะแล้ว' : 'Status updated' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setActing(false);
    }
  }

  async function convertToInvoice() {
    if (!id) return;
    navigate(`/app/invoices/new?fromQuotation=${encodeURIComponent(id)}`);
  }

  async function reviseQuotation() {
    if (!token || !id) return;
    setRevising(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/quotations/${id}/revise`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(surfaceError(json));
      const newId = (json.data as { id: string }).id;
      setMsg({ type: 'ok', text: isThai ? 'สร้างฉบับแก้ไขแล้ว' : 'Revision draft created' });
      navigate(`/app/quotations/${newId}`);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setRevising(false);
    }
  }

  async function createDeliveryNote() {
    if (!token || !id) return;
    setActing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/delivery-notes/from-quotation/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 409 && json.data?.id) {
          navigate(`/app/delivery-notes/${json.data.id}`);
          return;
        }
        throw new Error(surfaceError(json));
      }
      navigate(`/app/delivery-notes/${json.data.id}`);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setActing(false);
    }
  }

  const customerName = useMemo(() => {
    const selected = customers.find((c) => c.id === form.buyerId);
    return selected?.nameTh || selected?.nameEn || existing?.buyer?.nameTh || existing?.buyer?.nameEn || (isThai ? 'ลูกค้า' : 'customer');
  }, [customers, existing?.buyer?.nameEn, existing?.buyer?.nameTh, form.buyerId, isThai]);

  const minimalTemplates = builtinDocumentTemplates.filter((template) => template.tagEn === 'Minimal');
  const cuteTemplates = builtinDocumentTemplates.filter((template) => template.tagEn === 'Cute');
  const selectedTemplate =
    builtinDocumentTemplates.find((template) => template.id === (form.templateId ?? DEFAULT_SYSTEM_DOCUMENT_TEMPLATE_ID)) ??
    null;
  const selectedKind = QUOTATION_KIND_OPTIONS.find((option) => option.value === form.kind) ?? QUOTATION_KIND_OPTIONS[0];
  const isSuperseded = Boolean(existing?.supersededById);
  const canCreateRevision = Boolean(existing && !editable && !isSuperseded && ['sent', 'accepted', 'rejected', 'expired'].includes(existing.status));
  const latestRevision = existing?.revisionHistory?.find((revision) => revision.id === existing.latestRevisionId);

  const buildCustomerMessage = useCallback((link?: string) => {
    const number = existing?.quotationNumber ?? (isThai ? 'ใบเสนอราคา' : 'quotation');
    const totalText = formatCurrency(totals.total);
    const resolvedLink = link ?? shareUrl;
    if (isThai) {
      return [
        `เรียน ${customerName}`,
        `ส่งใบเสนอราคาเลขที่ ${number} ยอดรวม ${totalText}`,
        form.validUntil ? `ราคาใช้ได้ถึง ${form.validUntil}` : null,
        resolvedLink ? `เปิดดูและตอบรับได้ที่: ${resolvedLink}` : 'รายละเอียดอยู่ในไฟล์ PDF ที่แนบมาด้วยครับ/ค่ะ',
      ].filter(Boolean).join('\n');
    }
    return [
      `Dear ${customerName},`,
      `Please find quotation ${number} for ${totalText}.`,
      form.validUntil ? `Valid until ${form.validUntil}.` : null,
      resolvedLink ? `Review and respond here: ${resolvedLink}` : 'The PDF is attached for your review.',
    ].filter(Boolean).join('\n');
  }, [customerName, existing?.quotationNumber, form.validUntil, formatCurrency, isThai, shareUrl, totals.total]);

  const sendMessage = useMemo(() => buildCustomerMessage(), [buildCustomerMessage]);

  async function openQuotationPdf(mode: 'open' | 'download') {
    if (!token || !existing) return;
    setPdfBusy(mode);
    setMsg(null);
    try {
      const res = await fetch(`/api/quotations/${existing.id}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(isThai ? 'สร้างไฟล์ PDF ไม่สำเร็จ' : 'Could not create the PDF');
      const blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (mode === 'open') {
        window.open(url, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${existing.quotationNumber}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setPdfBusy(null);
    }
  }

  async function openCurrentPreviewPdf(mode: 'open' | 'download') {
    if (!token || !quotePreviewHtml) return;
    setQuotePreviewPdfBusy(mode);
    setQuotePreviewError(null);
    try {
      const res = await fetch('/api/quotations/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildBody()),
      });
      if (!res.ok) throw new Error(isThai ? 'สร้างไฟล์ PDF ไม่สำเร็จ' : 'Could not create the PDF');
      const blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (mode === 'open') {
        window.open(url, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `quotation-preview-${new Date().toISOString().slice(0, 10)}.pdf`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
    } catch (error) {
      setQuotePreviewError(error instanceof Error ? error.message : (isThai ? 'สร้างไฟล์ PDF ไม่สำเร็จ' : 'Could not create the PDF'));
    } finally {
      setQuotePreviewPdfBusy(null);
    }
  }

  async function copySendMessage() {
    const url = await ensureShareLink();
    if (!url && existing?.status === 'sent') return;
    setCopying(true);
    setMsg(null);
    try {
      await navigator.clipboard.writeText(buildCustomerMessage(url ?? undefined));
      setMsg({ type: 'ok', text: isThai ? 'คัดลอกข้อความส่งลูกค้าแล้ว' : 'Customer message copied' });
    } catch {
      setMsg({ type: 'err', text: isThai ? 'คัดลอกไม่ได้ กรุณาคัดลอกข้อความเอง' : 'Could not copy. Please copy it manually.' });
    } finally {
      setCopying(false);
    }
  }

  async function ensureShareLink(): Promise<string | null> {
    if (!token || !existing) return null;
    if (shareUrl) return shareUrl;
    setShareBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/quotations/${existing.id}/share-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json() as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Failed to create link');
      setShareUrl(body.url);
      return body.url;
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
      return null;
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareLink() {
    const url = await ensureShareLink();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMsg({ type: 'ok', text: isThai ? 'คัดลอกลิงก์ใบเสนอราคาแล้ว' : 'Quotation link copied' });
    } catch {
      setMsg({ type: 'err', text: isThai ? 'คัดลอกลิงก์ไม่ได้ กรุณาคัดลอกจากช่องข้อความ' : 'Could not copy the link.' });
    }
  }

  async function openLineShare() {
    const url = await ensureShareLink();
    if (!url) return;
    const message = buildCustomerMessage(url);
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  async function openCustomerPage() {
    const url = await ensureShareLink();
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;
  }

  return (
    <div className="mx-auto max-w-[1540px]">
    <div className="grid gap-4 lg:grid-cols-[minmax(620px,820px)_minmax(420px,1fr)] lg:items-start">
    <div className="space-y-4 min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/app/quotations" className="text-gray-500 hover:text-gray-800"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? (isThai ? 'สร้างใบเสนอราคา' : 'New quotation') : existing?.quotationNumber}
            </h1>
            {existing && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_META[existing.status].tone}`}>
                <Clock className="w-3 h-3" />
                {isThai ? STATUS_META[existing.status].th : STATUS_META[existing.status].en}
              </span>
            )}
          </div>
        </div>

        {/* Primary actions */}
        {editable ? (
          <div className="flex gap-2">
            <button onClick={() => save('draft')} disabled={saving} className="btn-secondary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isThai ? 'บันทึกแบบร่าง' : 'Save draft'}
            </button>
            <button onClick={() => save('send')} disabled={saving} className="btn-primary">
              <Send className="w-4 h-4" />
              {isThai ? 'บันทึกและไปหน้าส่ง' : 'Save and prepare'}
            </button>
          </div>
        ) : existing && (
          <div className="flex flex-wrap justify-end gap-2">
            {canCreateRevision && (
              <button onClick={reviseQuotation} disabled={revising} className="btn-primary">
                {revising ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
                {isThai ? 'แก้ไขแล้วส่งใหม่' : 'Revise and resend'}
              </button>
            )}
            <button onClick={() => openQuotationPdf('open')} disabled={pdfBusy !== null} className="btn-secondary">
              {pdfBusy === 'open' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {isThai ? 'เปิด PDF' : 'Open PDF'}
            </button>
            <button onClick={() => openQuotationPdf('download')} disabled={pdfBusy !== null} className="btn-secondary">
              {pdfBusy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isThai ? 'ดาวน์โหลด PDF' : 'Download PDF'}
            </button>
            {!isSuperseded && existing.status === 'accepted' && (
              <>
                <button onClick={createDeliveryNote} disabled={acting} className="btn-secondary">
                  {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                  {isThai ? 'ออกใบส่งของ' : 'Create delivery note'}
                </button>
                <button onClick={convertToInvoice} disabled={acting} className="btn-primary">
                  {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {isThai ? 'ออกใบกำกับภาษี' : 'Convert to tax invoice'}
                </button>
              </>
            )}
            {existing.status === 'converted' && existing.convertedToInvoiceId && (
              <Link to={`/app/invoices/${existing.convertedToInvoiceId}/edit`} className="btn-primary">
                <Receipt className="w-4 h-4" /> {isThai ? 'ดูใบกำกับภาษี' : 'View tax invoice'}
              </Link>
            )}
          </div>
        )}
      </div>

      {msg && (
        <div className={`flex items-start gap-2 text-sm p-3 rounded-lg ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {existing && isSuperseded && (
        <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold">{isThai ? 'ใบเสนอราคานี้ถูกแทนที่แล้ว' : 'This quotation was replaced'}</p>
              <p className="mt-1 text-amber-800">
                {isThai
                  ? `ระบบเก็บฉบับนี้ไว้เป็นประวัติ ${latestRevision ? `ฉบับล่าสุดคือ ${latestRevision.quotationNumber}` : 'กรุณาเปิดฉบับล่าสุดก่อนส่งให้ลูกค้า'}`
                  : `This copy remains as history. ${latestRevision ? `Latest revision: ${latestRevision.quotationNumber}` : 'Open the latest revision before sending.'}`}
              </p>
            </div>
            {existing.latestRevisionId && existing.latestRevisionId !== existing.id && (
              <button onClick={() => navigate(`/app/quotations/${existing.latestRevisionId}`)} className="btn-secondary shrink-0">
                <ArrowRight className="w-4 h-4" />
                {isThai ? 'เปิดฉบับล่าสุด' : 'Open latest'}
              </button>
            )}
          </div>
        </div>
      )}

      {existing && !editable && !isSuperseded && existing.status !== 'cancelled' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-base font-semibold text-slate-900">
                {isThai ? 'ส่งให้ลูกค้า' : 'Send to customer'}
              </p>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                {isThai
                  ? 'ลิงก์เดียวให้ลูกค้าเปิด PDF และตอบรับหรือปฏิเสธได้ โดยไม่ต้อง login'
                  : 'One link lets the customer open the PDF and accept or reject without logging in.'}
              </p>
            </div>
            <button onClick={openLineShare} className="btn-primary shrink-0">
              <ExternalLink className="w-4 h-4" />
              {isThai ? 'ส่งทาง LINE' : 'Send via LINE'}
            </button>
          </div>

          <div className="grid gap-4 pt-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,1fr)]">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {isThai ? 'ลิงก์ลูกค้า' : 'Customer link'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={openCustomerPage} disabled={shareBusy} className="btn-secondary text-xs">
                    {shareBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    {isThai ? 'เปิดดู' : 'Open'}
                  </button>
                  <button onClick={copyShareLink} disabled={shareBusy} className="btn-secondary text-xs">
                    {shareBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                    {isThai ? 'คัดลอก' : 'Copy'}
                  </button>
                </div>
              </div>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                readOnly
                value={shareUrl || (isThai ? 'ยังไม่ได้สร้างลิงก์' : 'Link not created yet')}
                onFocus={(event) => event.currentTarget.select()}
              />
              <p className="text-xs leading-5 text-slate-500">
                {isThai ? 'กดคัดลอกหรือส่งทาง LINE เพื่อสร้างลิงก์อัตโนมัติ' : 'Copy or send via LINE to create the link automatically.'}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {isThai ? 'ข้อความพร้อมส่ง' : 'Ready-to-send message'}
                </p>
                <button onClick={copySendMessage} disabled={copying} className="btn-secondary text-xs">
                  {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                  {isThai ? 'คัดลอกข้อความ' : 'Copy message'}
                </button>
              </div>
              <textarea
                className="min-h-[116px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700"
                rows={isThai ? 4 : 5}
                readOnly
                value={sendMessage}
              />
            </div>
          </div>

          {existing.status === 'sent' && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                {isThai ? 'เมื่อได้คำตอบจากลูกค้า ให้ปรับสถานะดีลตรงนี้' : 'After the customer responds, update the deal status here.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => changeStatus('accepted')} disabled={acting} className="btn-secondary text-xs">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> {isThai ? 'ลูกค้ายอมรับ' : 'Accepted'}
                </button>
                <button onClick={() => changeStatus('rejected')} disabled={acting} className="btn-secondary text-xs">
                  <XCircle className="w-4 h-4 text-rose-600" /> {isThai ? 'ปฏิเสธ' : 'Rejected'}
                </button>
                <button onClick={() => changeStatus('cancelled')} disabled={acting} className="btn-secondary text-xs text-rose-600">
                  <Trash2 className="w-4 h-4" /> {isThai ? 'ยกเลิก' : 'Cancel'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {existing?.revisionHistory && existing.revisionHistory.length > 1 && (
        <div className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <GitBranch className="mt-0.5 h-5 w-5 text-primary-700" />
              <div>
                <h3 className="font-semibold text-slate-900">{isThai ? 'ประวัติฉบับแก้ไข' : 'Revision history'}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {isThai ? 'รายการปกติจะแสดงเฉพาะฉบับล่าสุด ฉบับเก่ายังเปิดได้เพื่ออ้างอิง' : 'Lists show only the latest active copy; older versions remain available for audit.'}
                </p>
              </div>
            </div>
            {canCreateRevision && (
              <button onClick={reviseQuotation} disabled={revising} className="btn-secondary shrink-0">
                {revising ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
                {isThai ? 'สร้างฉบับใหม่' : 'Create revision'}
              </button>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {existing.revisionHistory.map((revision) => {
              const active = revision.id === existing.id;
              const latest = revision.id === existing.latestRevisionId;
              return (
                <button
                  key={revision.id}
                  type="button"
                  onClick={() => navigate(`/app/quotations/${revision.id}`)}
                  className={`border px-3 py-2 text-left text-xs transition ${
                    active ? 'border-primary-300 bg-primary-50 text-primary-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block font-semibold">
                    {revision.revisionNo > 0 ? `R${revision.revisionNo}` : isThai ? 'ต้นฉบับ' : 'Original'}
                    {latest ? (isThai ? ' · ล่าสุด' : ' · Latest') : ''}
                  </span>
                  <span className="block font-mono">{revision.quotationNumber}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="h-4 w-4 text-primary-700" />
          <h3 className="font-semibold text-gray-900">{isThai ? 'ลักษณะใบเสนอราคา' : 'Quotation type'}</h3>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
          <select
            value={form.kind}
            onChange={(e) => {
              const kind = e.target.value as QuotationKind;
              setForm((prev) => ({ ...prev, kind, projectId: kind === 'service_project' || kind === 'boq_contract' ? prev.projectId : '' }));
            }}
            className="input-field"
            disabled={!editable}
          >
            {QUOTATION_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{isThai ? option.th : option.en}</option>
            ))}
          </select>
          <p className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            {isThai ? selectedKind.hintTh : selectedKind.hintEn}
          </p>
        </div>
      </div>

      {/* Customer + dates */}
      <div className="card grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <label className="label">{isThai ? 'ลูกค้า' : 'Customer'}</label>
            {editable && (
              <button
                type="button"
                onClick={() => setShowAddCustomer(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800"
              >
                <Plus className="h-3.5 w-3.5" />
                {isThai ? 'เพิ่มลูกค้าใหม่' : 'Add new customer'}
              </button>
            )}
          </div>
          <select
            value={form.buyerId}
            onChange={(e) => setForm({ ...form, buyerId: e.target.value })}
            className="input-field"
            disabled={!editable}
          >
            <option value="">{isThai ? '— เลือกลูกค้า —' : '— Select customer —'}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.nameTh} ({c.taxId})</option>
            ))}
          </select>
          {!form.buyerId && (
            <p className="text-xs text-gray-500 mt-1">
              {isThai ? 'ยังไม่มีลูกค้า? กด ' : 'No customers yet? Tap '}
              <button type="button" onClick={() => setShowAddCustomer(true)} className="text-primary-600 underline">{isThai ? 'เพิ่มลูกค้าใหม่' : 'Add a new customer'}</button>
            </p>
          )}
        </div>
        <div>
          <label className="label">{isThai ? 'วันที่' : 'Date'}</label>
          <input type="date" value={form.quotationDate} onChange={(e) => setForm({ ...form, quotationDate: e.target.value })} className="input-field" disabled={!editable} />
        </div>
        <div>
          <label className="label">{isThai ? 'หมดอายุ' : 'Valid until'}</label>
          <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className="input-field" disabled={!editable} />
        </div>
        <div>
          <label className="label">{isThai ? 'ภาษาเอกสาร' : 'Document language'}</label>
          <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as FormState['language'] })} className="input-field" disabled={!editable}>
            <option value="th">ไทย</option>
            <option value="en">English</option>
            <option value="both">ไทย + English</option>
          </select>
        </div>
        <div className="min-w-0 sm:col-span-3">
          <label className="label">{isThai ? 'รูปแบบใบเสนอราคา' : 'Quotation template'}</label>
          <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
            <select
              value={form.templateId ?? STANDARD_TEMPLATE_VALUE}
              onChange={(e) => setForm({ ...form, templateId: e.target.value === STANDARD_TEMPLATE_VALUE ? null : e.target.value })}
              className="input-field min-w-0 max-w-full"
              disabled={!editable}
            >
              <option value={STANDARD_TEMPLATE_VALUE}>
                {isThai ? 'ขาว-ดำ · ทางการ (ค่าเริ่มต้น)' : 'Mono · Formal (default)'}
              </option>
              <optgroup label={isThai ? 'เรียบง่าย / ทางการ' : 'Minimal / official'}>
                {minimalTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{isThai ? template.nameTh : template.nameEn}</option>
                ))}
              </optgroup>
              <optgroup label={isThai ? 'สีพาสเทล / ร้านค้า' : 'Pastel / shop'}>
                {cuteTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{isThai ? template.nameTh : template.nameEn}</option>
                ))}
              </optgroup>
            </select>
            <div className="flex min-w-0 items-center gap-2 border border-slate-200 bg-slate-50 px-3 py-2">
              {(selectedTemplate?.swatches ?? DEFAULT_SYSTEM_DOCUMENT_TEMPLATE_SWATCHES).map((swatch, index) => (
                <span key={`${swatch}-${index}`} className={`h-4 w-4 border border-slate-200 ${swatch}`} />
              ))}
              <span className="min-w-0 truncate text-xs font-medium text-slate-600">
                {selectedTemplate
                  ? (isThai ? selectedTemplate.descriptionTh : selectedTemplate.descriptionEn)
                  : (isThai ? 'เอกสารทางการ อ่านง่าย เหมาะกับการเสนอราคาทั่วไป' : 'Official, readable A4 layout for everyday quotations')}
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {isThai ? 'รูปแบบนี้จะใช้ทั้ง PDF และลิงก์ที่ส่งให้ลูกค้า' : 'This template is used for both the PDF and the customer share link.'}
          </p>
        </div>
      </div>

      {hasStructuredDetails && (
        <div className="card space-y-4">
          <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
            <BriefcaseBusiness className="mt-0.5 h-5 w-5 text-primary-700" />
            <div>
              <h3 className="font-semibold text-slate-900">{isThai ? 'รายละเอียดเพิ่มเติม' : 'Additional details'}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {isThai ? selectedKind.hintTh : selectedKind.hintEn}
              </p>
            </div>
          </div>

          {supportsProject && (
            <div>
              <label className="label">{isThai ? 'ผูกกับโปรเจกต์' : 'Linked project'}</label>
              <select value={form.projectId} onChange={(e) => selectProject(e.target.value)} className="input-field" disabled={!editable}>
                <option value="">{isThai ? 'ไม่ผูกโปรเจกต์' : 'No linked project'}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                {projects.length === 0
                  ? (isThai ? 'ยังไม่มีโปรเจกต์ คุณยังกรอกใบเสนอราคาได้' : 'No projects yet. You can still complete this quotation.')
                  : (isThai ? 'เลือกโปรเจกต์เดิม หรือกรอกเฉพาะใบเสนอราคานี้' : 'Reuse an existing project or enter quote-only details.')}
                {' '}
                <Link to="/app/projects" className="font-medium text-primary-700 hover:underline">
                  {isThai ? 'ไปที่โปรเจกต์' : 'Open projects'}
                </Link>
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">{isThai ? 'Scope งาน' : 'Scope of work'}</label>
              <textarea
                value={form.serviceDetails.scope}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, scope: e.target.value } }))}
                className="input-field"
                rows={4}
                disabled={!editable}
                placeholder={isThai ? 'ระบุสิ่งที่จะส่งมอบ ขอบเขตที่รวม และสิ่งที่ไม่รวมในราคา' : 'Describe deliverables, included work, and exclusions.'}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">{isThai ? 'สิ่งส่งมอบ' : 'Deliverables'}</label>
              <textarea
                value={form.serviceDetails.deliverables}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, deliverables: e.target.value } }))}
                className="input-field"
                rows={3}
                disabled={!editable}
                placeholder={isThai ? 'เช่น ติดตั้งระบบพร้อมทดสอบ และส่งคู่มือใช้งาน' : 'e.g. installed and tested system with user guide'}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">{isThai ? 'สิ่งที่ไม่รวมในราคา' : 'Exclusions'}</label>
              <textarea
                value={form.serviceDetails.exclusions}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, exclusions: e.target.value } }))}
                className="input-field"
                rows={2}
                disabled={!editable}
                placeholder={isThai ? 'เช่น ไม่รวมงานแก้ผนังและค่าเดินทางนอกพื้นที่' : 'e.g. excludes wall repair and out-of-area travel'}
              />
            </div>
            <div>
              <label className="label">{isThai ? 'ระยะเวลาดำเนินงาน' : 'Timeline'}</label>
              <input
                value={form.serviceDetails.duration}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, duration: e.target.value } }))}
                className="input-field"
                disabled={!editable}
                placeholder={isThai ? 'เช่น 30 วันหลังได้รับมัดจำ' : 'e.g. 30 days after deposit'}
              />
            </div>
            <div>
              <label className="label">{isThai ? 'การรับประกัน' : 'Warranty'}</label>
              <input
                value={form.serviceDetails.warranty}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, warranty: e.target.value } }))}
                className="input-field"
                disabled={!editable}
                placeholder={isThai ? 'เช่น รับประกันงานติดตั้ง 1 ปี' : 'e.g. 1-year installation warranty'}
              />
            </div>
            {supportsMilestones && <div>
              <label className="label">{isThai ? 'มัดจำก่อนเริ่มงาน (%)' : 'Deposit before start (%)'}</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.serviceDetails.depositPercent}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, depositPercent: Number(e.target.value) } }))}
                className="input-field"
                disabled={!editable}
              />
              {form.serviceDetails.depositPercent > 0 && (
                <p className="mt-1 text-xs text-slate-500">{isThai ? 'คิดเป็น' : 'Amount'} {formatCurrency((totals.total * form.serviceDetails.depositPercent) / 100)}</p>
              )}
            </div>}
            {supportsRevisions && <div>
              <label className="label">{isThai ? 'แก้ไขงานได้ (รอบ)' : 'Included revision rounds'}</label>
              <input
                type="number"
                min="0"
                max="99"
                value={form.serviceDetails.revisionRounds}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, revisionRounds: Number(e.target.value) } }))}
                className="input-field"
                disabled={!editable}
              />
            </div>}
            {supportsRevisions && <div>
              <label className="label">{isThai ? 'เงื่อนไขแก้ไขงาน' : 'Revision terms'}</label>
              <input
                value={form.serviceDetails.revisionTerms}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, revisionTerms: e.target.value } }))}
                className="input-field"
                disabled={!editable}
                placeholder={isThai ? 'เช่น เกินจำนวนรอบคิดเพิ่มตามจริง' : 'e.g. extra rounds are quoted separately'}
              />
            </div>}
            {supportsRecurringTerms && (
              <>
                <div>
                  <label className="label">{isThai ? 'ระยะสัญญา' : 'Contract duration'}</label>
                  <input value={form.serviceDetails.contractDuration} onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, contractDuration: e.target.value } }))} className="input-field" disabled={!editable} placeholder={isThai ? 'เช่น 12 เดือน' : 'e.g. 12 months'} />
                </div>
                <div>
                  <label className="label">{isThai ? 'รอบเรียกเก็บเงิน' : 'Billing cycle'}</label>
                  <input value={form.serviceDetails.billingCycle} onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, billingCycle: e.target.value } }))} className="input-field" disabled={!editable} placeholder={isThai ? 'เช่น ทุกวันที่ 1 ของเดือน' : 'e.g. first day of each month'} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{isThai ? 'ระดับการให้บริการ (SLA)' : 'Service level (SLA)'}</label>
                  <textarea value={form.serviceDetails.sla} onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, sla: e.target.value } }))} className="input-field" rows={2} disabled={!editable} placeholder={isThai ? 'เช่น ตอบกลับภายใน 4 ชั่วโมงทำการ' : 'e.g. response within 4 business hours'} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{isThai ? 'เงื่อนไขยกเลิก' : 'Cancellation terms'}</label>
                  <textarea value={form.serviceDetails.cancellationTerms} onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, cancellationTerms: e.target.value } }))} className="input-field" rows={2} disabled={!editable} placeholder={isThai ? 'เช่น แจ้งล่วงหน้า 30 วัน' : 'e.g. 30 days notice'} />
                </div>
                <div>
                  <label className="label">{isThai ? 'เงินประกัน' : 'Security deposit'}</label>
                  <input type="number" min="0" value={form.serviceDetails.securityDeposit} onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, securityDeposit: Number(e.target.value) } }))} className="input-field text-right" disabled={!editable} />
                </div>
              </>
            )}
            {supportsLogisticsTerms && (
              <>
                <div>
                  <label className="label">{isThai ? 'ต้นทาง' : 'Origin'}</label>
                  <input
                    value={form.serviceDetails.origin}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, origin: e.target.value } }))}
                    className="input-field"
                    disabled={!editable}
                    placeholder={isThai ? 'เช่น Bangkok, Thailand' : 'e.g. Bangkok, Thailand'}
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'ปลายทาง' : 'Destination'}</label>
                  <input
                    value={form.serviceDetails.destination}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, destination: e.target.value } }))}
                    className="input-field"
                    disabled={!editable}
                    placeholder={isThai ? 'เช่น Osaka, Japan' : 'e.g. Osaka, Japan'}
                  />
                </div>
                <div>
                  <label className="label">Incoterms</label>
                  <select
                    value={form.serviceDetails.incoterms}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, incoterms: e.target.value } }))}
                    className="input-field"
                    disabled={!editable}
                  >
                    <option value="">{isThai ? 'เลือกหรือพิมพ์ในหมายเหตุเพิ่มเติม' : 'Select or describe in notes'}</option>
                    {['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP'].map((term) => (
                      <option key={term} value={term}>{term}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">{isThai ? 'รูปแบบขนส่ง' : 'Shipment mode'}</label>
                  <input
                    value={form.serviceDetails.shipmentMode}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, shipmentMode: e.target.value } }))}
                    className="input-field"
                    disabled={!editable}
                    placeholder={isThai ? 'เช่น Sea freight, Air freight, Truck' : 'e.g. Sea freight, Air freight, Truck'}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{isThai ? 'รายละเอียดสินค้า/น้ำหนัก' : 'Cargo details'}</label>
                  <textarea
                    value={form.serviceDetails.cargoDetails}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, cargoDetails: e.target.value } }))}
                    className="input-field"
                    rows={2}
                    disabled={!editable}
                    placeholder={isThai ? 'เช่น 2 pallets / 380 kg / HS code ถ้ามี' : 'e.g. 2 pallets / 380 kg / HS code if known'}
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'สกุลเงิน' : 'Currency'}</label>
                  <select
                    value={form.serviceDetails.currency}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, currency: e.target.value } }))}
                    className="input-field"
                    disabled={!editable}
                  >
                    {['THB', 'USD', 'EUR', 'JPY', 'CNY', 'SGD'].map((currency) => (
                      <option key={currency} value={currency}>{currency}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">{isThai ? 'อัตราแลกเปลี่ยน' : 'Exchange rate'}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.000001"
                    value={form.serviceDetails.exchangeRate}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, exchangeRate: Number(e.target.value) } }))}
                    className="input-field text-right"
                    disabled={!editable}
                    placeholder="0.000000"
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'ค่าขนส่ง' : 'Freight charge'}</label>
                  <input
                    type="number"
                    min="0"
                    value={form.serviceDetails.freightCharge}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, freightCharge: Number(e.target.value) } }))}
                    className="input-field text-right"
                    disabled={!editable}
                  />
                </div>
                <div>
                  <label className="label">Local charge</label>
                  <input
                    type="number"
                    min="0"
                    value={form.serviceDetails.localCharge}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, localCharge: Number(e.target.value) } }))}
                    className="input-field text-right"
                    disabled={!editable}
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'ค่าพิธีการศุลกากร' : 'Customs fee'}</label>
                  <input
                    type="number"
                    min="0"
                    value={form.serviceDetails.customsFee}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, customsFee: Number(e.target.value) } }))}
                    className="input-field text-right"
                    disabled={!editable}
                  />
                </div>
                <div>
                  <label className="label">{isThai ? 'ประกันภัย' : 'Insurance'}</label>
                  <input
                    type="number"
                    min="0"
                    value={form.serviceDetails.insurance}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, insurance: Number(e.target.value) } }))}
                    className="input-field text-right"
                    disabled={!editable}
                  />
                </div>
              </>
            )}
          </div>

          {supportsMilestones && <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">{isThai ? 'งวดงาน' : 'Milestones'}</h4>
                <p className="mt-1 text-xs text-slate-500">{isThai ? 'เพิ่มเมื่อมีการแบ่งส่งงานหรือแบ่งชำระหลายครั้ง' : 'Add when delivery or payment is split into stages.'}</p>
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, milestones: [...prev.serviceDetails.milestones, blankMilestone()] } }))}
                  className="btn-secondary text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> {isThai ? 'เพิ่มงวด' : 'Add milestone'}
                </button>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {form.serviceDetails.milestones.length === 0 ? (
                <p className="border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">{isThai ? 'ยังไม่มีงวดงาน' : 'No milestones added'}</p>
              ) : form.serviceDetails.milestones.map((milestone, index) => (
                <div key={index} className="grid gap-2 border border-slate-200 bg-slate-50 p-3 md:grid-cols-[32px_minmax(0,1fr)_140px_150px_32px]">
                  <span className="pt-2 text-center text-xs font-semibold text-slate-400">{index + 1}</span>
                  <input value={milestone.title} onChange={(e) => setMilestone(index, { title: e.target.value })} className="input-field" placeholder={isThai ? 'ชื่องวดงาน' : 'Milestone title'} disabled={!editable} />
                  <input type="number" min="0" value={milestone.amount} onChange={(e) => setMilestone(index, { amount: Number(e.target.value) })} className="input-field text-right" placeholder={isThai ? 'จำนวนเงิน' : 'Amount'} disabled={!editable} />
                  <input type="date" value={milestone.dueDate} onChange={(e) => setMilestone(index, { dueDate: e.target.value })} className="input-field" disabled={!editable} />
                  {editable && (
                    <DeleteButton
                      onClick={() => setForm((prev) => ({ ...prev, serviceDetails: { ...prev.serviceDetails, milestones: prev.serviceDetails.milestones.filter((_, itemIndex) => itemIndex !== index) } }))}
                      label={isThai ? 'ลบงวดงาน' : 'Remove milestone'}
                      size="sm"
                      className="justify-self-center"
                    />
                  )}
                  <input value={milestone.note} onChange={(e) => setMilestone(index, { note: e.target.value })} className="input-field md:col-start-2 md:col-span-3" placeholder={isThai ? 'หมายเหตุงวดงาน (ถ้ามี)' : 'Milestone note (optional)'} disabled={!editable} />
                </div>
              ))}
            </div>
            {form.serviceDetails.milestones.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                <span className="font-medium text-slate-600">{isThai ? 'รวมงวดงาน' : 'Milestone total'}</span>
                <span className="font-semibold text-slate-900">{formatCurrency(milestoneTotal)}</span>
                {Math.abs(milestoneTotal - totals.total) > 0.009 && (
                  <span className="w-full text-amber-700">
                    {isThai ? 'ยอดงวดยังต่างจากยอดสุทธิ' : 'Milestones do not match the quote total'} {formatCurrency(Math.abs(milestoneTotal - totals.total))}
                  </span>
                )}
              </div>
            )}
          </div>}
        </div>
      )}

      {/* Items */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{isThai ? 'รายการ' : 'Items'}</h3>
          {editable && (
            <div className="flex items-center gap-2">
              <button onClick={() => openAddProduct(null)} className="btn-secondary text-xs">
                <Plus className="w-3 h-3" /> {isThai ? 'สินค้าใหม่' : 'New product'}
              </button>
              <button onClick={addItem} className="btn-secondary text-xs">
                <Plus className="w-3 h-3" /> {isThai ? 'เพิ่มรายการ' : 'Add item'}
              </button>
            </div>
          )}
        </div>
        {form.kind === 'boq_contract' && (
          <p className="mb-3 border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            {isThai ? 'ใส่หมวดงานในแต่ละรายการ เช่น งานวัสดุ ค่าแรง หรืองานระบบ ระบบจะรวมยอดย่อยตามหมวดให้อัตโนมัติ' : 'Assign each line to a BOQ section such as materials, labor, or systems. Section subtotals update automatically.'}
          </p>
        )}
        <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left pb-2">{isThai ? 'ชื่อ' : 'Name'}</th>
              <th className="text-right pb-2 w-20">{isThai ? 'จำนวน' : 'Qty'}</th>
              <th className="text-left pb-2 w-24">{isThai ? 'หน่วย' : 'Unit'}</th>
              <th className="text-right pb-2 w-28">{isThai ? 'ราคา/หน่วย' : 'Unit price'}</th>
              <th className="text-right pb-2 w-24">{isThai ? 'ส่วนลด %' : 'Discount %'}</th>
              <th className="text-left pb-2 w-24">VAT</th>
              <th className="text-right pb-2 w-28">{isThai ? 'รวม' : 'Total'}</th>
              {editable && <th className="sticky right-0 w-12 bg-white" />}
            </tr>
          </thead>
          <tbody>
            {form.items.map((item, idx) => {
              const line = computeLine(item);
              return (
                <tr key={idx} className="border-t border-gray-100">
                  <td className="py-2 pr-2">
                    {form.kind === 'boq_contract' && (
                      <input value={item.sectionTitle ?? ''} onChange={(e) => setItem(idx, { sectionTitle: e.target.value })} placeholder={isThai ? 'หมวดงาน เช่น งานไฟฟ้า' : 'Section e.g. electrical'} className="input-field mb-2 text-xs" disabled={!editable} />
                    )}
                    <ProductPicker
                      value={item.nameTh}
                      onChangeText={(text) => setItem(idx, { nameTh: text, productId: null })}
                      products={products}
                      onSelectProduct={(product) => setItem(idx, productToItemPatch(product))}
                      onCreateNew={(typedName) => openAddProduct(idx, typedName)}
                      isThai={isThai}
                      disabled={!editable}
                      placeholder={isThai ? 'ชื่อรายการ' : 'Item name'}
                    />
                    <textarea
                      value={item.descriptionTh ?? ''}
                      onChange={(e) => setItem(idx, { descriptionTh: e.target.value })}
                      placeholder={isThai ? 'รายละเอียดบรรทัดย่อย เช่น ขอบเขต รุ่น เงื่อนไข หรือหมายเหตุของรายการนี้' : 'Line details such as scope, model, conditions, or notes'}
                      className="input-field mt-2 min-h-[70px] resize-y text-xs leading-5"
                      rows={2}
                      disabled={!editable}
                    />
                    {form.language !== 'th' && (
                      <textarea
                        value={item.descriptionEn ?? ''}
                        onChange={(e) => setItem(idx, { descriptionEn: e.target.value })}
                        placeholder={isThai ? 'รายละเอียดภาษาอังกฤษ (ถ้าต้องใช้ในเอกสารสองภาษา)' : 'English line details'}
                        className="input-field mt-2 min-h-[58px] resize-y text-xs leading-5"
                        rows={2}
                        disabled={!editable}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} className="input-field text-sm text-right" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <input value={item.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} className="input-field text-sm" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) })} className="input-field text-sm text-right" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="0.01" value={item.discountAmount} onChange={(e) => setItem(idx, { discountAmount: Number(e.target.value) })} className="input-field text-sm text-right" disabled={!editable} />
                  </td>
                  <td className="py-2 pr-2">
                    <select value={item.vatType} onChange={(e) => setItem(idx, { vatType: e.target.value as ItemDraft['vatType'] })} className="input-field text-sm" disabled={!editable}>
                      <option value="vat7">7%</option>
                      <option value="vatZero">0%</option>
                      <option value="vatExempt">{isThai ? 'ยกเว้น' : 'Exempt'}</option>
                    </select>
                  </td>
                  <td className="py-2 pr-2 text-right font-medium">{formatCurrency(line.totalAmount)}</td>
                  {editable && (
                    <td className="sticky right-0 z-10 bg-white py-2 pl-2 pr-1 text-center shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)]">
                      <DeleteButton onClick={() => removeItem(idx)} label={isThai ? 'ลบรายการ' : 'Remove item'} size="sm" className="mx-auto" />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {form.kind === 'boq_contract' && boqSectionTotals.length > 0 && (
          <div className="mt-4 border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs font-semibold text-slate-700">{isThai ? 'ยอดย่อยตามหมวด BOQ (ก่อน VAT)' : 'BOQ section subtotals (before VAT)'}</p>
            <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              {boqSectionTotals.map(([title, amount]) => (
                <div key={title} className="flex justify-between gap-3 border-b border-slate-200 py-1 last:border-b-0">
                  <span className="text-slate-600">{title}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-gray-200 mt-4 pt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">{isThai ? 'ยอดรวมก่อน VAT' : 'Subtotal'}</span><span>{formatCurrency(totals.subtotal)}</span></div>
          <div className="flex justify-between items-center gap-2">
            <input
              type="text"
              value={form.feeLabel}
              onChange={(e) => setForm({ ...form, feeLabel: e.target.value })}
              placeholder={isThai ? 'ค่าบริหารงาน' : 'Management fee'}
              className="input-field text-sm flex-1 min-w-0"
              disabled={!editable}
            />
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number" min="0" max="100" step="0.01"
                value={form.feePercent}
                onChange={(e) => setForm({ ...form, feePercent: Number(e.target.value) })}
                className="input-field text-sm text-right w-20"
                disabled={!editable}
              />
              <span className="text-gray-400 text-sm">%</span>
            </div>
            <span className="w-24 text-right shrink-0">{formatCurrency(totals.feeAmount)}</span>
          </div>
          {form.feePercent > 0 && (
            <div className="flex justify-between text-gray-400 text-xs"><span>{isThai ? 'รวมก่อน VAT' : 'Sub Total'}</span><span>{formatCurrency(totals.subtotal + totals.feeAmount)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-gray-500">VAT</span><span>{formatCurrency(totals.vatAmount)}</span></div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">{isThai ? 'ส่วนลดรวม' : 'Discount'}</span>
            <input
              type="number" min="0" step="0.01"
              value={form.discountAmount}
              onChange={(e) => setForm({ ...form, discountAmount: Number(e.target.value) })}
              className="input-field text-sm text-right w-28"
              disabled={!editable}
            />
          </div>
          <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
            <span>{isThai ? 'ยอดสุทธิ' : 'Total'}</span>
            <span className="text-primary-700">{formatCurrency(totals.total)}</span>
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-gray-500">{isThai ? 'หัก ณ ที่จ่าย' : 'Withholding tax'}</span>
            <select
              value={form.whtRate}
              onChange={(e) => setForm({ ...form, whtRate: e.target.value as FormState['whtRate'] })}
              className="input-field text-sm w-32"
              disabled={!editable}
            >
              <option value="">{isThai ? 'ไม่หัก' : 'None'}</option>
              <option value="1">1% {isThai ? '(ขนส่ง)' : '(transport)'}</option>
              <option value="3">3% {isThai ? '(บริการ)' : '(service)'}</option>
              <option value="5">5% {isThai ? '(เช่า)' : '(rental)'}</option>
            </select>
          </div>
          {totals.whtAmount > 0 && (
            <>
              <div className="flex justify-between text-amber-700 text-sm"><span>{isThai ? `หัก ณ ที่จ่าย (${form.whtRate}%)` : `WHT (${form.whtRate}%)`}</span><span>-{formatCurrency(totals.whtAmount)}</span></div>
              <div className="flex justify-between font-semibold"><span>{isThai ? 'ยอดชำระสุทธิ' : 'Net payable'}</span><span>{formatCurrency(totals.netPayable)}</span></div>
            </>
          )}
        </div>
      </div>

      {/* Notes + terms */}
      <div className="card grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{isThai ? 'เงื่อนไขการชำระเงิน' : 'Payment terms'}</label>
          <textarea value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} className="input-field" rows={2} disabled={!editable} />
        </div>
        <div>
          <label className="label">{isThai ? 'เงื่อนไขการส่งของ' : 'Delivery terms'}</label>
          <textarea value={form.deliveryTerms} onChange={(e) => setForm({ ...form, deliveryTerms: e.target.value })} className="input-field" rows={2} disabled={!editable} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{isThai ? 'หมายเหตุ' : 'Notes'}</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} disabled={!editable} />
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-xs text-gray-400 flex items-center gap-2 px-1">
        <FileText className="w-3 h-3" />
        {isThai
          ? 'ใบเสนอราคาไม่มีผลทางภาษี — จะออก ใบกำกับภาษี เมื่อกดแปลงตอนปิดดีล'
          : 'Quotations carry no tax obligation — a tax invoice is created when you mark the quotation accepted and convert it.'}
      </div>
    </div>{/* left column */}

      {/* Live preview pane */}
      <aside className="hidden lg:sticky lg:top-4 lg:block self-start">
        <div className="flex max-h-[calc(100vh-6rem)] min-h-[620px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-primary-700 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary-100">
              {(selectedTemplate?.swatches ?? DEFAULT_SYSTEM_DOCUMENT_TEMPLATE_SWATCHES).slice(0, 3).map((swatch, index) => (
                <span key={`${swatch}-${index}`} className={`h-3.5 w-3.5 shrink-0 rounded-full border border-slate-200 ${swatch}`} />
              ))}
              <div className="min-w-0 flex-1">
                <label className="block text-[10px] font-semibold leading-3 text-slate-400">
                  {isThai ? 'เทมเพลตใบเสนอราคา' : 'Quotation template'}
                </label>
                <div className="relative">
                  <select
                    value={form.templateId ?? STANDARD_TEMPLATE_VALUE}
                    onChange={(event) => setForm({ ...form, templateId: event.target.value === STANDARD_TEMPLATE_VALUE ? null : event.target.value })}
                    className="w-full appearance-none bg-transparent pr-6 text-xs font-semibold leading-5 text-slate-800 outline-none"
                    disabled={!editable}
                    aria-label={isThai ? 'เลือกเทมเพลตใบเสนอราคา' : 'Choose quotation template'}
                  >
                    <option value={STANDARD_TEMPLATE_VALUE}>
                      {isThai ? 'ขาว-ดำ · ทางการ (ค่าเริ่มต้น)' : 'Mono · Formal (default)'}
                    </option>
                    {minimalTemplates.length > 0 && (
                      <optgroup label={isThai ? 'เรียบง่าย / ทางการ' : 'Minimal / official'}>
                        {minimalTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {isThai ? template.nameTh : template.nameEn}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {cuteTemplates.length > 0 && (
                      <optgroup label={isThai ? 'สีพาสเทล / ร้านค้า' : 'Pastel / shop'}>
                        {cuteTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {isThai ? template.nameTh : template.nameEn}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {quotePreviewLoading && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700">
                  <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary-400 border-t-transparent" />
                  {isThai ? 'อัปเดต' : 'Updating'}
                </span>
              )}
              <button
                type="button"
                onClick={() => void openCurrentPreviewPdf('download')}
                disabled={!quotePreviewHtml || quotePreviewPdfBusy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {quotePreviewPdfBusy === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {isThai ? 'ดาวน์โหลด PDF' : 'Download PDF'}
              </button>
              <button
                type="button"
                onClick={() => void openCurrentPreviewPdf('open')}
                disabled={!quotePreviewHtml || quotePreviewPdfBusy !== null}
                title={isThai ? 'เปิดแบบเต็มจอ' : 'Open fullscreen'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {quotePreviewPdfBusy === 'open' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Maximize2 className="h-3.5 w-3.5" />}
                <Eye className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div ref={quotePreviewRef} className="flex flex-1 flex-col items-center overflow-auto bg-[radial-gradient(circle_at_top,#eef2ff_0,#f8fafc_42%,#eef2f7_100%)] p-5">
            {quotePreviewError && (
              <div className="mb-3 w-full max-w-2xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {quotePreviewError}
              </div>
            )}

            {quotePreviewHtml ? (
              <div className="rounded-3xl bg-white/70 p-4 shadow-inner ring-1 ring-slate-200/70">
                <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="font-medium">{isThai ? 'ตัวอย่าง A4' : 'A4 preview'}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                    {Math.round(quotePreviewScale * 100)}%
                  </span>
                </div>
                <div
                  className="relative overflow-hidden rounded-sm bg-white shadow-xl"
                  style={{
                    width: 794 * quotePreviewScale,
                    height: 1123 * quotePreviewScale,
                  }}
                >
                  <div
                    style={{
                      width: 794,
                      height: 1123,
                      transformOrigin: 'top left',
                      transform: `scale(${quotePreviewScale})`,
                    }}
                  >
                    {quotePreviewLoading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-sm bg-white/60">
                        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-200 border-t-primary-500" />
                      </div>
                    )}
                    <iframe
                      srcDoc={quotePreviewHtml}
                      title={isThai ? 'ตัวอย่างใบเสนอราคา' : 'Quotation preview'}
                      sandbox="allow-same-origin allow-scripts"
                      className="block w-full rounded-sm border-0 bg-white"
                      style={{ height: 1123 }}
                    />
                  </div>
                </div>
              </div>
            ) : quotePreviewLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-500" />
                <p className="text-sm text-slate-500">{isThai ? 'กำลังโหลดตัวอย่าง...' : 'Loading preview...'}</p>
              </div>
            ) : (
              <div className="flex w-full flex-1 items-start justify-center py-8">
                <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
                    <Eye className="h-6 w-6" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-900">
                    {isThai ? 'พื้นที่ตัวอย่างใบเสนอราคา' : 'Quotation preview'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {isThai
                      ? 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ แล้วตัวอย่าง PDF จะอัปเดตที่นี่'
                      : 'Add at least one item to see the PDF-style preview here.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>{/* grid */}
    <CustomerFormModal
      open={showAddCustomer}
      onClose={() => setShowAddCustomer(false)}
      onSaved={(customer) => {
        setCustomers((prev) => [customer, ...prev]);
        setForm((prev) => ({ ...prev, buyerId: customer.id }));
      }}
      token={token}
      isThai={isThai}
      lockPartyRole="customer"
    />
    <ProductFormModal
      open={showAddProduct}
      onClose={() => setShowAddProduct(false)}
      onSaved={(product) => {
        setProducts((prev) => [product, ...prev]);
        if (addProductRow === null) {
          setForm((prev) => ({ ...prev, items: [...prev.items, { ...blankItem, ...productToItemPatch(product) }] }));
        } else {
          setItem(addProductRow, productToItemPatch(product));
        }
      }}
      token={token}
      isThai={isThai}
      initialName={addProductName}
    />
    </div>
  );
}
