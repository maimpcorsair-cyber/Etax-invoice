import { useState } from 'react';
import {
  Zap,
  Crown,
  Star,
  Check,
  X,
  TrendingUp,
  Users,
  FileText,
  Package,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../hooks/useLanguage';

// ── Plan definitions ────────────────────────────────────────────────────────

type PlanKey = 'free' | 'starter' | 'business' | 'enterprise';

interface PlanDef {
  key: PlanKey;
  nameTh: string;
  nameEn: string;
  price: string;
  priceSub: string;
  color: string;          // Tailwind ring / border color
  badgeColor: string;     // pill bg + text
  headerBg: string;
  icon: React.ReactNode;
  docs: string;
  users: string;
  customers: string;
  products: string;
}

const PLANS: PlanDef[] = [
  {
    key: 'free',
    nameTh: 'ฟรี',
    nameEn: 'Free',
    price: '฿0',
    priceSub: '/เดือน',
    color: 'border-gray-200',
    badgeColor: 'bg-gray-100 text-gray-700',
    headerBg: 'bg-gray-50',
    icon: <FileText className="w-5 h-5" />,
    docs: '10',
    users: '1',
    customers: '50',
    products: '20',
  },
  {
    key: 'starter',
    nameTh: 'สตาร์ทเตอร์',
    nameEn: 'Starter',
    price: '฿990',
    priceSub: '/เดือน',
    color: 'border-blue-200',
    badgeColor: 'bg-blue-100 text-blue-700',
    headerBg: 'bg-blue-50',
    icon: <Zap className="w-5 h-5 text-blue-600" />,
    docs: '100',
    users: '3',
    customers: 'ไม่จำกัด',
    products: 'ไม่จำกัด',
  },
  {
    key: 'business',
    nameTh: 'บิสสิเนส',
    nameEn: 'Business',
    price: '฿2,490',
    priceSub: '/เดือน',
    color: 'border-purple-200',
    badgeColor: 'bg-purple-100 text-purple-700',
    headerBg: 'bg-purple-50',
    icon: <Star className="w-5 h-5 text-purple-600" />,
    docs: '500',
    users: '20',
    customers: 'ไม่จำกัด',
    products: 'ไม่จำกัด',
  },
  {
    key: 'enterprise',
    nameTh: 'เอนเตอร์ไพรส์',
    nameEn: 'Enterprise',
    price: 'ติดต่อ',
    priceSub: '',
    color: 'border-amber-200',
    badgeColor: 'bg-amber-100 text-amber-700',
    headerBg: 'bg-amber-50',
    icon: <Crown className="w-5 h-5 text-amber-600" />,
    docs: 'ไม่จำกัด',
    users: 'ไม่จำกัด',
    customers: 'ไม่จำกัด',
    products: 'ไม่จำกัด',
  },
];

// ── Feature rows for comparison table ───────────────────────────────────────

interface FeatureRow {
  labelTh: string;
  labelEn: string;
  values: Record<PlanKey, boolean | string>;
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    labelTh: 'ส่งข้อมูลสรรพากร (RD)',
    labelEn: 'Submit to RD',
    values: { free: false, starter: true, business: true, enterprise: true },
  },
  {
    labelTh: 'ใบรับรองดิจิทัล',
    labelEn: 'Digital Certificate',
    values: { free: false, starter: true, business: true, enterprise: true },
  },
  {
    labelTh: 'ส่งอีเมลใบแจ้งหนี้',
    labelEn: 'Send Invoice Email',
    values: { free: false, starter: true, business: true, enterprise: true },
  },
  {
    labelTh: 'ส่งออก Excel',
    labelEn: 'Excel Export',
    values: { free: false, starter: true, business: true, enterprise: true },
  },
  {
    labelTh: 'Audit Log',
    labelEn: 'Audit Log',
    values: { free: false, starter: false, business: true, enterprise: true },
  },
  {
    labelTh: 'เชิญผู้ใช้',
    labelEn: 'Invite Users',
    values: { free: false, starter: true, business: true, enterprise: true },
  },
  {
    labelTh: 'แม่แบบเอกสารกำหนดเอง',
    labelEn: 'Custom Templates',
    values: { free: false, starter: false, business: true, enterprise: true },
  },
  {
    labelTh: 'API Access',
    labelEn: 'API Access',
    values: { free: false, starter: false, business: false, enterprise: true },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(used: number, max: number | null): number {
  if (max === null || max === 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

function barColor(p: number): string {
  if (p >= 90) return 'bg-red-500';
  if (p >= 70) return 'bg-amber-500';
  return 'bg-indigo-500';
}

function UsageBar({
  label,
  used,
  max,
  icon,
}: {
  label: string;
  used: number;
  max: number | null;
  icon: React.ReactNode;
}) {
  const p = pct(used, max);
  const unlimited = max === null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-sm text-gray-600">
          {icon}
          {label}
        </span>
        <span className="text-sm font-medium text-gray-800">
          {used.toLocaleString()}
          {unlimited ? '' : ` / ${max!.toLocaleString()}`}
          {unlimited && <span className="ml-1 text-xs text-gray-400">(ไม่จำกัด)</span>}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        {!unlimited && (
          <div
            className={`h-2 rounded-full transition-all ${barColor(p)}`}
            style={{ width: `${p}%` }}
          />
        )}
        {unlimited && <div className="h-2 rounded-full bg-indigo-200 w-full" />}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlanPage() {
  const { policy, loading, error } = useCompanyAccessPolicy();
  const { token, user } = useAuthStore();
  const { isThai } = useLanguage();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const isAdminOrAbove = user?.role === 'super_admin' || user?.role === 'admin';

  async function openBillingPortal() {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/billing/portal-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json() as { data?: { url: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'ไม่สามารถเปิด Billing Portal ได้');
      if (json.data?.url) window.location.href = json.data.url;
    } catch (err) {
      setPortalError((err as Error).message);
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-gray-500">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm">{error ?? 'ไม่สามารถโหลดข้อมูลแผนได้'}</p>
      </div>
    );
  }

  const currentPlanDef = PLANS.find((p) => p.key === policy.plan) ?? PLANS[0];
  const planOrder: PlanKey[] = ['free', 'starter', 'business', 'enterprise'];
  const currentIdx = planOrder.indexOf(policy.plan);

  // ── CTA per plan col ──
  function renderCta(plan: PlanDef) {
    if (plan.key === policy!.plan) {
      return (
        <span className="inline-flex items-center justify-center w-full px-3 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-500 cursor-default">
          {isThai ? 'แผนปัจจุบัน' : 'Current Plan'}
        </span>
      );
    }

    const targetIdx = planOrder.indexOf(plan.key);
    const isUpgrade = targetIdx > currentIdx;

    if (!isAdminOrAbove) {
      return (
        <span className="inline-flex items-center justify-center w-full px-3 py-2 text-xs text-gray-400">
          {isThai ? 'ติดต่อผู้ดูแล' : 'Contact admin'}
        </span>
      );
    }

    if (plan.key === 'enterprise') {
      return (
        <a
          href="mailto:sales@taxinvoice.th"
          className="inline-flex items-center justify-center w-full px-3 py-2 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors"
        >
          {isThai ? 'ติดต่อเรา' : 'Contact Us'}
        </a>
      );
    }

    if (policy!.isPaidPlan && isUpgrade) {
      // Paid → Paid upgrade via portal
      return (
        <button
          onClick={openBillingPortal}
          disabled={portalLoading}
          className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60"
        >
          {portalLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isThai ? `อัพเกรดเป็น ${plan.nameEn}` : `Upgrade to ${plan.nameEn}`}
        </button>
      );
    }

    if (!policy!.isPaidPlan && isUpgrade) {
      // Free → Paid: redirect to landing with ?upgrade=plan
      const href = `/?upgrade=${plan.key}`;
      return (
        <a
          href={href}
          className="inline-flex items-center justify-center w-full px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          {isThai ? `อัพเกรดเป็น ${plan.nameEn}` : `Upgrade to ${plan.nameEn}`}
        </a>
      );
    }

    if (!isUpgrade && plan.key !== 'free') {
      // Downgrade via portal
      return (
        <button
          onClick={openBillingPortal}
          disabled={portalLoading}
          className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          {portalLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isThai ? `ลดเป็น ${plan.nameEn}` : `Downgrade to ${plan.nameEn}`}
        </button>
      );
    }

    return null;
  }

  return (
    <div className="p-4 sm:p-6 max-w-screen-xl mx-auto space-y-8">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isThai ? 'แผนและการอัพเกรด' : 'Plan & Upgrade'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isThai
            ? 'ดูการใช้งานและเลือกแผนที่เหมาะกับธุรกิจของคุณ'
            : 'View your usage and choose the plan that fits your business.'}
        </p>
      </div>

      {/* ── Current plan hero ───────────────────────────────────────────── */}
      <div className={`rounded-xl border-2 ${currentPlanDef.color} bg-white shadow-sm`}>
        <div className={`${currentPlanDef.headerBg} px-6 py-4 rounded-t-xl flex flex-wrap items-center justify-between gap-3`}>
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-white shadow-sm">
              {currentPlanDef.icon}
            </span>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                {isThai ? 'แผนปัจจุบัน' : 'Current Plan'}
              </p>
              <h2 className="text-xl font-bold text-gray-900">
                {isThai ? currentPlanDef.nameTh : currentPlanDef.nameEn}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status badge */}
            {policy.isSubscriptionActive ? (
              <span className="badge-success text-xs px-2.5 py-1 rounded-full font-medium">
                {isThai ? 'ใช้งานอยู่' : 'Active'}
              </span>
            ) : (
              <span className="badge-warning text-xs px-2.5 py-1 rounded-full font-medium">
                {isThai ? 'หมดอายุ' : 'Inactive'}
              </span>
            )}
            {policy.isPaidPlan && isAdminOrAbove && (
              <button
                onClick={openBillingPortal}
                disabled={portalLoading}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60"
              >
                {portalLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <TrendingUp className="w-4 h-4" />}
                {isThai ? 'จัดการ Subscription' : 'Manage Subscription'}
              </button>
            )}
          </div>
        </div>

        {/* Usage section */}
        <div className="px-6 py-5">
          {portalError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {portalError}
            </div>
          )}
          <p className="text-sm font-semibold text-gray-700 mb-4">
            {isThai ? 'การใช้งานเดือนนี้' : 'Usage This Month'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UsageBar
              label={isThai ? 'เอกสาร / Documents' : 'Documents'}
              used={policy.usage.documentsThisMonth}
              max={policy.maxDocumentsPerMonth}
              icon={<FileText className="w-4 h-4" />}
            />
            <UsageBar
              label={isThai ? 'ผู้ใช้ / Users' : 'Users'}
              used={policy.usage.users}
              max={policy.maxUsers}
              icon={<Users className="w-4 h-4" />}
            />
            <UsageBar
              label={isThai ? 'ลูกค้า / Customers' : 'Customers'}
              used={policy.usage.customers}
              max={policy.maxCustomers}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <UsageBar
              label={isThai ? 'สินค้า / Products' : 'Products'}
              used={policy.usage.products}
              max={policy.maxProducts}
              icon={<Package className="w-4 h-4" />}
            />
          </div>
        </div>
      </div>

      {/* ── Plan comparison table — desktop grid / mobile stacked ─────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {isThai ? 'เปรียบเทียบแผน' : 'Compare Plans'}
        </h2>

        {/* Desktop: grid */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left text-sm font-semibold text-gray-600 pb-3 pr-4 w-40">
                  {isThai ? 'คุณสมบัติ' : 'Feature'}
                </th>
                {PLANS.map((plan) => {
                  const isCurrent = plan.key === policy.plan;
                  return (
                    <th
                      key={plan.key}
                      className={`text-center pb-3 px-3 rounded-t-xl ${isCurrent ? 'bg-indigo-50 border-x border-t border-indigo-200' : ''}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="p-1.5 rounded-lg bg-white shadow-sm inline-flex">
                          {plan.icon}
                        </span>
                        <span className="font-bold text-gray-900 text-sm">
                          {isThai ? plan.nameTh : plan.nameEn}
                        </span>
                        {isCurrent && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${plan.badgeColor}`}>
                            {isThai ? 'แผนของคุณ' : 'Your Plan'}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Price row */}
              <tr>
                <td className="py-3 pr-4 text-sm text-gray-600 font-medium">
                  {isThai ? 'ราคา' : 'Price'}
                </td>
                {PLANS.map((plan) => {
                  const isCurrent = plan.key === policy.plan;
                  return (
                    <td
                      key={plan.key}
                      className={`py-3 px-3 text-center ${isCurrent ? 'bg-indigo-50 border-x border-indigo-200' : ''}`}
                    >
                      <span className="text-lg font-bold text-gray-900">{plan.price}</span>
                      {plan.priceSub && (
                        <span className="text-xs text-gray-500 ml-0.5">{plan.priceSub}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
              {/* Quota rows */}
              {(
                [
                  { labelTh: 'เอกสาร/เดือน', labelEn: 'Docs/month', field: 'docs' as const },
                  { labelTh: 'ผู้ใช้', labelEn: 'Users', field: 'users' as const },
                  { labelTh: 'ลูกค้า', labelEn: 'Customers', field: 'customers' as const },
                  { labelTh: 'สินค้า', labelEn: 'Products', field: 'products' as const },
                ] as const
              ).map((row) => (
                <tr key={row.field}>
                  <td className="py-3 pr-4 text-sm text-gray-600">
                    {isThai ? row.labelTh : row.labelEn}
                  </td>
                  {PLANS.map((plan) => {
                    const isCurrent = plan.key === policy.plan;
                    return (
                      <td
                        key={plan.key}
                        className={`py-3 px-3 text-center text-sm font-medium text-gray-800 ${isCurrent ? 'bg-indigo-50 border-x border-indigo-200' : ''}`}
                      >
                        {plan[row.field]}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Feature rows */}
              {FEATURE_ROWS.map((row) => (
                <tr key={row.labelEn}>
                  <td className="py-3 pr-4 text-sm text-gray-600">
                    {isThai ? row.labelTh : row.labelEn}
                  </td>
                  {PLANS.map((plan) => {
                    const isCurrent = plan.key === policy.plan;
                    const val = row.values[plan.key];
                    return (
                      <td
                        key={plan.key}
                        className={`py-3 px-3 text-center ${isCurrent ? 'bg-indigo-50 border-x border-indigo-200' : ''}`}
                      >
                        {typeof val === 'boolean' ? (
                          val ? (
                            <Check className="w-4 h-4 text-green-500 mx-auto" />
                          ) : (
                            <X className="w-4 h-4 text-gray-300 mx-auto" />
                          )
                        ) : (
                          <span className="text-sm text-gray-700">{val}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* CTA row */}
              <tr>
                <td className="pt-4 pr-4" />
                {PLANS.map((plan) => {
                  const isCurrent = plan.key === policy.plan;
                  return (
                    <td
                      key={plan.key}
                      className={`pt-4 px-3 pb-4 ${isCurrent ? 'bg-indigo-50 border-x border-b border-indigo-200 rounded-b-xl' : ''}`}
                    >
                      {renderCta(plan)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mobile: stacked cards */}
        <div className="md:hidden space-y-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.key === policy.plan;
            return (
              <div
                key={plan.key}
                className={`rounded-xl border-2 ${isCurrent ? 'border-indigo-400 shadow-md' : 'border-gray-200'} bg-white`}
              >
                <div className={`${plan.headerBg} px-4 py-3 rounded-t-xl flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    {plan.icon}
                    <span className="font-bold text-gray-900">
                      {isThai ? plan.nameTh : plan.nameEn}
                    </span>
                    {isCurrent && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${plan.badgeColor}`}>
                        {isThai ? 'แผนของคุณ' : 'Your Plan'}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-gray-900">{plan.price}</span>
                    {plan.priceSub && <span className="text-xs text-gray-500 ml-0.5">{plan.priceSub}</span>}
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <span className="text-gray-500">{isThai ? 'เอกสาร/เดือน' : 'Docs/month'}</span>
                    <span className="font-medium text-gray-800">{plan.docs}</span>
                    <span className="text-gray-500">{isThai ? 'ผู้ใช้' : 'Users'}</span>
                    <span className="font-medium text-gray-800">{plan.users}</span>
                    <span className="text-gray-500">{isThai ? 'ลูกค้า' : 'Customers'}</span>
                    <span className="font-medium text-gray-800">{plan.customers}</span>
                    <span className="text-gray-500">{isThai ? 'สินค้า' : 'Products'}</span>
                    <span className="font-medium text-gray-800">{plan.products}</span>
                  </div>
                  <div className="border-t border-gray-100 pt-2 space-y-1.5">
                    {FEATURE_ROWS.map((row) => {
                      const val = row.values[plan.key];
                      return (
                        <div key={row.labelEn} className="flex items-center gap-2">
                          {typeof val === 'boolean' ? (
                            val
                              ? <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                              : <X className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                          ) : null}
                          <span className={typeof val === 'boolean' && !val ? 'text-gray-400' : 'text-gray-700'}>
                            {isThai ? row.labelTh : row.labelEn}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="px-4 pb-4">
                  {renderCta(plan)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Enterprise note */}
      <p className="text-xs text-center text-gray-400">
        {isThai
          ? 'สำหรับแผน Enterprise กรุณาติดต่อทีมขาย: sales@taxinvoice.th'
          : 'For Enterprise plans, contact our sales team: sales@taxinvoice.th'}
      </p>
    </div>
  );
}
