import { useId, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useDialogFocus } from '../hooks/useDialogFocus';

// Large workspace modal used to present document builders over the page they
// were launched from. Desktop keeps the previous ledger visible around the
// modal; compact screens use the full viewport so the builder remains usable.
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
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-950/30 p-0 sm:p-3 lg:p-6 xl:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="mx-auto flex h-full w-full max-w-[1720px] flex-col overflow-hidden bg-slate-100 shadow-2xl sm:rounded-lg sm:ring-1 sm:ring-slate-950/10 lg:w-[92vw] xl:w-[90vw]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
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
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <div className="mx-auto max-w-screen-2xl px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
