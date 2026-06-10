import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileCheck2,
  Send,
  WalletCards,
} from 'lucide-react';
import clsx from 'clsx';

export type DocumentStageState = 'done' | 'current' | 'pending' | 'blocked';

export interface DocumentStageStep {
  id: string;
  label: string;
  description?: string;
  meta?: string;
  state: DocumentStageState;
}

interface DocumentStageCalendarProps {
  title: string;
  description: string;
  steps: DocumentStageStep[];
  isThai: boolean;
  className?: string;
}

const stateCopy = {
  done: { th: 'เสร็จแล้ว', en: 'Done' },
  current: { th: 'กำลังดำเนินการ', en: 'In progress' },
  pending: { th: 'รอดำเนินการ', en: 'Pending' },
  blocked: { th: 'ติดขัด', en: 'Blocked' },
} satisfies Record<DocumentStageState, { th: string; en: string }>;

function toneFor(state: DocumentStageState) {
  switch (state) {
    case 'done':
      return {
        frame: 'border-emerald-200 bg-emerald-50/70 text-emerald-950',
        iconWrap: 'bg-emerald-600 text-white shadow-emerald-700/18',
        icon: CheckCircle2,
        bar: 'bg-emerald-500',
        label: 'text-emerald-800',
      };
    case 'current':
      return {
        frame: 'document-stage-card-current border-primary-200 bg-primary-50 text-primary-950 shadow-primary-900/10',
        iconWrap: 'document-stage-pulse bg-primary-700 text-white shadow-primary-700/25',
        icon: Clock3,
        bar: 'document-stage-live-bar bg-primary-700',
        label: 'text-primary-800',
      };
    case 'blocked':
      return {
        frame: 'border-rose-200 bg-rose-50/80 text-rose-950',
        iconWrap: 'bg-rose-600 text-white shadow-rose-700/18',
        icon: AlertTriangle,
        bar: 'bg-rose-500',
        label: 'text-rose-800',
      };
    default:
      return {
        frame: 'border-slate-200 bg-white text-slate-700',
        iconWrap: 'bg-slate-100 text-slate-500 shadow-slate-900/5',
        icon: CircleDashed,
        bar: 'bg-slate-200',
        label: 'text-slate-500',
      };
  }
}

function iconFor(id: string) {
  if (id.includes('paid') || id.includes('payment') || id.includes('receipt')) return WalletCards;
  if (id.includes('rd') || id.includes('sent') || id.includes('download') || id.includes('share')) return Send;
  if (id.includes('approved') || id.includes('delivered') || id.includes('accepted')) return CheckCircle2;
  return FileCheck2;
}

export default function DocumentStageCalendar({
  title,
  description,
  steps,
  isThai,
  className,
}: DocumentStageCalendarProps) {
  return (
    <section
      className={clsx(
        'document-stage-calendar rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-primary-50/45 p-4 shadow-sm',
        className,
      )}
      aria-label={title}
    >
      <style>{`
        .document-stage-pulse {
          animation: documentStagePulse 1.9s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        .document-stage-live-bar {
          transform-origin: left center;
          animation: documentStageBar 1.2s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .document-stage-card-current {
          animation: documentStageLift 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes documentStagePulse {
          0% { box-shadow: 0 0 0 0 rgba(30,58,138,0.22), 0 14px 28px rgba(30,58,138,0.16); }
          72% { box-shadow: 0 0 0 10px rgba(30,58,138,0), 0 14px 28px rgba(30,58,138,0.16); }
          100% { box-shadow: 0 0 0 0 rgba(30,58,138,0), 0 14px 28px rgba(30,58,138,0.16); }
        }
        @keyframes documentStageBar {
          from { transform: scaleX(0.2); opacity: 0.35; }
          to { transform: scaleX(1); opacity: 1; }
        }
        @keyframes documentStageLift {
          from { transform: translateY(4px); opacity: 0.86; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .document-stage-pulse,
          .document-stage-live-bar,
          .document-stage-card-current {
            animation: none !important;
          }
        }
      `}</style>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">{title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <span className="hidden shrink-0 rounded-full border border-primary-100 bg-white px-3 py-1 text-xs font-bold text-primary-700 shadow-sm sm:inline-flex">
          {steps.filter((step) => step.state === 'done').length}/{steps.length}
        </span>
      </div>

      <ol className="mt-4 grid auto-cols-[minmax(220px,78vw)] grid-flow-col gap-3 overflow-x-auto pb-1 sm:grid-flow-row sm:grid-cols-2 sm:auto-cols-auto sm:overflow-visible sm:pb-0 lg:grid-cols-1">
        {steps.map((step, index) => {
          const tone = toneFor(step.state);
          const StateIcon = tone.icon;
          const StageIcon = iconFor(step.id);
          const stateLabel = stateCopy[step.state];

          return (
            <li
              key={step.id}
              className={clsx(
                'relative overflow-hidden rounded-2xl border p-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                tone.frame,
              )}
              title={step.description}
            >
              <div className="flex items-start gap-3">
                <span
                  className={clsx(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-lg',
                    tone.iconWrap,
                  )}
                  aria-hidden="true"
                >
                  <StageIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/75 text-xs font-bold text-slate-500 ring-1 ring-inset ring-slate-200">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate text-sm font-bold text-slate-900">{step.label}</span>
                  </span>
                  <span className={clsx('mt-1 inline-flex items-center gap-1 text-xs font-bold', tone.label)}>
                    <StateIcon className="h-3.5 w-3.5" />
                    {isThai ? stateLabel.th : stateLabel.en}
                  </span>
                  {step.meta && (
                    <span className="mt-1 block truncate text-xs font-semibold text-slate-500">{step.meta}</span>
                  )}
                </span>
              </div>
              {step.description && (
                <p className="mt-3 max-h-10 overflow-hidden text-xs leading-5 text-slate-500">{step.description}</p>
              )}
              <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <span className={clsx('block h-full rounded-full', tone.bar)} style={{ width: step.state === 'pending' ? '28%' : '100%' }} />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
