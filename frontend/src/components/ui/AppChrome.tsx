import type { ReactNode } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';

export const mascotAssets = {
  hero: '/brand/billoy-hero-mascot.jpg',
  poses: '/brand/mascot/billoy-product-poses.jpg',
  spot: '/brand/mascot/billoy-receipt-phone.jpg',
};

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  mascot?: 'hero' | 'poses' | 'spot' | false;
  tone?: 'navy' | 'light' | 'teal';
}

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
  mascot = 'poses',
  tone = 'light',
}: PageHeaderProps) {
  return (
    <section className={clsx('premium-hero', tone === 'navy' && 'premium-hero-dark', tone === 'teal' && 'premium-hero-teal')}>
      <div className="relative z-10 min-w-0">
        {eyebrow && (
          <div className="premium-eyebrow">
            {icon ?? <Sparkles className="h-3.5 w-3.5" />}
            {eyebrow}
          </div>
        )}
        <h1 className="mt-4 max-w-3xl text-2xl font-bold leading-tight text-slate-950 sm:text-3xl lg:text-[2.15rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            {description}
          </p>
        )}
        {actions && <div className="mt-5 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {mascot && (
        <div className="premium-mascot-panel" aria-hidden="true">
          <img
            src={mascotAssets[mascot]}
            alt=""
            className={clsx(mascot === 'hero' ? 'object-cover object-center' : 'object-contain object-center bg-white')}
          />
        </div>
      )}
    </section>
  );
}

interface MetricCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

export function MetricCard({ label, value, detail, icon, tone = 'primary' }: MetricCardProps) {
  return (
    <div className={clsx('metric-card', `metric-card-${tone}`)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <div className="mt-3 text-2xl font-bold leading-none text-slate-950 sm:text-3xl">{value}</div>
        </div>
        {icon && <div className="metric-icon">{icon}</div>}
      </div>
      {detail && <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  action?: ReactNode;
  variant?: 'empty' | 'success' | 'error' | 'waiting';
}

export function EmptyState({ title, description, actionLabel, actionHref, action, variant = 'empty' }: EmptyStateProps) {
  return (
    <div className={clsx('empty-state-premium', `empty-state-${variant}`)}>
      <div className="empty-state-art" aria-hidden="true">
        <img src={mascotAssets.spot} alt="" />
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-bold text-slate-950">{title}</h3>
        {description && <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">{description}</p>}
        {action ?? (
          actionHref && actionLabel ? (
            <Link to={actionHref} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary-700 hover:text-primary-900">
              {actionLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null
        )}
      </div>
    </div>
  );
}

interface HelperCardProps {
  title: string;
  description: string;
  children?: ReactNode;
}

export function MascotHelperCard({ title, description, children }: HelperCardProps) {
  return (
    <aside className="mascot-helper-card">
      <div className="flex items-start gap-4">
        <div className="mascot-helper-art" aria-hidden="true">
          <img src={mascotAssets.spot} alt="" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-950">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </aside>
  );
}
