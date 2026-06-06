import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  MoreHorizontal,
  Shield,
  ShieldAlert,
  ShoppingCart,
  BriefcaseBusiness,
  Wallet,
  Calculator,
  Banknote,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../store/authStore';

// Mobile mirrors the desktop 5-section IA but only surfaces 4 primary
// tabs to keep finger-targets comfortable. Projects always appears in the
// More drawer (rarely the user's first tap) and Reports lives there too.
const primaryTabs = [
  { key: 'dashboard', href: '/app/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', activePrefixes: ['/app/dashboard'] },
  { key: 'sales', href: '/app/invoices', icon: FileText, labelKey: 'nav.sales', activePrefixes: ['/app/invoices', '/app/sales', '/app/quotations', '/app/delivery-notes', '/app/recurring-invoices'] },
  { key: 'purchases', href: '/app/purchase-invoices', icon: ShoppingCart, labelKey: 'nav.purchases', activePrefixes: ['/app/purchase-invoices', '/app/purchases', '/app/expenses'] },
  { key: 'directory', href: '/app/customers', icon: Users, labelKey: 'nav.directory', activePrefixes: ['/app/customers', '/app/directory', '/app/products'] },
];

export default function MobileBottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user } = useAuthStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 1280);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobile || !sheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, sheetOpen]);

  if (!isMobile) return null;

  const moreItems = [
    { key: 'reports', href: '/app/reports/financials', icon: Calculator, labelKey: 'nav.reports' },
    { key: 'payroll', href: '/app/payroll/employees', icon: Banknote, labelKey: 'nav.payroll' },
    { key: 'projects', href: '/app/projects', icon: BriefcaseBusiness, labelKey: 'nav.projects' },
    { key: 'expenses', href: '/app/expenses', icon: Wallet, labelKey: 'nav.expenses' },
    { key: 'products', href: '/app/products', icon: Package, labelKey: 'nav.products' },
    { key: 'settings', href: '/app/settings', icon: Settings, labelKey: 'nav.settings' },
    { key: 'privacy', href: '/app/account/privacy', icon: ShieldCheck, labelKey: 'nav.privacy' },
    ...(user?.role === 'super_admin' || user?.role === 'admin'
      ? [{ key: 'admin', href: '/app/admin', icon: Shield, labelKey: 'nav.admin' }]
      : []),
    ...(user?.role === 'super_admin'
      ? [{ key: 'owner', href: '/ops/overview', icon: ShieldAlert, labelKey: 'Owner Plane' as const, raw: true }]
      : []),
  ];

  const isMoreActive = moreItems.some((item) => location.pathname.startsWith(item.href));

  return (
    <>
      {/* Bottom Tab Bar */}
      <nav
        aria-label={t('nav.mobile', { defaultValue: 'Mobile navigation' })}
        className="fixed inset-x-3 bottom-3 z-50 flex overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-xl shadow-slate-900/10 backdrop-blur-xl xl:hidden"
        style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.activePrefixes.some((p) => location.pathname.startsWith(p));
          return (
            <Link
              key={tab.key}
              to={tab.href}
              className={clsx(
                'relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-center transition-colors',
                isActive ? 'text-primary-700' : 'text-slate-500 hover:text-slate-900',
              )}
              onClick={() => setSheetOpen(false)}
            >
              {isActive && <span className="absolute left-1/2 top-1 h-1 w-7 -translate-x-1/2 rounded-full bg-primary-600" />}
              <Icon
                className={clsx('h-5 w-5', isActive ? 'text-primary-600' : 'text-slate-400')}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span
                className={clsx(
                  'max-w-[4.25rem] truncate text-[11px] font-bold leading-none',
                  isActive ? 'text-primary-700' : 'text-slate-500',
                )}
              >
                {t(tab.labelKey)}
              </span>
            </Link>
          );
        })}

        {/* More tab */}
        <button
          type="button"
          className={clsx(
            'relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-center transition-colors',
            isMoreActive || sheetOpen ? 'text-primary-700' : 'text-slate-500 hover:text-slate-900',
          )}
          onClick={() => setSheetOpen((prev) => !prev)}
          aria-label="More options"
          aria-expanded={sheetOpen}
        >
          {(isMoreActive || sheetOpen) && <span className="absolute left-1/2 top-1 h-1 w-7 -translate-x-1/2 rounded-full bg-primary-600" />}
          <MoreHorizontal
            className={clsx('h-5 w-5', isMoreActive || sheetOpen ? 'text-primary-600' : 'text-slate-400')}
            strokeWidth={isMoreActive || sheetOpen ? 2.5 : 1.8}
          />
          <span
            className={clsx(
              'text-[11px] font-bold leading-none',
              isMoreActive || sheetOpen ? 'text-primary-700' : 'text-slate-500',
            )}
          >
            {t('nav.more', 'More')}
          </span>
        </button>
      </nav>

      {/* Backdrop */}
      {sheetOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px] xl:hidden"
            onClick={() => setSheetOpen(false)}
          />

          <div
            className="fixed inset-x-3 bottom-3 z-50 max-h-[min(78vh,34rem)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 xl:hidden"
            style={{ paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.more', 'More')}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 pb-3 pt-4">
              <div>
                <div className="h-1 w-10 rounded-full bg-slate-300" />
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-primary-700">
                  {t('nav.more', 'More')}
                </p>
                <h2 className="mt-1 text-base font-bold text-slate-950">
                  {t('nav.workspaceMenu', { defaultValue: 'เมนูงานบริษัท' })}
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(min(78vh,34rem)-8rem)] space-y-1 overflow-y-auto px-4 py-3">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.key}
                    to={item.href}
                    onClick={() => setSheetOpen(false)}
                    className={clsx(
                      'flex min-h-12 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition-colors',
                      isActive
                        ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-100'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950',
                    )}
                  >
                    <span className={clsx(
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1',
                      isActive ? 'bg-white text-primary-700 ring-primary-100' : 'bg-slate-50 text-slate-500 ring-slate-100',
                    )}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 truncate">
                      {'raw' in item && item.raw ? item.labelKey : t(item.labelKey as string)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
