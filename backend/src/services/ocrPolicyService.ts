import prisma from '../config/database';
import { logger } from '../config/logger';
import { getBillingPlanConfig, type OcrTier } from './billingService';

export interface OcrPolicy {
  tier: OcrTier;
  allowTyphoon: boolean;
  allowOpenAI: boolean;
  monthlyDocLimit: number | null;
  docsUsedThisMonth: number;
  overQuota: boolean;
  reason?: 'over_quota' | 'plan_tier';
}

// 60-second cache so OCR calls don't hit DB every time
const policyCache = new Map<string, { value: OcrPolicy; expiresAt: number }>();

function tierAllows(tier: OcrTier): Pick<OcrPolicy, 'allowTyphoon' | 'allowOpenAI'> {
  switch (tier) {
    case 'premium':
      return { allowTyphoon: true, allowOpenAI: true };
    case 'enhanced':
      return { allowTyphoon: true, allowOpenAI: false };
    case 'standard':
    default:
      return { allowTyphoon: false, allowOpenAI: false };
  }
}

export async function getOcrPolicyForCompany(companyId?: string): Promise<OcrPolicy> {
  if (!companyId) {
    return { tier: 'standard', allowTyphoon: false, allowOpenAI: false, monthlyDocLimit: null, docsUsedThisMonth: 0, overQuota: false };
  }
  const cached = policyCache.get(companyId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const sub = await prisma.companySubscription.findUnique({
      where: { companyId },
      select: { plan: true, status: true, docLimit: true },
    });
    const planKey = (sub?.plan ?? 'starter') as 'starter' | 'business' | 'enterprise';
    const planConfig = getBillingPlanConfig(planKey);
    const monthlyDocLimit = sub?.docLimit ?? planConfig.docLimit;

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const docsUsedThisMonth = await prisma.documentIntake.count({
      where: { companyId, createdAt: { gte: monthStart } },
    });

    const overQuota = monthlyDocLimit !== null && docsUsedThisMonth >= monthlyDocLimit;
    const tierPerms = tierAllows(planConfig.ocrTier);

    const policy: OcrPolicy = {
      tier: planConfig.ocrTier,
      allowTyphoon: tierPerms.allowTyphoon && !overQuota,
      allowOpenAI: tierPerms.allowOpenAI && !overQuota,
      monthlyDocLimit,
      docsUsedThisMonth,
      overQuota,
      reason: overQuota ? 'over_quota' : undefined,
    };
    policyCache.set(companyId, { value: policy, expiresAt: now + 60_000 });
    return policy;
  } catch (err) {
    logger.warn('[OCR policy] lookup failed; defaulting to standard tier', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { tier: 'standard', allowTyphoon: false, allowOpenAI: false, monthlyDocLimit: null, docsUsedThisMonth: 0, overQuota: false };
  }
}

export function invalidateOcrPolicyCache(companyId?: string) {
  if (companyId) policyCache.delete(companyId);
  else policyCache.clear();
}
