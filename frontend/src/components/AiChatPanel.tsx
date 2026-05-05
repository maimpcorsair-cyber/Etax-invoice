import { FormEvent, useRef, useState } from 'react';
import { Bot, Loader2, Paperclip, Send } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';

type Role = 'assistant' | 'user';

interface Message {
  id: string;
  role: Role;
  content: string;
}

interface AiChatPanelProps {
  className?: string;
  heightClass?: string;
  showHeader?: boolean;
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AiChatPanel({
  className = '',
  heightClass = 'h-[560px]',
  showHeader = true,
}: AiChatPanelProps) {
  const { isThai } = useLanguage();
  const { token } = useAuthStore();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'hello',
      role: 'assistant',
      content: isThai
        ? 'สวัสดีครับ ผมพี่นุช ถามเรื่องเอกสาร ภาษีซื้อ/ขาย สถานะในระบบ หรือแนบเอกสารให้ผมอ่านได้เลยครับ'
        : 'Hi, I am Pinuch. Ask me about documents, VAT, system status, or upload a document for me to read.',
    },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || sending || uploading) return;
    setMessages((prev) => [...prev, { id: id(), role: 'user', content: text }]);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/ai-chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'AI chat failed');
      setMessages((prev) => [...prev, {
        id: id(),
        role: 'assistant',
        content: json.data?.answer || (isThai ? 'ยังตอบไม่ได้ครับ ลองถามใหม่อีกครั้ง' : 'I could not answer that. Please try again.'),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: id(),
        role: 'assistant',
        content: isThai ? 'ระบบ AI สะดุดชั่วคราว กรุณาลองใหม่อีกครั้ง' : 'AI is temporarily unavailable. Please try again.',
      }]);
    } finally {
      setSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function uploadDocument(file: File) {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setMessages((prev) => [...prev, {
        id: id(),
        role: 'assistant',
        content: isThai ? 'รองรับเฉพาะ PDF, JPG, PNG และ WebP ครับ' : 'Only PDF, JPG, PNG, and WebP are supported.',
      }]);
      return;
    }

    setMessages((prev) => [...prev, {
      id: id(),
      role: 'user',
      content: `${isThai ? 'อัปโหลดเอกสาร' : 'Uploaded document'}: ${file.name}`,
    }]);
    setUploading(true);

    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/purchase-invoices/document-intakes/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileBase64 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');

      const status = json.data?.status as string | undefined;
      const result = json.data?.ocrResult as { supplierName?: string; invoiceNumber?: string; total?: number; confidence?: string } | undefined;
      const summary = [
        result?.supplierName ? `${isThai ? 'ผู้ขาย' : 'Supplier'}: ${result.supplierName}` : null,
        result?.invoiceNumber ? `${isThai ? 'เลขที่' : 'No.'}: ${result.invoiceNumber}` : null,
        result?.total ? `${isThai ? 'ยอดรวม' : 'Total'}: ${new Intl.NumberFormat(isThai ? 'th-TH' : 'en-US', { style: 'currency', currency: 'THB' }).format(result.total)}` : null,
        result?.confidence ? `${isThai ? 'ความมั่นใจ' : 'Confidence'}: ${result.confidence}` : null,
      ].filter(Boolean).join('\n');

      setMessages((prev) => [...prev, {
        id: id(),
        role: 'assistant',
        content: isThai
          ? `อ่านเอกสารแล้วครับ สถานะ: ${status ?? 'รอตรวจ'}\n${summary || 'ยังดึงข้อมูลหลักไม่ได้'}\n\nเอกสารนี้ถูกส่งไปหน้า บันทึกซื้อ เพื่อให้ตรวจ/ยืนยันก่อนบันทึกครับ`
          : `Document processed. Status: ${status ?? 'review pending'}\n${summary || 'Core fields were not extracted yet.'}\n\nIt is now in Purchase Invoices for review and confirmation.`,
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: id(),
        role: 'assistant',
        content: isThai ? 'อัปโหลดไม่สำเร็จครับ กรุณาลองใหม่ หรือไปอัปโหลดที่หน้าบันทึกซื้อ' : 'Upload failed. Please try again or upload from Purchase Invoices.',
      }]);
    } finally {
      setUploading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  return (
    <section className={`flex flex-col overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.14)] ${heightClass} ${className}`}>
      {showHeader && (
        <div className="relative flex items-center gap-3 overflow-hidden border-b border-primary-100 bg-[#f4f7fc] px-4 py-3 text-slate-900">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(30,58,138,0.45),transparent)] animate-command-scan" />
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-700 text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">{isThai ? 'พี่นุช AI' : 'Pinuch AI'}</p>
            <p className="text-xs text-slate-500">{isThai ? 'คุยผ่านเว็บ ไม่กิน LINE quota' : 'Web chat, no LINE quota'}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-command-pulse" />
            {isThai ? 'พร้อมช่วย' : 'Ready'}
          </span>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto bg-[#f7f9fd] p-3">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[84%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm animate-message-rise ${
                isUser ? 'bg-primary-700 text-white' : 'border border-primary-100 bg-white text-slate-800'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          );
        })}
        {(sending || uploading) && (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-primary-100 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm animate-message-rise">
            <Loader2 className="h-4 w-4 animate-spin" />
            {uploading ? (isThai ? 'กำลังอ่านเอกสาร...' : 'Reading document...') : (isThai ? 'กำลังคิด...' : 'Thinking...')}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 bg-white p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(isThai ? ['มีเอกสารอะไรบ้าง', 'สรุปภาษีเดือนนี้', 'ใบค้างชำระ'] : ['What documents do we have?', 'Summarize VAT', 'Overdue invoices']).map((q) => (
            <button
              key={q}
              onClick={() => void send(q)}
              disabled={sending || uploading}
              className="rounded-full border border-primary-100 bg-primary-50/40 px-2.5 py-1 text-xs font-medium text-primary-800 transition hover:border-primary-200 hover:bg-primary-50 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex items-center gap-2 rounded-xl border border-primary-100 bg-[#f7f9fd] px-2 py-1.5 transition focus-within:border-primary-300 focus-within:bg-white focus-within:shadow-glow">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              if (file) void uploadDocument(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={sending || uploading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-primary-50 hover:text-primary-800 disabled:opacity-50"
            aria-label={isThai ? 'อัปโหลดเอกสาร' : 'Upload document'}
            title={isThai ? 'อัปโหลดเอกสาร' : 'Upload document'}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isThai ? 'ถามพี่นุช...' : 'Ask Pinuch...'}
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none"
            disabled={sending || uploading}
          />
          <button type="submit" disabled={sending || uploading || !input.trim()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-700 text-white transition hover:bg-primary-800 disabled:opacity-50">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </section>
  );
}
