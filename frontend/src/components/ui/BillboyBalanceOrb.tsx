import clsx from 'clsx';
import type { CSSProperties } from 'react';

type BalanceTone = 'navy' | 'emerald' | 'rose' | 'amber';

export interface BalanceMetric {
  label: string;
  value: string;
  amount: number;
  tone?: BalanceTone;
}

interface BillboyBalanceOrbProps {
  title: string;
  subtitle: string;
  centerLabel: string;
  centerValue: string;
  left: BalanceMetric;
  right: BalanceMetric;
  footnote?: string;
  className?: string;
}

const toneClasses: Record<BalanceTone, { text: string; dot: string; wash: string }> = {
  navy: { text: 'text-primary-800', dot: 'bg-primary-700', wash: 'bg-primary-50' },
  emerald: { text: 'text-emerald-700', dot: 'bg-emerald-500', wash: 'bg-emerald-50' },
  rose: { text: 'text-rose-700', dot: 'bg-rose-500', wash: 'bg-rose-50' },
  amber: { text: 'text-amber-700', dot: 'bg-amber-500', wash: 'bg-amber-50' },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function BillboyBalanceOrb({
  title,
  subtitle,
  centerLabel,
  centerValue,
  left,
  right,
  footnote,
  className,
}: BillboyBalanceOrbProps) {
  const leftTone = toneClasses[left.tone ?? 'navy'];
  const rightTone = toneClasses[right.tone ?? 'emerald'];
  const total = Math.abs(left.amount) + Math.abs(right.amount);
  const balance = total > 0 ? (Math.abs(left.amount) - Math.abs(right.amount)) / total : 0;
  const tilt = clamp(balance * -8, -8, 8);
  const leftWeight = total > 0 ? clamp((Math.abs(left.amount) / total) * 100, 12, 88) : 50;
  const rightWeight = 100 - leftWeight;

  return (
    <section
      className={clsx(
        'billboy-balance-orb relative isolate overflow-hidden rounded-[22px] border border-white/80 bg-white/[0.82] p-4 shadow-[0_18px_54px_rgba(30,58,138,0.11)] backdrop-blur-md',
        className,
      )}
      aria-label={title}
    >
      <style>{`
        .billboy-balance-orb::before {
          content: "";
          position: absolute;
          inset: -34% -18%;
          z-index: -2;
          background:
            radial-gradient(circle at 50% 44%, rgba(30,58,138,0.14), transparent 22%),
            radial-gradient(circle at 28% 22%, rgba(45,212,191,0.18), transparent 24%),
            radial-gradient(circle at 76% 70%, rgba(201,168,76,0.14), transparent 25%);
          animation: billboyBalanceDrift 18s cubic-bezier(0.22, 1, 0.36, 1) infinite alternate;
        }
        .billboy-balance-orb::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          opacity: 0.36;
          background-image:
            linear-gradient(rgba(30,58,138,0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30,58,138,0.055) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: radial-gradient(circle at center, black 18%, transparent 74%);
        }
        .billboy-balance-ring {
          animation: billboyBalanceRing 13s linear infinite;
          transform-origin: center;
        }
        .billboy-balance-ring-slow {
          animation-duration: 19s;
          animation-direction: reverse;
        }
        .billboy-balance-beam {
          transform-origin: 120px 112px;
          animation: billboyBalanceSettle 5.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        @keyframes billboyBalanceDrift {
          from { transform: translate3d(-2%, -1%, 0) scale(1); }
          to { transform: translate3d(2%, 1%, 0) scale(1.05); }
        }
        @keyframes billboyBalanceRing {
          to { transform: rotate(360deg); }
        }
        @keyframes billboyBalanceSettle {
          0%, 100% { transform: rotate(calc(var(--balance-tilt) * 1deg)); }
          50% { transform: rotate(calc((var(--balance-tilt) * 1deg) + 1.8deg)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .billboy-balance-orb::before,
          .billboy-balance-ring,
          .billboy-balance-beam {
            animation: none !important;
          }
        }
      `}</style>

      <div className="relative z-10 grid gap-4 sm:grid-cols-[minmax(0,1fr)_168px] sm:items-center">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">{title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500">{centerLabel}</p>
            <p className="mt-1 truncate text-2xl font-bold leading-none text-slate-950 tabular-nums">{centerValue}</p>
          </div>
        </div>

        <div className="relative mx-auto h-40 w-40 sm:h-44 sm:w-44" style={{ '--balance-tilt': tilt } as CSSProperties}>
          <svg viewBox="0 0 240 240" className="h-full w-full" role="img" aria-hidden="true">
            <circle className="billboy-balance-ring fill-transparent stroke-primary-100" cx="120" cy="120" r="96" strokeWidth="1.5" strokeDasharray="12 9" />
            <circle className="billboy-balance-ring billboy-balance-ring-slow fill-transparent stroke-teal-200/70" cx="120" cy="120" r="72" strokeWidth="1.5" strokeDasharray="4 10" />
            <circle className="fill-white/70 stroke-white" cx="120" cy="120" r="48" strokeWidth="1" />
            <g className="billboy-balance-beam">
              <line x1="58" y1="112" x2="182" y2="112" className="stroke-primary-700" strokeWidth="5" strokeLinecap="round" />
              <circle cx="120" cy="112" r="8" className="fill-primary-700" />
              <line x1="120" y1="112" x2="120" y2="176" className="stroke-primary-500" strokeWidth="3" strokeLinecap="round" />
              <path d="M92 176h56l-10 16h-36z" className="fill-primary-50 stroke-primary-500" strokeWidth="2" />
              <line x1="48" y1="132" x2="68" y2="132" className="stroke-emerald-500" strokeWidth="3" strokeLinecap="round" />
              <line x1="172" y1="132" x2="192" y2="132" className="stroke-amber-500" strokeWidth="3" strokeLinecap="round" />
            </g>
            <circle cx="58" cy="112" r={10 + leftWeight / 12} className="fill-emerald-100 stroke-emerald-500" strokeWidth="2" />
            <circle cx="182" cy="112" r={10 + rightWeight / 12} className="fill-amber-100 stroke-amber-500" strokeWidth="2" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-center">
            <div className="rounded-full bg-white/[0.88] px-4 py-3 shadow-sm ring-1 ring-primary-100">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary-700">Balance</p>
              <p className="mt-1 text-sm font-bold text-slate-950">{Math.round(leftWeight)} / {Math.round(rightWeight)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-4 grid gap-2 sm:grid-cols-2">
        {[left, right].map((metric, index) => {
          const tone = index === 0 ? leftTone : rightTone;
          return (
            <div key={`${metric.label}-${index}`} className={clsx('rounded-2xl px-3 py-3 ring-1 ring-inset ring-slate-200', tone.wash)}>
              <div className="flex items-center gap-2">
                <span className={clsx('h-2.5 w-2.5 rounded-full', tone.dot)} />
                <p className="truncate text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{metric.label}</p>
              </div>
              <p className={clsx('mt-1 truncate text-base font-bold tabular-nums', tone.text)}>{metric.value}</p>
            </div>
          );
        })}
      </div>

      {footnote && <p className="relative z-10 mt-3 text-xs leading-5 text-slate-500">{footnote}</p>}
    </section>
  );
}
