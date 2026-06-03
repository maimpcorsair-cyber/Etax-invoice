import { useEffect, useRef, useState } from 'react';
import { CheckCircle, FlaskConical, Loader2, Save, Sparkles, XCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { ConfirmDialog, type ConfirmDialogState } from '../../components/ui/AppFeedback';

const templatePreviewSamples = {
  th: {
    documentTitle: 'ใบกำกับภาษี / ใบเสร็จรับเงิน',
    invoiceNumber: 'IV-2026-000128',
    invoiceDate: '24 เมษายน 2569',
    dueDate: '30 เมษายน 2569',
    sellerName: 'บริษัท สยาม เทคโนโลยี จำกัด',
    buyerName: 'บริษัท เมฆา คอมเมิร์ซ จำกัด',
    subtotal: '45,000.00',
    vatAmount: '3,150.00',
    total: '48,150.00',
    amountInWords: 'สี่หมื่นแปดพันหนึ่งร้อยห้าสิบบาทถ้วน',
    paymentMethod: 'โอนเงินผ่านธนาคาร',
    notes: 'กรุณาชำระเงินภายในกำหนดเพื่อรักษาวงเงินเครดิต',
  },
  en: {
    documentTitle: 'Tax Invoice / Receipt',
    invoiceNumber: 'IV-2026-000128',
    invoiceDate: '24 April 2026',
    dueDate: '30 April 2026',
    sellerName: 'Siam Technology Co., Ltd.',
    buyerName: 'Mekha Commerce Co., Ltd.',
    subtotal: '45,000.00',
    vatAmount: '3,150.00',
    total: '48,150.00',
    amountInWords: 'Forty-eight thousand one hundred fifty baht only',
    paymentMethod: 'Bank transfer',
    notes: 'Please settle payment within the stated terms.',
  },
} as const;

const templatePresets = {
  taxInvoice: {
    type: 'tax_invoice',
    label: 'T02',
    nameTh: 'Tax Invoice - Executive Blue',
    nameEn: 'Tax Invoice - Executive Blue',
    descriptionTh: 'ใบกำกับภาษีสำหรับขายเชื่อ เน้นยอดค้างชำระ วันครบกำหนด และความน่าเชื่อถือ',
    descriptionEn: 'A polished tax invoice layout for credit sales, due dates, and outstanding balance.',
    th: `<div style="display:grid;grid-template-columns:1.15fr .85fr;gap:14px;align-items:stretch">
  <div style="border:1px solid #dbeafe;border-radius:8px;padding:14px;background:#f8fbff">
    <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#1d4ed8;font-weight:700">Tax Invoice T02</div>
    <div style="margin-top:8px;font-size:18px;font-weight:800;color:#0f172a">{{buyerName}}</div>
    <div style="margin-top:6px;color:#475569">เลขที่ {{invoiceNumber}} · วันที่ {{invoiceDate}}</div>
    <div style="margin-top:10px;color:#334155">ครบกำหนดชำระ {{dueDate}} · วิธีชำระ {{paymentMethod}}</div>
  </div>
  <div style="border-radius:8px;padding:14px;background:#0f2f6b;color:#fff">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#bfdbfe">Amount Due</div>
    <div style="margin-top:8px;font-size:28px;font-weight:800">{{total}}</div>
    <div style="margin-top:8px;color:#dbeafe;font-size:12px">VAT {{vatAmount}} · Subtotal {{subtotal}}</div>
  </div>
</div>`,
    en: `<div style="display:grid;grid-template-columns:1.15fr .85fr;gap:14px;align-items:stretch">
  <div style="border:1px solid #dbeafe;border-radius:8px;padding:14px;background:#f8fbff">
    <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#1d4ed8;font-weight:700">Tax Invoice T02</div>
    <div style="margin-top:8px;font-size:18px;font-weight:800;color:#0f172a">{{buyerName}}</div>
    <div style="margin-top:6px;color:#475569">No. {{invoiceNumber}} · Date {{invoiceDate}}</div>
    <div style="margin-top:10px;color:#334155">Due {{dueDate}} · Payment {{paymentMethod}}</div>
  </div>
  <div style="border-radius:8px;padding:14px;background:#0f2f6b;color:#fff">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#bfdbfe">Amount Due</div>
    <div style="margin-top:8px;font-size:28px;font-weight:800">{{total}}</div>
    <div style="margin-top:8px;color:#dbeafe;font-size:12px">VAT {{vatAmount}} · Subtotal {{subtotal}}</div>
  </div>
</div>`,
  },
  taxInvoiceReceipt: {
    type: 'tax_invoice_receipt',
    label: 'T01',
    nameTh: 'Tax Invoice Receipt - Paid Stamp',
    nameEn: 'Tax Invoice Receipt - Paid Stamp',
    descriptionTh: 'ใบกำกับภาษี/ใบเสร็จรวม เน้นสถานะรับชำระแล้วและยอดสุทธิ',
    descriptionEn: 'A combined tax invoice and receipt layout with a clear paid confirmation.',
    th: `<div style="border:1px solid #bbf7d0;border-radius:8px;padding:14px;background:#f0fdf4">
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
    <div>
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#15803d;font-weight:800">Paid Receipt T01</div>
      <div style="margin-top:8px;font-size:18px;font-weight:800;color:#052e16">{{documentTitle}}</div>
      <div style="margin-top:6px;color:#166534">รับเงินจาก {{buyerName}} เรียบร้อยแล้ว</div>
    </div>
    <div style="border:1px solid #86efac;border-radius:999px;padding:8px 14px;background:#fff;color:#15803d;font-weight:800">PAID</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">
    <div><div style="font-size:11px;color:#166534">Subtotal</div><strong>{{subtotal}}</strong></div>
    <div><div style="font-size:11px;color:#166534">VAT</div><strong>{{vatAmount}}</strong></div>
    <div><div style="font-size:11px;color:#166534">Net Paid</div><strong>{{total}}</strong></div>
  </div>
</div>`,
    en: `<div style="border:1px solid #bbf7d0;border-radius:8px;padding:14px;background:#f0fdf4">
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
    <div>
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#15803d;font-weight:800">Paid Receipt T01</div>
      <div style="margin-top:8px;font-size:18px;font-weight:800;color:#052e16">{{documentTitle}}</div>
      <div style="margin-top:6px;color:#166534">Payment from {{buyerName}} has been received.</div>
    </div>
    <div style="border:1px solid #86efac;border-radius:999px;padding:8px 14px;background:#fff;color:#15803d;font-weight:800">PAID</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">
    <div><div style="font-size:11px;color:#166534">Subtotal</div><strong>{{subtotal}}</strong></div>
    <div><div style="font-size:11px;color:#166534">VAT</div><strong>{{vatAmount}}</strong></div>
    <div><div style="font-size:11px;color:#166534">Net Paid</div><strong>{{total}}</strong></div>
  </div>
</div>`,
  },
  receipt: {
    type: 'receipt',
    label: 'T03',
    nameTh: 'Receipt - Settlement Record',
    nameEn: 'Receipt - Settlement Record',
    descriptionTh: 'ใบเสร็จรับเงินสำหรับอ้างอิงใบกำกับภาษีเดิม ดูเป็นหลักฐานรับชำระ',
    descriptionEn: 'A receipt layout for settlement against a prior tax invoice.',
    th: `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;background:#fff">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#64748b;font-weight:800">Receipt T03</div>
  <div style="margin-top:10px;display:grid;grid-template-columns:1fr auto;gap:14px;align-items:end">
    <div>
      <div style="font-size:16px;font-weight:800;color:#0f172a">บันทึกรับชำระจาก {{buyerName}}</div>
      <div style="margin-top:6px;color:#475569">เอกสารเลขที่ {{invoiceNumber}} · วันที่รับชำระ {{invoiceDate}}</div>
      <div style="margin-top:6px;color:#475569">ชำระโดย {{paymentMethod}}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#64748b">Received Amount</div>
      <div style="font-size:24px;font-weight:800;color:#0f766e">{{total}}</div>
    </div>
  </div>
</div>`,
    en: `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;background:#fff">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#64748b;font-weight:800">Receipt T03</div>
  <div style="margin-top:10px;display:grid;grid-template-columns:1fr auto;gap:14px;align-items:end">
    <div>
      <div style="font-size:16px;font-weight:800;color:#0f172a">Payment received from {{buyerName}}</div>
      <div style="margin-top:6px;color:#475569">Document {{invoiceNumber}} · Receipt date {{invoiceDate}}</div>
      <div style="margin-top:6px;color:#475569">Paid by {{paymentMethod}}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#64748b">Received Amount</div>
      <div style="font-size:24px;font-weight:800;color:#0f766e">{{total}}</div>
    </div>
  </div>
</div>`,
  },
  creditNote: {
    type: 'credit_note',
    label: 'T04',
    nameTh: 'Credit Note - Adjustment',
    nameEn: 'Credit Note - Adjustment',
    descriptionTh: 'ใบลดหนี้ เน้นมูลค่าปรับลดและเหตุผลประกอบการแก้ไข',
    descriptionEn: 'A credit note layout focused on reduction amount and adjustment context.',
    th: `<div style="border:1px solid #fed7aa;border-radius:8px;padding:14px;background:#fff7ed">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c2410c;font-weight:800">Credit Note T04</div>
  <div style="margin-top:8px;font-size:18px;font-weight:800;color:#7c2d12">เอกสารลดหนี้สำหรับ {{buyerName}}</div>
  <div style="margin-top:6px;color:#9a3412">อ้างอิง {{invoiceNumber}} ลงวันที่ {{invoiceDate}}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
    <div style="border:1px solid #fdba74;border-radius:8px;background:#fff;padding:10px"><div style="font-size:11px;color:#9a3412">ยอดลดหนี้</div><strong>{{total}}</strong></div>
    <div style="border:1px solid #fdba74;border-radius:8px;background:#fff;padding:10px"><div style="font-size:11px;color:#9a3412">หมายเหตุ</div><strong>{{notes}}</strong></div>
  </div>
</div>`,
    en: `<div style="border:1px solid #fed7aa;border-radius:8px;padding:14px;background:#fff7ed">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c2410c;font-weight:800">Credit Note T04</div>
  <div style="margin-top:8px;font-size:18px;font-weight:800;color:#7c2d12">Credit adjustment for {{buyerName}}</div>
  <div style="margin-top:6px;color:#9a3412">Reference {{invoiceNumber}} dated {{invoiceDate}}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
    <div style="border:1px solid #fdba74;border-radius:8px;background:#fff;padding:10px"><div style="font-size:11px;color:#9a3412">Credit Amount</div><strong>{{total}}</strong></div>
    <div style="border:1px solid #fdba74;border-radius:8px;background:#fff;padding:10px"><div style="font-size:11px;color:#9a3412">Notes</div><strong>{{notes}}</strong></div>
  </div>
</div>`,
  },
  debitNote: {
    type: 'debit_note',
    label: 'T05',
    nameTh: 'Debit Note - Additional Charge',
    nameEn: 'Debit Note - Additional Charge',
    descriptionTh: 'ใบเพิ่มหนี้ เน้นยอดเรียกเก็บเพิ่มและข้อมูลอ้างอิงเอกสารเดิม',
    descriptionEn: 'A debit note layout for additional charge and reference context.',
    th: `<div style="border:1px solid #fecdd3;border-radius:8px;padding:14px;background:#fff1f2">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#be123c;font-weight:800">Debit Note T05</div>
  <div style="display:grid;grid-template-columns:1fr auto;gap:14px;margin-top:10px;align-items:center">
    <div>
      <div style="font-size:18px;font-weight:800;color:#881337">เรียกเก็บเพิ่มเติมจาก {{buyerName}}</div>
      <div style="margin-top:6px;color:#9f1239">อ้างอิงเอกสาร {{invoiceNumber}} · {{invoiceDate}}</div>
      <div style="margin-top:6px;color:#9f1239">{{notes}}</div>
    </div>
    <div style="border-radius:8px;background:#be123c;color:#fff;padding:12px 16px;text-align:right">
      <div style="font-size:11px;color:#ffe4e6">Additional Due</div>
      <div style="font-size:24px;font-weight:800">{{total}}</div>
    </div>
  </div>
</div>`,
    en: `<div style="border:1px solid #fecdd3;border-radius:8px;padding:14px;background:#fff1f2">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#be123c;font-weight:800">Debit Note T05</div>
  <div style="display:grid;grid-template-columns:1fr auto;gap:14px;margin-top:10px;align-items:center">
    <div>
      <div style="font-size:18px;font-weight:800;color:#881337">Additional charge to {{buyerName}}</div>
      <div style="margin-top:6px;color:#9f1239">Reference {{invoiceNumber}} · {{invoiceDate}}</div>
      <div style="margin-top:6px;color:#9f1239">{{notes}}</div>
    </div>
    <div style="border-radius:8px;background:#be123c;color:#fff;padding:12px 16px;text-align:right">
      <div style="font-size:11px;color:#ffe4e6">Additional Due</div>
      <div style="font-size:24px;font-weight:800">{{total}}</div>
    </div>
  </div>
</div>`,
  },
} as const;


function compileTemplatePreview(html: string, sample: Record<string, string>) {
  return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => sample[key] ?? '');
}

type TemplatePresetKey = keyof typeof templatePresets;
type TemplateDocType = 'tax_invoice' | 'tax_invoice_receipt' | 'receipt' | 'credit_note' | 'debit_note';
type TemplateLanguage = 'th' | 'en' | 'both';
type TemplateFormState = {
  name: string;
  type: TemplateDocType;
  language: TemplateLanguage;
  htmlTh: string;
  htmlEn: string;
  isActive: boolean;
};
export default function TemplatesTab({ isThai, t }: { isThai: boolean; t: (k: string) => string }) {
  const { token } = useAuthStore();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const emptyTemplateForm: TemplateFormState = {
    name: '',
    type: 'tax_invoice' as TemplateDocType,
    language: 'both' as TemplateLanguage,
    htmlTh: templatePresets.taxInvoice.th,
    htmlEn: templatePresets.taxInvoice.en,
    isActive: false,
  };
  const [templates, setTemplates] = useState<Array<{
    id: string;
    name: string;
    type: TemplateDocType;
    language: TemplateLanguage;
    htmlTh: string;
    htmlEn: string;
    isActive: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState(emptyTemplateForm);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const previewLanguage = form.language === 'en' ? 'en' : 'th';
  const previewHtml = compileTemplatePreview(
    previewLanguage === 'en' ? form.htmlEn : form.htmlTh,
    templatePreviewSamples[previewLanguage],
  );
  const typeOptions = [
    {
      value: 'tax_invoice',
      label: 'T02',
      th: 'ใบกำกับภาษีสำหรับขายเชื่อหรือยังไม่รับชำระ',
      en: 'Tax invoice for credit sales or unpaid transactions',
    },
    {
      value: 'tax_invoice_receipt',
      label: 'T01',
      th: 'ใบกำกับภาษีพร้อมใบเสร็จสำหรับขายสด',
      en: 'Combined tax invoice and receipt for immediate payment',
    },
    {
      value: 'receipt',
      label: 'T03',
      th: 'ใบเสร็จรับเงินจากใบกำกับภาษีเดิม',
      en: 'Receipt issued against an earlier tax invoice',
    },
    {
      value: 'credit_note',
      label: 'T04',
      th: 'ใบลดหนี้เพื่อปรับลดมูลค่าเอกสารเดิม',
      en: 'Credit note used to reduce an earlier document value',
    },
    {
      value: 'debit_note',
      label: 'T05',
      th: 'ใบเพิ่มหนี้เพื่อเพิ่มยอดจากเอกสารเดิม',
      en: 'Debit note used to add charges to an earlier document',
    },
  ] as const;
  const presetOptions = [
    {
      key: 'taxInvoice' as const,
      name: templatePresets.taxInvoice.nameTh,
      description: isThai ? templatePresets.taxInvoice.descriptionTh : templatePresets.taxInvoice.descriptionEn,
    },
    {
      key: 'taxInvoiceReceipt' as const,
      name: templatePresets.taxInvoiceReceipt.nameTh,
      description: isThai ? templatePresets.taxInvoiceReceipt.descriptionTh : templatePresets.taxInvoiceReceipt.descriptionEn,
    },
    {
      key: 'receipt' as const,
      name: templatePresets.receipt.nameTh,
      description: isThai ? templatePresets.receipt.descriptionTh : templatePresets.receipt.descriptionEn,
    },
    {
      key: 'creditNote' as const,
      name: templatePresets.creditNote.nameTh,
      description: isThai ? templatePresets.creditNote.descriptionTh : templatePresets.creditNote.descriptionEn,
    },
    {
      key: 'debitNote' as const,
      name: templatePresets.debitNote.nameTh,
      description: isThai ? templatePresets.debitNote.descriptionTh : templatePresets.debitNote.descriptionEn,
    },
  ];

  useEffect(() => {
    let active = true;
    async function loadTemplates() {
      try {
        const res = await fetch('/api/admin/templates', { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json() as { data?: typeof templates; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Failed to fetch templates');
        if (active) setTemplates(json.data ?? []);
      } catch (e) {
        if (active) setMsg({ type: 'err', text: (e as Error).message });
      } finally {
        if (active) setLoading(false);
      }
    }
    loadTemplates();
    return () => { active = false; };
  }, [token]);

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const url = editingId ? `/api/admin/templates/${editingId}` : '/api/admin/templates';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const json = await res.json() as { data?: typeof templates[number]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      if (json.data) {
        setTemplates((prev) => editingId ? prev.map((item) => item.id === json.data!.id ? json.data! : item) : [...prev, json.data!]);
      }
      setMsg({ type: 'ok', text: isThai ? 'บันทึกแม่แบบแล้ว' : 'Template saved' });
      setEditingId(null);
      setForm(emptyTemplateForm);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(template: typeof templates[number]) {
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      const json = await res.json() as { data?: typeof templates[number]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      if (json.data) {
        setTemplates((prev) => prev.map((item) => item.id === json.data!.id ? json.data! : { ...item, isActive: item.id === json.data!.id ? json.data!.isActive : false }));
      }
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  async function deleteTemplate(id: string) {
    setConfirmDialog(null);
    try {
      const res = await fetch(`/api/admin/templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed');
      setTemplates((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  function requestDeleteTemplate(template: typeof templates[number]) {
    setConfirmDialog({
      tone: 'error',
      title: isThai ? 'ลบแม่แบบนี้?' : 'Delete this template?',
      description: isThai
        ? 'แม่แบบนี้จะถูกนำออกจากรายการอีเมล/เอกสารที่เลือกใช้ได้'
        : 'This template will be removed from the available email/document templates.',
      confirmLabel: isThai ? 'ลบแม่แบบ' : 'Delete template',
      cancelLabel: isThai ? 'ยกเลิก' : 'Cancel',
      detail: (
        <div>
          <p className="font-semibold text-slate-900">{template.name}</p>
          <p className="mt-1 text-xs text-slate-500">{template.type} · {template.language}</p>
        </div>
      ),
      onConfirm: () => void deleteTemplate(template.id),
      onCancel: () => setConfirmDialog(null),
    });
  }

  function exportTemplate(template: typeof templates[number]) {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      template: {
        name: template.name,
        type: template.type,
        language: template.language,
        htmlTh: template.htmlTh,
        htmlEn: template.htmlEn,
        isActive: false,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${template.name.replace(/\s+/g, '-').toLowerCase() || 'template'}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg({
      type: 'ok',
      text: isThai ? 'ส่งออก template เป็น JSON แล้ว' : 'Template exported as JSON.',
    });
  }

  async function importTemplateFile(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        template?: {
          name?: string;
          type?: typeof emptyTemplateForm.type;
          language?: typeof emptyTemplateForm.language;
          htmlTh?: string;
          htmlEn?: string;
          isActive?: boolean;
        };
      };
      const imported = parsed.template;
      if (!imported?.name || !imported.type || !imported.language || !imported.htmlTh || !imported.htmlEn) {
        throw new Error(isThai ? 'ไฟล์ template JSON ไม่ครบหรือรูปแบบไม่ถูกต้อง' : 'Template JSON is incomplete or invalid.');
      }
      setEditingId(null);
      setForm({
        name: imported.name,
        type: imported.type,
        language: imported.language,
        htmlTh: imported.htmlTh,
        htmlEn: imported.htmlEn,
        isActive: imported.isActive ?? false,
      });
      setMsg({
        type: 'ok',
        text: isThai ? 'นำเข้า template แล้ว ตรวจสอบและกดบันทึกได้เลย' : 'Template imported. Review it and save when ready.',
      });
    } catch (error) {
      setMsg({
        type: 'err',
        text: error instanceof Error ? error.message : (isThai ? 'นำเข้า template ไม่สำเร็จ' : 'Template import failed.'),
      });
    }
  }

  function applyPreset(presetKey: TemplatePresetKey) {
    const preset = templatePresets[presetKey];
    setForm((prev) => ({
      ...prev,
      type: preset.type as TemplateDocType,
      language: 'both',
      htmlTh: preset.th,
      htmlEn: preset.en,
      name: prev.name || preset.nameTh,
    }));
    setMsg({
      type: 'ok',
      text: isThai ? 'เติม preset ให้แล้ว คุณแก้ข้อความต่อได้ทันที' : 'Preset applied. You can keep editing the copy and layout.',
    });
  }

  async function createStandardTemplateSet() {
    setSaving(true);
    setMsg(null);
    try {
      const createdTemplates: typeof templates = [];
      for (const preset of Object.values(templatePresets)) {
        const res = await fetch('/api/admin/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: preset.nameTh,
            type: preset.type,
            language: 'both',
            htmlTh: preset.th,
            htmlEn: preset.en,
            isActive: false,
          }),
        });
        const json = await res.json() as { data?: typeof templates[number]; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed to create template set');
        createdTemplates.push(json.data);
      }
      setTemplates((prev) => [...prev, ...createdTemplates]);
      setMsg({
        type: 'ok',
        text: isThai ? 'สร้างชุด template มาตรฐานครบ T01-T05 แล้ว' : 'Created the full T01-T05 standard template set.',
      });
    } catch (error) {
      setMsg({
        type: 'err',
        text: error instanceof Error ? error.message : (isThai ? 'สร้างชุด template ไม่สำเร็จ' : 'Failed to create template set.'),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6 text-gray-400"/></div>;

  return (
    <div className="space-y-5">
      <ConfirmDialog dialog={confirmDialog} />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg text-gray-900">{t('admin.templates')}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {isThai ? 'จัดการแม่แบบเอกสารที่ระบบใช้ตอน Preview / PDF' : 'Manage document templates used by preview and PDF rendering.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void importTemplateFile(file);
              }
              e.currentTarget.value = '';
            }}
          />
          <button type="button" className="btn-secondary text-sm" onClick={() => importInputRef.current?.click()}>
            {isThai ? 'นำเข้า JSON' : 'Import JSON'}
          </button>
          <button type="button" className="btn-primary text-sm" onClick={createStandardTemplateSet} disabled={saving}>
            <Sparkles className="h-4 w-4" />
            {isThai ? 'สร้างชุด T01-T05' : 'Create T01-T05 set'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <p className="font-semibold">
          {isThai ? 'หน้านี้ไม่ใช่หน้าสร้าง invoice' : 'This is not the invoice creation screen'}
        </p>
        <p className="mt-1">
          {isThai
            ? 'ใช้สำหรับปรับ HTML แม่แบบของ preview/PDF เท่านั้น ส่วนการออกเอกสารจริงให้ไปที่เมนูสร้างใบกำกับภาษี'
            : 'Use this page only to customize the HTML template used in preview and PDF output. To create actual documents, go to the invoice builder.'}
        </p>
      </div>

      <form onSubmit={saveTemplate} className="rounded-2xl border border-gray-200 p-4 space-y-4 bg-gray-50/60">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="label">{isThai ? 'ชื่อแม่แบบ' : 'Template name'}</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">{isThai ? 'ประเภทเอกสาร' : 'Document type'}</label>
            <select className="input-field" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as typeof form.type }))}>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {isThai ? option.th : option.en}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{isThai ? 'ภาษา' : 'Language'}</label>
            <select className="input-field" value={form.language} onChange={(e) => setForm((p) => ({ ...p, language: e.target.value as typeof form.language }))}>
              <option value="th">TH</option>
              <option value="en">EN</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
              {isThai ? 'เปิดใช้งานทันที' : 'Activate now'}
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-2xl bg-white px-4 py-3 text-xs text-gray-600">
          <div>
            <p className="font-semibold text-gray-900">{isThai ? 'Template ทำอะไร' : 'What a template changes'}</p>
            <p className="mt-1">{isThai ? 'มีผลกับรูปแบบ preview และ PDF เช่น header, footer, block ข้อความ' : 'It changes preview and PDF layout such as headers, footers, and text blocks.'}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900">{isThai ? 'Template ไม่ได้ทำอะไร' : 'What a template does not change'}</p>
            <p className="mt-1">{isThai ? 'ไม่ได้สร้าง invoice ใหม่ และไม่ได้เปลี่ยนข้อมูลลูกค้า/ยอดเงินในเอกสารเดิม' : 'It does not create invoices and does not change customer or amount data in existing documents.'}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900">{isThai ? 'ก่อนเปิดใช้งาน' : 'Before activating'}</p>
            <p className="mt-1">{isThai ? 'ควรทดสอบด้วย preview จากหน้าออกเอกสารก่อนเสมอ' : 'Always test with document preview in the invoice builder first.'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-xs text-sky-900">
          <p className="font-semibold">{isThai ? 'ตัวแปรที่ใช้ใน template ได้' : 'Template variables you can use'}</p>
          <p className="mt-1">
            {isThai
              ? 'รองรับตัวแปรเช่น {{documentTitle}}, {{invoiceNumber}}, {{invoiceDate}}, {{dueDate}}, {{sellerName}}, {{buyerName}}, {{subtotal}}, {{vatAmount}}, {{total}}, {{amountInWords}}, {{paymentMethod}}, {{notes}}'
              : 'Supported placeholders include {{documentTitle}}, {{invoiceNumber}}, {{invoiceDate}}, {{dueDate}}, {{sellerName}}, {{buyerName}}, {{subtotal}}, {{vatAmount}}, {{total}}, {{amountInWords}}, {{paymentMethod}}, and {{notes}}.'}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <FlaskConical className="h-4 w-4 text-sky-600" />
            {isThai ? 'Preset เริ่มต้น' : 'Starter presets'}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {isThai ? 'เลือก template ตามประเภทเอกสาร หรือกดสร้างชุด T01-T05 เพื่อเพิ่มครบทุกแบบให้เลือกใช้' : 'Pick a document-specific template, or create the full T01-T05 set for selection in the invoice builder.'}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {presetOptions.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset.key)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-sky-300 hover:bg-sky-50"
              >
                <div className="text-xs font-bold text-sky-700">{templatePresets[preset.key].label}</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{preset.name}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{preset.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr,1.1fr,0.95fr]">
          <div>
            <label className="label">HTML TH</label>
            <textarea className="input-field font-mono text-xs min-h-36" value={form.htmlTh} onChange={(e) => setForm((p) => ({ ...p, htmlTh: e.target.value }))} />
          </div>
          <div>
            <label className="label">HTML EN</label>
            <textarea className="input-field font-mono text-xs min-h-36" value={form.htmlEn} onChange={(e) => setForm((p) => ({ ...p, htmlEn: e.target.value }))} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{isThai ? 'Live Preview' : 'Live Preview'}</p>
                <p className="text-xs text-slate-500">
                  {previewLanguage === 'en'
                    ? (isThai ? 'กำลังดูตัวอย่างภาษาอังกฤษ' : 'Showing the English sample')
                    : (isThai ? 'กำลังดูตัวอย่างภาษาไทย' : 'Showing the Thai sample')}
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {previewLanguage}
              </span>
            </div>
            <div className="mt-3 h-[22rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <iframe
                title="Template live preview"
                srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>body{margin:0;padding:18px;font-family:Sarabun,system-ui,sans-serif;background:#f8fafc;color:#0f172a} .stage{border:1px solid #dbe2ea;border-radius:18px;background:#fff;padding:18px;box-shadow:0 10px 30px rgba(15,23,42,.06)} .eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin-bottom:10px} .title{font-size:20px;font-weight:700;color:#1e3a8a;margin-bottom:14px} .meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px} .meta-card{border:1px solid #e2e8f0;border-radius:14px;padding:10px 12px;background:#f8fafc;font-size:12px;color:#475569} .slot{border:1px dashed #cbd5e1;border-radius:16px;padding:14px;background:#fff}</style></head><body><div class="stage"><div class="eyebrow">Live Template Preview</div><div class="title">${templatePreviewSamples[previewLanguage].documentTitle}</div><div class="meta"><div class="meta-card">No. ${templatePreviewSamples[previewLanguage].invoiceNumber}</div><div class="meta-card">Date ${templatePreviewSamples[previewLanguage].invoiceDate}</div></div><div class="slot">${previewHtml || '<div style="color:#94a3b8">Empty template</div>'}</div></div></body></html>`}
                className="h-full w-full bg-white"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editingId ? (isThai ? 'บันทึกการแก้ไข' : 'Save changes') : (isThai ? 'สร้างแม่แบบ' : 'Create template')}
          </button>
          {editingId && (
            <button type="button" className="btn-secondary" onClick={() => {
              setEditingId(null);
              setForm(emptyTemplateForm);
            }}>
              {isThai ? 'ยกเลิก' : 'Cancel'}
            </button>
          )}
        </div>
      </form>

      {msg && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {templates.map((tpl) => (
          <div key={tpl.id} className={`border rounded-xl p-4 ${tpl.isActive ? 'border-primary-300 bg-primary-50/40' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">{tpl.name}</span>
                  {tpl.isActive && <span className="badge-success text-xs">{isThai ? 'ใช้งานอยู่' : 'Active'}</span>}
                </div>
                <p className="text-xs text-gray-500 uppercase">{tpl.type} · {tpl.language}</p>
              </div>
              <Sparkles className="w-4 h-4 text-primary-500 flex-shrink-0" />
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button className="btn-secondary text-xs" onClick={() => {
                setEditingId(tpl.id);
                setForm({
                  name: tpl.name,
                  type: tpl.type,
                  language: tpl.language,
                  htmlTh: tpl.htmlTh,
                  htmlEn: tpl.htmlEn,
                  isActive: tpl.isActive,
                });
              }}>
                {t('common.edit')}
              </button>
              <button className="btn-primary text-xs" onClick={() => toggleActive(tpl)}>
                {tpl.isActive ? (isThai ? 'ปิดใช้งาน' : 'Disable') : (isThai ? 'ตั้งเป็นใช้งาน' : 'Set active')}
              </button>
            </div>
            <button className="mt-2 text-xs text-sky-700 hover:underline" onClick={() => exportTemplate(tpl)}>
              {isThai ? 'ส่งออก JSON' : 'Export JSON'}
            </button>
            <button className="mt-2 text-xs text-red-600 hover:underline" onClick={() => requestDeleteTemplate(tpl)}>
              {t('common.delete')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
