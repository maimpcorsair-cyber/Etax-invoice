import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

// Full-screen overlay used to present a full document builder "as a popup"
// over the list it was launched from (React Router background-location).
// The builder component is rendered as-is inside; closing returns to the
// previous route. Opening the builder URL directly (no backgroundLocation)
// still renders it as a standalone page, so deep links keep working.
export default function BuilderOverlay({ title, children }: { title?: string; children: ReactNode }) {
  const navigate = useNavigate();
  const { isThai } = useLanguage();
  const close = () => navigate(-1);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-100">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="min-w-0 truncate text-sm font-bold text-slate-950">{title}</p>
        <button
          type="button"
          onClick={close}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="h-4 w-4" />
          {isThai ? 'ปิดหน้าต่าง' : 'Close'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-screen-2xl px-3 py-4 sm:px-6 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
