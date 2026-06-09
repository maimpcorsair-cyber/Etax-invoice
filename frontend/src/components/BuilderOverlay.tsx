import { useId, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useDialogFocus } from '../hooks/useDialogFocus';

// Full-screen overlay used to present a full document builder "as a popup"
// over the list it was launched from (React Router background-location).
// The builder component is rendered as-is inside; closing returns to the
// previous route. Opening the builder URL directly (no backgroundLocation)
// still renders it as a standalone page, so deep links keep working.
export default function BuilderOverlay({ title, closeTo, children }: { title?: string; closeTo: string; children: ReactNode }) {
  const navigate = useNavigate();
  const { isThai } = useLanguage();
  const close = () => navigate(closeTo);
  const titleId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(true, close);
  const resolvedTitle = title ?? (isThai ? 'สร้างเอกสาร' : 'Document builder');

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-slate-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h1 id={titleId} className="min-w-0 truncate text-sm font-bold text-slate-950">{resolvedTitle}</h1>
        <button
          type="button"
          onClick={close}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          data-dialog-initial-focus
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
