import { useId } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, CircleDashed, Download, Loader2, Pencil, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { useDialogFocus } from '../hooks/useDialogFocus';

export type DocumentPreviewStepState = 'done' | 'current' | 'pending' | 'blocked';

export interface DocumentPreviewStep {
  id: string;
  label: string;
  description?: string;
  state: DocumentPreviewStepState;
}

interface DocumentPreviewSheetProps {
  open: boolean;
  title: string;
  description?: string;
  documentNumber: string;
  previewHtml: string | null;
  previewUrl?: string | null;
  loading: boolean;
  error?: string | null;
  downloading?: boolean;
  editHref?: string;
  statusSteps?: DocumentPreviewStep[];
  onDownload: () => void;
  onClose: () => void;
}

function fallbackSteps(isThai: boolean, loading: boolean, error?: string | null): DocumentPreviewStep[] {
  return [
    {
      id: 'created',
      label: isThai ? 'สร้างเอกสาร' : 'Document created',
      description: isThai ? 'เลขที่และข้อมูลหลักพร้อมแล้ว' : 'Document number and core data are ready.',
      state: 'done',
    },
    {
      id: 'preview',
      label: isThai ? 'เตรียมตัวอย่าง' : 'Preview generated',
      description: isThai ? 'ระบบกำลังจัดหน้าเอกสารให้ตรวจ' : 'Billboy is rendering the document for review.',
      state: error ? 'blocked' : loading ? 'current' : 'done',
    },
    {
      id: 'review',
      label: isThai ? 'ตรวจและแก้ไข' : 'Review and edit',
      description: isThai ? 'เช็กรายละเอียดก่อนส่งหรือนำไปใช้ต่อ' : 'Check details before sending or using it downstream.',
      state: error || loading ? 'pending' : 'current',
    },
    {
      id: 'share',
      label: isThai ? 'ส่งต่อ / ดาวน์โหลด' : 'Share or download',
      description: isThai ? 'ใช้ PDF หรือกลับไปแก้ไขได้ทันที' : 'Download the PDF or return to edit immediately.',
      state: 'pending',
    },
  ];
}

function stepTone(state: DocumentPreviewStepState) {
  switch (state) {
    case 'done':
      return {
        row: 'text-slate-800',
        dot: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        line: 'bg-emerald-200',
        icon: CheckCircle2,
      };
    case 'current':
      return {
        row: 'text-primary-900',
        dot: 'document-preview-current-dot border-primary-200 bg-primary-700 text-white shadow-lg shadow-primary-700/25',
        line: 'document-preview-active-line bg-primary-200',
        icon: Sparkles,
      };
    case 'blocked':
      return {
        row: 'text-rose-900',
        dot: 'border-rose-200 bg-rose-50 text-rose-700',
        line: 'bg-rose-200',
        icon: AlertTriangle,
      };
    default:
      return {
        row: 'text-slate-500',
        dot: 'border-slate-200 bg-white text-slate-400',
        line: 'bg-slate-200',
        icon: CircleDashed,
      };
  }
}

export default function DocumentPreviewSheet({
  open,
  title,
  description,
  documentNumber,
  previewHtml,
  previewUrl,
  loading,
  error,
  downloading = false,
  editHref,
  statusSteps,
  onDownload,
  onClose,
}: DocumentPreviewSheetProps) {
  const { isThai } = useLanguage();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogFocus<HTMLElement>(open, onClose);
  const steps = statusSteps?.length ? statusSteps : fallbackSteps(isThai, loading, error);
  const currentStep = steps.find((step) => step.state === 'current')
    ?? steps.find((step) => step.state === 'blocked')
    ?? [...steps].reverse().find((step) => step.state === 'done')
    ?? steps[0];

  if (!open) return null;

  const dialog = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:p-4 lg:p-6"
      role="presentation"
      onClick={onClose}
    >
      <style>{`
        .document-preview-stage {
          width: 100%;
          max-width: 980px;
          min-height: min(1123px, calc(100dvh - 260px));
          margin: 0 auto;
        }
        .document-preview-frame {
          width: 100%;
          height: 100%;
          min-height: inherit;
          border: 0;
          background: white;
        }
        .document-preview-current-dot {
          animation: documentPreviewPulse 1.9s ease-out infinite;
        }
        .document-preview-active-line {
          background-image: linear-gradient(180deg, rgba(30,58,138,0.78), rgba(45,212,191,0.38));
          animation: documentPreviewLine 1.8s ease-out both;
        }
        @keyframes documentPreviewPulse {
          0% { box-shadow: 0 0 0 0 rgba(30,58,138,0.22), 0 18px 34px rgba(30,58,138,0.18); }
          70% { box-shadow: 0 0 0 12px rgba(30,58,138,0), 0 18px 34px rgba(30,58,138,0.18); }
          100% { box-shadow: 0 0 0 0 rgba(30,58,138,0), 0 18px 34px rgba(30,58,138,0.18); }
        }
        @keyframes documentPreviewLine {
          from { transform: scaleY(0.2); opacity: 0.35; }
          to { transform: scaleY(1); opacity: 1; }
        }
        @media (max-width: 640px) {
          .document-preview-steps {
            display: flex;
            gap: 12px;
            overflow-x: auto;
            padding-bottom: 4px;
            scroll-snap-type: x proximity;
          }
          .document-preview-step {
            min-width: 220px;
            padding-bottom: 0 !important;
            scroll-snap-align: start;
          }
          .document-preview-step-line {
            display: none;
          }
          .document-preview-stage {
            width: calc(100vw - 32px);
            height: calc((100vw - 32px) * 1.414);
            min-height: 0;
            max-width: none;
          }
          .document-preview-frame {
            width: 794px;
            height: 1123px;
            min-height: 1123px;
            transform: scale(calc((100vw - 32px) / 794));
            transform-origin: top left;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .document-preview-current-dot,
          .document-preview-active-line {
            animation: none !important;
          }
        }
      `}</style>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl shadow-slate-950/20 sm:h-[min(920px,calc(100dvh-32px))] sm:w-[min(1720px,calc(100vw-32px))] sm:rounded-[28px] sm:border sm:border-white/80"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-primary-700">
                <Sparkles className="h-3.5 w-3.5" />
                {isThai ? 'ตัวอย่างเอกสาร' : 'Document preview'}
              </span>
              {currentStep && (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                  {currentStep.label}
                </span>
              )}
            </div>
            <h2 id={titleId} className="mt-2 truncate text-base font-bold text-slate-950 sm:text-xl">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
              <span className="font-mono font-semibold text-slate-700">{documentNumber}</span>
              {description ? ` · ${description}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
            aria-label={isThai ? 'ปิดตัวอย่างเอกสาร' : 'Close document preview'}
            data-dialog-initial-focus
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 bg-slate-100 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-h-0 max-h-[280px] overflow-auto border-b border-slate-200 bg-white/95 p-3 sm:p-4 lg:max-h-none lg:border-b-0 lg:border-r lg:p-5">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-primary-50/45 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">
                {isThai ? 'เส้นทางเอกสาร' : 'Document path'}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {isThai
                  ? 'ดูสถานะหลักจากตาราง แล้วเปิดเอกสารตรวจรายละเอียดต่อได้ในหน้าต่างเดียว'
                  : 'Track the main stage from the ledger, then inspect the document in one focused workspace.'}
              </p>
            </div>

            <ol className="document-preview-steps mt-4 space-y-1 sm:mt-5">
              {steps.map((step, index) => {
                const tone = stepTone(step.state);
                const Icon = tone.icon;
                return (
                  <li key={step.id} className="document-preview-step relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
                    {index < steps.length - 1 && (
                      <span
                        className={`document-preview-step-line absolute left-[19px] top-10 h-[calc(100%-2rem)] w-px origin-top rounded-full ${tone.line}`}
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border ${tone.dot}`}
                      aria-hidden="true"
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span className={`block text-sm font-bold ${tone.row}`}>{step.label}</span>
                      {step.description && (
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{step.description}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </aside>

          <div className="min-h-0 overflow-auto bg-[radial-gradient(circle_at_20%_0%,rgba(45,212,191,0.12),transparent_32%),radial-gradient(circle_at_100%_8%,rgba(201,168,76,0.12),transparent_28%),#eef2f7] p-3 sm:p-5 lg:p-6">
            {loading ? (
              <div className="flex h-full min-h-[420px] items-center justify-center">
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary-600 motion-reduce:animate-none" />
                  {isThai ? 'กำลังโหลดตัวอย่าง...' : 'Loading preview...'}
                </div>
              </div>
            ) : error ? (
              <div className="mx-auto mt-10 max-w-md rounded-2xl border border-rose-200 bg-white p-5 text-center shadow-sm">
                <p className="text-sm font-semibold text-rose-800">
                  {isThai ? 'โหลดตัวอย่างเอกสารไม่สำเร็จ' : 'Could not load the document preview'}
                </p>
                <p className="mt-2 text-xs text-rose-600">{error}</p>
              </div>
            ) : previewHtml ? (
              <div className="document-preview-stage overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/12">
                <iframe
                  srcDoc={previewHtml}
                  className="document-preview-frame"
                  title={title}
                  sandbox="allow-same-origin"
                />
              </div>
            ) : previewUrl ? (
              <div className="document-preview-stage overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/12">
                <iframe
                  src={previewUrl}
                  className="document-preview-frame"
                  title={title}
                  sandbox="allow-same-origin allow-scripts"
                />
              </div>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-slate-500">
                {isThai ? 'ยังไม่มีตัวอย่างเอกสาร' : 'No preview available'}
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white p-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] sm:flex-row sm:items-center sm:justify-end sm:p-4">
          {editHref && (
            <Link to={editHref} className="btn-secondary justify-center">
              <Pencil className="h-4 w-4" />
              {isThai ? 'แก้ไขเอกสาร' : 'Edit document'}
            </Link>
          )}
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading || loading || (!previewHtml && !previewUrl)}
            className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Download className="h-4 w-4" />}
            {downloading
              ? isThai ? 'กำลังสร้าง PDF...' : 'Generating PDF...'
              : isThai ? 'ดาวน์โหลด PDF' : 'Download PDF'}
          </button>
        </footer>
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}
