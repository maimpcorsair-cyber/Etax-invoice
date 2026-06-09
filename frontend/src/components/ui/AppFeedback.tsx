import { useId, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';

export type FeedbackTone = 'success' | 'warning' | 'error' | 'info';

export interface FeedbackToast {
  id: string;
  tone: FeedbackTone;
  title: string;
  description?: string;
}

export interface ConfirmDialogState {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: Extract<FeedbackTone, 'warning' | 'error' | 'info'>;
  loading?: boolean;
  detail?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

const toneStyles: Record<FeedbackTone, { icon: typeof Info; toast: string; iconWrap: string; button: string }> = {
  success: {
    icon: CheckCircle2,
    toast: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    iconWrap: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    button: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-300',
  },
  warning: {
    icon: AlertTriangle,
    toast: 'border-amber-200 bg-amber-50 text-amber-900',
    iconWrap: 'bg-amber-100 text-amber-700 ring-amber-200',
    button: 'bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-300',
  },
  error: {
    icon: XCircle,
    toast: 'border-red-200 bg-red-50 text-red-900',
    iconWrap: 'bg-red-100 text-red-700 ring-red-200',
    button: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-300',
  },
  info: {
    icon: Info,
    toast: 'border-primary-200 bg-primary-50 text-primary-950',
    iconWrap: 'bg-primary-100 text-primary-700 ring-primary-200',
    button: 'bg-primary-700 text-white hover:bg-primary-800 focus-visible:ring-primary-300',
  },
};

export function ToastStack({ toasts, onDismiss }: { toasts: FeedbackToast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 top-20 z-[70] flex flex-col items-end gap-3 sm:left-auto sm:right-5 sm:w-[25rem]">
      {toasts.map((toast) => {
        const style = toneStyles[toast.tone];
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto w-full rounded-2xl border px-4 py-3 shadow-xl shadow-slate-950/10 ${style.toast}`}
            role="status"
          >
            <div className="flex gap-3">
              <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${style.iconWrap}`}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{toast.title}</p>
                {toast.description && <p className="mt-1 text-xs leading-5 opacity-85">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-current opacity-60 transition hover:bg-white/70 hover:opacity-100"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ConfirmDialog({ dialog }: { dialog: ConfirmDialogState | null }) {
  const titleId = useId();
  const descriptionId = useId();
  const detailId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(
    dialog !== null,
    () => {
      if (!dialog?.loading) dialog?.onCancel();
    },
  );

  if (!dialog) return null;
  const tone = dialog.tone ?? 'info';
  const style = toneStyles[tone];
  const Icon = style.icon;
  const describedBy = [
    dialog.description ? descriptionId : null,
    dialog.detail ? detailId : null,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="presentation">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
      >
        <div className="flex gap-4">
          <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${style.iconWrap}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold text-slate-950">
              {dialog.title}
            </h2>
            {dialog.description && (
              <p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-600">{dialog.description}</p>
            )}
          </div>
        </div>

        {dialog.detail && (
          <div id={detailId} className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {dialog.detail}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn-secondary justify-center"
            onClick={dialog.onCancel}
            disabled={dialog.loading}
            data-dialog-initial-focus
          >
            {dialog.cancelLabel}
          </button>
          <button
            type="button"
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${style.button}`}
            onClick={dialog.onConfirm}
            disabled={dialog.loading}
          >
            {dialog.loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" />
            ) : null}
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
