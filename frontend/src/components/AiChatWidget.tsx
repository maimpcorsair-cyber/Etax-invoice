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
        <div className="mb-3 w-[min(calc(100vw-2rem),390px)]">
          <AiChatPanel heightClass="h-[560px]" />
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
