import { FormEvent, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, User, MessageSquareText, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { useAuthStore } from '../store/authStore';

type ChatRole = 'assistant' | 'user';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

const starterQuestionsTh = [
  'สรุปภาษีเดือนนี้ให้หน่อย',
  'มีใบค้างชำระไหม',
  'วิธีบันทึกสลิปธนาคารทำยังไง',
  'เอกสารซื้อเดือนนี้มีอะไรบ้าง',
];

const starterQuestionsEn = [
  'Summarize this month VAT',
  'Do we have overdue invoices?',
  'How do I record a bank slip?',
  'Show purchase documents this month',
];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AiChat() {
  const { isThai } = useLanguage();
  const { token, user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: isThai
        ? 'สวัสดีครับ ผมพี่นุช AI ผู้ช่วยบัญชีบนเว็บ คุยได้เหมือนใน LINE แต่ไม่กิน quota ข้อความ LINE ครับ ถามเรื่องภาษี เอกสารขาย เอกสารซื้อ หรือวิธีใช้งานระบบได้เลย'
        : 'Hi, I am Pinuch, your web accounting AI assistant. This works like the LINE bot, but it does not use LINE message quota.',
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const starters = useMemo(() => (isThai ? starterQuestionsTh : starterQuestionsEn), [isThai]);

  async function sendMessage(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/ai-chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'AI chat failed');
      const answer = json.data?.answer as string | undefined;
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          content: answer || (isThai ? 'ขอโทษครับ ตอนนี้ตอบไม่ได้ ลองถามใหม่อีกครั้งนะครับ' : 'Sorry, I could not answer that. Please try again.'),
          createdAt: json.data?.createdAt ?? new Date().toISOString(),
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI chat failed';
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          content: isThai
            ? 'ขอโทษครับ ระบบ AI สะดุดชั่วคราว กรุณาลองส่งใหม่อีกครั้ง'
            : 'Sorry, the AI service is temporarily unavailable. Please try again.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage();
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-950">
              {isThai ? 'AI Chat พี่นุช' : 'Pinuch AI Chat'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {isThai
                ? 'คุยกับ AI ผ่านเว็บ ไม่กิน quota LINE และใช้ข้อมูลบริษัทเดียวกับบอท LINE'
                : 'Chat on the web without consuming LINE message quota, using the same company context as the LINE bot.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/purchase-invoices" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <ExternalLink className="h-4 w-4" />
            {isThai ? 'เอกสารซื้อ' : 'Purchases'}
          </Link>
          <Link to="/app/invoices" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <ExternalLink className="h-4 w-4" />
            {isThai ? 'ใบกำกับ' : 'Invoices'}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">
              {isThai ? `กำลังคุยในบัญชี ${user?.name ?? ''}` : `Chatting as ${user?.name ?? ''}`}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {isThai ? 'เหมาะสำหรับถามข้อมูลระบบ ไม่เหมาะกับส่งไฟล์ เอกสารยังควรอัปโหลดที่ LINE หรือหน้าบันทึกซื้อ' : 'Best for questions. Upload documents through LINE or Purchase Invoices.'}
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50/70 px-4 py-5">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-primary-600 text-white'
                      : 'border border-gray-200 bg-white text-gray-800'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}
            {sending && (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-500 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isThai ? 'พี่นุชกำลังคิด...' : 'Pinuch is thinking...'}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="border-t border-gray-100 bg-white p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-2 focus-within:border-primary-300 focus-within:bg-white">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder={isThai ? 'ถามพี่นุช เช่น ภาษีซื้อเดือนนี้เท่าไร' : 'Ask Pinuch, e.g. summarize this month VAT'}
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={isThai ? 'ส่งข้อความ' : 'Send message'}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold text-gray-900">{isThai ? 'ถามเร็ว' : 'Quick asks'}</h2>
            </div>
            <div className="mt-3 space-y-2">
              {starters.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void sendMessage(question)}
                  disabled={sending}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:border-primary-200 hover:bg-primary-50 disabled:opacity-50"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-center gap-2 font-bold">
              <MessageSquareText className="h-4 w-4" />
              {isThai ? 'ประหยัด LINE quota' : 'Save LINE quota'}
            </div>
            <p className="mt-2 leading-relaxed">
              {isThai
                ? 'ใช้หน้านี้สำหรับคุยถามตอบยาว ๆ ส่วน LINE ให้ใช้รับเอกสาร สรุปสั้น ๆ และแจ้งเตือนสำคัญ'
                : 'Use this page for longer conversations. Keep LINE for document intake, short summaries, and important notifications.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
