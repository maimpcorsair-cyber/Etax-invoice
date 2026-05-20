import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  FileText,
  Users,
  ShoppingCart,
  BriefcaseBusiness,
  Calculator,
  Banknote,
  Shield,
  ShieldAlert,
  ShieldCheck,
  LogOut,
  ChevronDown,
  Settings,
  Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuthStore } from '../store/authStore';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';

// Reshaped IA — 5 grouped top-level sections.
//   Sales           → invoices (T01–T05) + future quotations
//   Purchases       → bills + petty cash + AI Inbox (sub-pages added in Commit B)
//   Reports         → VAT/PP30 + future WHT/PND
//   Directory       → customers + vendors + products (sub-pages added in Commit B)
// Each top item points at the section's current default page so Commit A
// stays backwards-compatible. Sub-routes ship in Commit B alongside the
// PurchaseInvoices / Customers page splits.
// activePrefixes makes the pill highlight whenever the URL matches ANY of
// the listed prefixes. Future routes (e.g., /app/purchases/inbox or
// /app/directory/vendors) will land under their grouped section without
// needing a Navbar change.
const navItems = [
  { key: 'dashboard', href: '/app/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', activePrefixes: ['/app/dashboard'] },
  { key: 'sales', href: '/app/invoices', icon: FileText, labelKey: 'nav.sales', activePrefixes: ['/app/invoices', '/app/sales'] },
  { key: 'purchases', href: '/app/purchase-invoices', icon: ShoppingCart, labelKey: 'nav.purchases', activePrefixes: ['/app/purchase-invoices', '/app/purchases', '/app/expenses'] },
  { key: 'payroll', href: '/app/payroll/employees', icon: Banknote, labelKey: 'nav.payroll', activePrefixes: ['/app/payroll'] },
  { key: 'reports', href: '/app/reports/financials', icon: Calculator, labelKey: 'nav.reports', activePrefixes: ['/app/reports', '/app/vat-summary', '/app/pp30', '/app/wht-certificates'] },
  { key: 'directory', href: '/app/customers', icon: Users, labelKey: 'nav.directory', activePrefixes: ['/app/customers', '/app/directory', '/app/products'] },
];

// Projects is conditional — hidden when the workspace has zero active
// projects so product-only SMEs don't see noise. Reappears the moment a
// project is created (fetched once per session via `useHasProjects`).
const projectsNavItem = { key: 'projects', href: '/app/projects', icon: BriefcaseBusiness, labelKey: 'nav.projects', activePrefixes: ['/app/projects'] };

const adminNavItems = [
  { key: 'admin', href: '/app/admin', icon: Shield, labelKey: 'nav.admin', roles: ['super_admin', 'admin'] },
];

// Lightweight one-shot check for whether the tenant has any project rows.
// Cached at module scope so navigation between pages doesn't re-fetch.
let _projectCountCache: { token: string; count: number } | null = null;

function useHasProjects(): boolean {
  const token = useAuthStore((s) => s.token);
  const [hasProjects, setHasProjects] = useState<boolean>(() => {
    if (_projectCountCache && _projectCountCache.token === token) {
      return _projectCountCache.count > 0;
    }
    return false;
  });

  useEffect(() => {
    if (!token) return;
    if (_projectCountCache && _projectCountCache.token === token) {
      setHasProjects(_projectCountCache.count > 0);
      return;
    }
    let cancelled = false;
    fetch('/api/projects?take=1', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const json = await res.json().catch(() => ({ data: [] }));
        const count = Array.isArray(json.data) ? json.data.length : 0;
        _projectCountCache = { token, count };
        if (!cancelled) setHasProjects(count > 0);
      })
      .catch(() => {
        // Endpoint optional / offline — fail closed (hidden).
      });
    return () => { cancelled = true; };
  }, [token]);

  return hasProjects;
}

const PLAN_BADGE: Record<string, string> = {
  free: 'bg-slate-100 text-slate-600',
  starter: 'bg-primary-50 text-primary-700',
  business: 'bg-teal-50 text-teal-700',
  enterprise: 'bg-amber-50 text-amber-800',
};

export default function Navbar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const hasProjects = useHasProjects();
  const visibleItems = hasProjects ? [...navItems, projectsNavItem] : navItems;
  const visibleAdminItems = adminNavItems.filter(
    (item) => !item.roles || item.roles.includes(user?.role ?? ''),
  );
  // Picture preference: when the user signed up/logged in via Google, the
  // business identity is the Google account — don't surface LINE's avatar
  // as the primary face. LINE picture only when Google isn't linked.
  const linePictureUrl = user?.line?.linked && !user?.auth?.hasGoogle ? user.line.pictureUrl : null;
  // Company name is the business identity that matters in this app — show
  // it as the primary label in the top-right pill. User's personal name
  // lives in the dropdown.
  const companyDisplayName = user?.company?.nameTh || user?.company?.nameEn || user?.name || 'User';

  const handleLogout = () => {
    window.google?.accounts.id.disableAutoSelect();
    clearAuth();
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-white/70 bg-white/78 shadow-sm backdrop-blur-xl">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/app/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-md transition-shadow group-hover:shadow-lg" style={{background:'linear-gradient(135deg,#1e3a8a,#14b8a6)'}}>
              <FileText className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-gray-900 text-sm hidden sm:block group-hover:text-primary-600 transition-colors">
              {t('app.shortName')}
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-2">
            {user?.role === 'super_admin' && (
              <Link
                to="/ops/overview"
                className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100"
              >
                <ShieldAlert className="w-4 h-4" />
                Owner Plane
              </Link>
            )}
            <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-1 shadow-sm">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.activePrefixes.some((p) => location.pathname.startsWith(p));
                return (
                  <Link
                    key={item.key}
                    to={item.href}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all',
                      isActive
                        ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-100'
                        : 'text-slate-600 hover:bg-white/80 hover:text-slate-950',
                    )}
                  >
                    <Icon className={clsx('w-4 h-4', isActive ? 'text-primary-600' : 'text-slate-400')} />
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="toggle" />

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-label="User menu"
                aria-haspopup="true"
                aria-expanded={userMenuOpen}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                {linePictureUrl ? (
                  <img
                    src={linePictureUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover shadow-sm ring-2 ring-white"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{background:'linear-gradient(135deg,#1e3a8a,#14b8a6)'}}>
                    {companyDisplayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-slate-700 hidden sm:block max-w-[160px] truncate" title={companyDisplayName}>
                  {companyDisplayName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white/95 py-1 shadow-xl backdrop-blur z-50">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 truncate" title={companyDisplayName}>
                      {companyDisplayName}
                    </p>
                    <p className="text-xs text-gray-600 truncate">{user?.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    {policy && (
                      <span
                        className={`mt-1.5 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[policy.plan] ?? PLAN_BADGE.free}`}
                      >
                        <Zap className="w-3 h-3" />
                        {policy.planLabel}
                      </span>
                    )}
                  </div>
                  <Link
                    to="/app/settings"
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50',
                      location.pathname.startsWith('/app/settings') ? 'font-semibold text-primary-700' : 'text-gray-700',
                    )}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Settings className="w-4 h-4" />
                    {t('nav.settings')}
                  </Link>
                  <Link
                    to="/app/account/privacy"
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50',
                      location.pathname.startsWith('/app/account/privacy') ? 'font-semibold text-primary-700' : 'text-gray-700',
                    )}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {t('nav.privacy', { defaultValue: 'ความเป็นส่วนตัวและข้อมูล' })}
                  </Link>
                  {(user?.role === 'super_admin' || user?.role === 'admin') && (
                    <>
                      {visibleAdminItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname.startsWith(item.href);
                        return (
                          <Link
                            key={item.key}
                            to={item.href}
                            className={clsx(
                              'flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50',
                              isActive ? 'font-semibold text-primary-700' : 'text-gray-700',
                            )}
                            onClick={() => setUserMenuOpen(false)}
                          >
                            <Icon className="w-4 h-4" />
                            {t(item.labelKey)}
                          </Link>
                        );
                      })}
                    </>
                  )}
                  {(user?.role === 'super_admin' || user?.role === 'admin') && (
                    <Link
                      to="/app/plan"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Zap className="w-4 h-4" />
                      {t('nav.plan', { defaultValue: 'แผน / Plan' })}
                    </Link>
                  )}

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4" />
                    {t('nav.logout')}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

    </nav>
  );
}
