import { Bot, ExternalLink, MessageSquareText } from 'lucide-react';
import { Link } from 'react-router-dom';
import AiChatPanel from '../components/AiChatPanel';
import { useLanguage } from '../hooks/useLanguage';

export default function AiChat() {
  const { isThai } = useLanguage();

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
                ? 'ฟังก์ชันเดียวกับ popup ทุกอย่าง: ถาม AI, อัปโหลดเอกสาร, อ่าน OCR และส่งไปรอตรวจในบันทึกซื้อ'
                : 'Same functions as the popup: chat, upload documents, OCR, and send them to Purchase Invoices for review.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/purchase-invoices" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <ExternalLink className="h-4 w-4" />
            {isThai ? 'บันทึกซื้อ' : 'Purchases'}
          </Link>
          <Link to="/app/invoices" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <ExternalLink className="h-4 w-4" />
            {isThai ? 'ใบกำกับ' : 'Invoices'}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <AiChatPanel heightClass="min-h-[680px]" />

        <aside className="space-y-3">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-center gap-2 font-bold">
              <MessageSquareText className="h-4 w-4" />
              {isThai ? 'ประหยัด LINE quota' : 'Save LINE quota'}
            </div>
            <p className="mt-2 leading-relaxed">
              {isThai
                ? 'ใช้หน้านี้หรือ popup สำหรับคุยยาวและอัปโหลดเอกสารผ่านเว็บ ส่วน LINE ใช้แจ้งเตือนและส่งเอกสารแบบเร็ว'
                : 'Use this page or the popup for longer conversations and web uploads. Keep LINE for quick notifications and document intake.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
