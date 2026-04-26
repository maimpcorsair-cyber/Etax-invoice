import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  MoreHorizontal,
  Settings,
  Shield,
  ShieldAlert,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../store/authStore';
import { isNative } from '../hooks/useNative';

const primaryTabs = [
  { key: 'dashboard', href: '/app/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { key: 'invoices', href: '/app/invoices', icon: FileText, labelKey: 'nav.invoices' },
  { key: 'customers', href: '/app/customers', icon: Users, labelKey: 'nav.customers' },
  { key: 'products', href: '/app/products', icon: Package, labelKey: 'nav.products' },
];

export default function MobileBottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user } = useAuthStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function check() {
      setIsMobile(isNative() || window.innerWidth < 1024);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!isMobile) return null;

  const moreItems = [
    { key: 'settings', href: '/app/settings', icon: Settings, labelKey: 'nav.settings' },
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
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 flex lg:hidden pb-safe">
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.key}
              to={tab.href}
              className="flex-1 flex flex-col items-center justify-center h-14 gap-0.5"
              onClick={() => setSheetOpen(false)}
            >
              <Icon
                className={clsx('w-6 h-6', isActive ? 'text-indigo-600' : 'text-gray-400')}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span
                className={clsx(
                  'text-[11px] font-medium leading-none',
                  isActive ? 'text-indigo-600' : 'text-gray-400',
                )}
              >
                {t(tab.labelKey)}
              </span>
            </Link>
          );
        })}

        {/* More tab */}
        <button
          className="flex-1 flex flex-col items-center justify-center h-14 gap-0.5"
          onClick={() => setSheetOpen((prev) => !prev)}
          aria-label="More options"
          aria-expanded={sheetOpen}
        >
          <MoreHorizontal
            className={clsx('w-6 h-6', isMoreActive || sheetOpen ? 'text-indigo-600' : 'text-gray-400')}
            strokeWidth={isMoreActive || sheetOpen ? 2.5 : 1.8}
          />
          <span
            className={clsx(
              'text-[11px] font-medium leading-none',
              isMoreActive || sheetOpen ? 'text-indigo-600' : 'text-gray-400',
            )}
          >
            {t('nav.more', 'More')}
          </span>
        </button>
      </nav>

      {/* Backdrop */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSheetOpen(false)}
        />
      )}

      {/* Slide-up sheet */}
      <div
        className={clsx(
          'fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl border-t border-gray-200 lg:hidden',
          'transition-transform duration-300 ease-out',
          sheetOpen ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Sheet handle */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto" />
        </div>
        <button
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
          onClick={() => setSheetOpen(false)}
          aria-label="Close"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <div className="px-4 pb-4 pt-2 space-y-1">
          {moreItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.key}
                to={item.href}
                onClick={() => setSheetOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {'raw' in item && item.raw ? item.labelKey : t(item.labelKey as string)}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
