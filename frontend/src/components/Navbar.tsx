import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  ShoppingCart,
  Calculator,
  Shield,
  ShieldAlert,
  LogOut,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuthStore } from '../store/authStore';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';

const navItems = [
  { key: 'dashboard', href: '/app/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { key: 'invoices', href: '/app/invoices', icon: FileText, labelKey: 'nav.invoices' },
  { key: 'purchaseInvoices', href: '/app/purchase-invoices', icon: ShoppingCart, labelKey: 'nav.purchaseInvoices' },
  { key: 'vatSummary', href: '/app/vat-summary', icon: Calculator, labelKey: 'nav.vatSummary' },
  { key: 'customers', href: '/app/customers', icon: Users, labelKey: 'nav.customers' },
  { key: 'products', href: '/app/products', icon: Package, labelKey: 'nav.products' },
];

const adminNavItems = [
  { key: 'admin', href: '/app/admin', icon: Shield, labelKey: 'nav.admin', roles: ['super_admin', 'admin'] },
];

const PLAN_BADGE: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600',
  starter: 'bg-blue-100 text-blue-700',
  business: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

export default function Navbar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const visibleItems = navItems;
  const visibleAdminItems = adminNavItems.filter(
    (item) => !item.roles || item.roles.includes(user?.role ?? ''),
  );

  const handleLogout = () => {
    window.google?.accounts.id.disableAutoSelect();
    clearAuth();
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/app/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-md transition-shadow group-hover:shadow-lg" style={{background:'linear-gradient(135deg,#16a34a,#059669)'}}>
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
                className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
              >
                <ShieldAlert className="w-4 h-4" />
                Owner Plane
              </Link>
            )}
            <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-gray-50/80 p-1 shadow-sm">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.key}
                    to={item.href}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all',
                      isActive
                        ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-100'
                        : 'text-gray-600 hover:bg-white/80 hover:text-gray-950',
                    )}
                  >
                    <Icon className={clsx('w-4 h-4', isActive ? 'text-primary-600' : 'text-gray-400')} />
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </div>
            {visibleAdminItems.length > 0 && (
              <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white p-1">
                {visibleAdminItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.key}
                      to={item.href}
                      className={clsx(
                        'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all',
                        isActive
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950',
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {t(item.labelKey)}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="toggle" />

            <Link
              to="/app/invoices/new"
              className={`btn-primary hidden lg:inline-flex ${policy?.canCreateInvoice === false ? 'pointer-events-none opacity-50' : ''}`}
            >
              <FileText className="w-4 h-4" />
              {t('invoice.create')}
            </Link>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-label="User menu"
                aria-haspopup="true"
                aria-expanded={userMenuOpen}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>
                  {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
                </div>
                <span className="text-sm font-medium text-gray-700 hidden sm:block max-w-24 truncate">
                  {user?.name}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
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
