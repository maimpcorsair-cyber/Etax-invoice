import { Link, useLocation } from 'react-router-dom';
import { Shield, Building2, ArrowLeftRight, LogOut, Receipt, TicketPercent, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../store/authStore';
import { buildPlaneUrl } from '../lib/platform';

const items = [
  { key: 'overview', href: '/ops/overview', label: 'Owner Overview', icon: Shield },
  { key: 'tenants', href: '/ops/tenants', label: 'Tenants', icon: Building2 },
  { key: 'transactions', href: '/ops/transactions', label: 'Transactions', icon: Receipt },
  { key: 'coupons', href: '/ops/coupons', label: 'Coupons', icon: TicketPercent },
  { key: 'renewals', href: '/ops/renewals', label: 'Renewals', icon: RefreshCw },
  { key: 'tenant', href: '/app/dashboard', label: 'Tenant App', icon: Building2 },
];

export default function OwnerNavbar() {
  const location = useLocation();
  const { token, user, clearAuth } = useAuthStore();
  const tenantUrl = token && user
    ? buildPlaneUrl('/app/dashboard', 'app', { token, user })
    : '/app/dashboard';

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold text-slate-900">Owner Control Plane</div>
            <div className="text-xs text-slate-500">{user?.email}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.key}
                to={item.key === 'tenant' ? tenantUrl : item.href}
                className={clsx(
                  'inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}

          <Link
            to={tenantUrl}
            className="hidden min-h-11 sm:inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span className="hidden lg:inline">Switch To Tenant</span>
          </Link>

          <button
            onClick={clearAuth}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden lg:inline">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
