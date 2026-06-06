import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';

// In-page sub-navigation strip used by section pages (Purchases, Directory)
// to expose their grouped sub-items now that the top navbar holds only the
// 5 grouped section names. Click a tab to navigate; the active tab is the
// one whose `to` is the longest match of the current pathname.

export interface SectionSubNavItem {
  key: string;
  to: string;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
}

interface SectionSubNavProps {
  items: SectionSubNavItem[];
  className?: string;
}

export default function SectionSubNav({ items, className }: SectionSubNavProps) {
  const location = useLocation();
  // Find the item whose `to` is the LONGEST prefix of pathname — handles
  // cases like /app/purchases/inbox/123 still highlighting "inbox".
  const activeKey = items
    .filter((item) => location.pathname.startsWith(item.to))
    .sort((a, b) => b.to.length - a.to.length)[0]?.key;

  return (
    <nav
      role="tablist"
      className={clsx(
        'section-tab-rail',
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === activeKey;
        return (
          <Link
            key={item.key}
            to={item.to}
            role="tab"
            aria-selected={isActive}
            className={clsx(
              'relative inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-semibold transition-colors',
              isActive
                ? 'text-primary-800'
                : 'text-slate-600 hover:text-slate-950',
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {item.label}
            {item.badge !== undefined && item.badge !== '' && item.badge !== 0 && (
              <span
                className={clsx(
                  'ml-1 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                  isActive ? 'bg-primary-50 text-primary-800' : 'bg-emerald-100 text-emerald-700',
                )}
              >
                {item.badge}
              </span>
            )}
            {isActive && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary-700" />}
          </Link>
        );
      })}
    </nav>
  );
}
