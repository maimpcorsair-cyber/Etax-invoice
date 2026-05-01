import { FormEvent, useRef, useState } from 'react';
import { Bot, Loader2, MessageCircle, Send, X } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';

type Role = 'assistant' | 'user';

interface Message {
  id: string;
  role: Role;
  content: string;
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AiChatWidget() {
  const { isThai } = useLanguage();
  const { token } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'hello',
      role: 'assistant',
      content: isThai
        ? 'สวัสดีครับ ผมพี่นุช ถามเรื่องเอกสาร ภาษีซื้อ/ขาย หรือสถานะในระบบได้เลยครับ'
        : 'Hi, I am Pinuch. Ask me about documents, VAT, or system status.',
    },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
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

  function submit(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  return (
    <div className="fixed bottom-20 left-4 z-50 lg:bottom-6 lg:left-auto lg:right-4">
      {open && (
        <div className="mb-3 flex h-[560px] w-[min(calc(100vw-2rem),390px)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-950 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold">{isThai ? 'พี่นุช AI' : 'Pinuch AI'}</p>
                <p className="text-xs text-gray-300">{isThai ? 'คุยผ่านเว็บ ไม่กิน LINE quota' : 'Web chat, no LINE quota'}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-white/10" aria-label="Close AI chat">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-3">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[84%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                    isUser ? 'bg-primary-600 text-white' : 'border border-gray-200 bg-white text-gray-800'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              );
            })}
            {sending && (
              <div className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isThai ? 'กำลังคิด...' : 'Thinking...'}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 bg-white p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(isThai ? ['มีเอกสารอะไรบ้าง', 'สรุปภาษีเดือนนี้', 'ใบค้างชำระ'] : ['What documents do we have?', 'Summarize VAT', 'Overdue invoices']).map((q) => (
                <button
                  key={q}
                  onClick={() => void send(q)}
                  disabled={sending}
                  className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2 py-1.5 focus-within:border-primary-300 focus-within:bg-white">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isThai ? 'ถามพี่นุช...' : 'Ask Pinuch...'}
                className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none"
                disabled={sending}
              />
              <button type="submit" disabled={sending || !input.trim()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-950 text-white shadow-xl transition-transform hover:scale-105"
        aria-label={isThai ? 'เปิด AI Chat' : 'Open AI Chat'}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
