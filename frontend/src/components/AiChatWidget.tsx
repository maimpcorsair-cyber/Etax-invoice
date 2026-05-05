import { MessageCircle, X } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import AiChatPanel from './AiChatPanel';

export default function AiChatWidget() {
  const { isThai } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-20 left-4 z-50 lg:bottom-6 lg:left-auto lg:right-4">
      {open && (
        <div className="mb-3 w-[min(calc(100vw-2rem),390px)] animate-command-panel-in">
          <AiChatPanel heightClass="h-[560px]" />
        </div>
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        className="group relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-primary-200 bg-white text-primary-800 shadow-[0_14px_36px_rgba(30,58,138,0.18)] transition hover:-translate-y-0.5 hover:border-primary-300 hover:bg-primary-50"
        aria-label={isThai ? 'เปิด AI Chat' : 'Open AI Chat'}
      >
        <span className="absolute inset-x-2 top-2 h-px bg-primary-200/80" />
        <span className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-emerald-400/70 blur-[2px] transition group-hover:scale-125" />
        {open ? <X className="relative h-6 w-6" /> : <MessageCircle className="relative h-6 w-6" />}
      </button>
    </div>
  );
}
