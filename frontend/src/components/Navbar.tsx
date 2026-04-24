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
  ScrollText,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
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
  { key: 'audit', href: '/app/audit', icon: ScrollText, labelKey: 'nav.audit' },
  { key: 'settings', href: '/app/settings', icon: Settings, labelKey: 'nav.settings' },
];

export default function Navbar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();
  const { policy } = useCompanyAccessPolicy();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const visibleItems = navItems.filter(
    (item) =>
      (!item.roles || item.roles.includes(user?.role ?? '')) &&
      (item.key !== 'audit' || policy?.canViewAuditLogs !== false),
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
              className={`btn-primary hidden sm:inline-flex ${policy?.canCreateInvoice === false ? 'pointer-events-none opacity-50' : ''}`}
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
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  </div>
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

            {/* Mobile menu toggle */}
            <button
              className="lg:hidden p-2.5 rounded-lg hover:bg-gray-100"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-gray-200 bg-white">
          <div className="px-4 py-3 space-y-1">
            {user?.role === 'super_admin' && (
              <Link
                to="/ops/overview"
                onClick={() => setMobileOpen(false)}
                className="mb-1 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800"
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
                  onClick={() => setMobileOpen(false)}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
            <Link
              to="/app/invoices/new"
              onClick={() => setMobileOpen(false)}
              className={`btn-primary w-full justify-center mt-2 ${policy?.canCreateInvoice === false ? 'pointer-events-none opacity-50' : ''}`}
            >
              <FileText className="w-4 h-4" />
              {t('invoice.create')}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
