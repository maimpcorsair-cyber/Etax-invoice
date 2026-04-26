import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  Shield,
  ShieldAlert,
  Settings,
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
  { key: 'customers', href: '/app/customers', icon: Users, labelKey: 'nav.customers' },
  { key: 'products', href: '/app/products', icon: Package, labelKey: 'nav.products' },
  { key: 'admin', href: '/app/admin', icon: Shield, labelKey: 'nav.admin', roles: ['super_admin', 'admin'] },
  { key: 'settings', href: '/app/settings', icon: Settings, labelKey: 'nav.settings' },
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

  const visibleItems = navItems.filter(
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
          <Link to="/app/dashboard" className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary-700" strokeWidth={2} />
            <span className="font-bold text-gray-900 text-sm hidden sm:block">
              {t('app.shortName')}
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-1">
            {user?.role === 'super_admin' && (
              <Link
                to="/ops/overview"
                className="mr-2 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
              >
                <ShieldAlert className="w-4 h-4" />
                Owner Plane
              </Link>
            )}
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.key}
                  to={item.href}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
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
                <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold">
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
                  <Link
                    to="/app/settings"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Settings className="w-4 h-4" />
                    {t('nav.settings')}
                  </Link>
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
