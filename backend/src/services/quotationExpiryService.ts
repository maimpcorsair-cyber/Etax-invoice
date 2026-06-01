import prisma from '../config/database';

// Flip quotations that were sent to a customer but passed their validUntil
// date over to `expired`. Drafts are not yet sent (validUntil is meaningless),
// and `accepted` means the customer already committed — neither should expire.
// Optionally scoped to one company (used by the manual trigger route).
// Lives in a side-effect-free service so the API process can call it without
// importing the worker module (which would spin up a duplicate Worker + cron).
export async function runQuotationExpiry(companyId?: string): Promise<number> {
  const now = new Date();
  const { count } = await prisma.quotation.updateMany({
    where: {
      status: 'sent',
      supersededById: null,
      validUntil: { not: null, lt: now },
      ...(companyId ? { companyId } : {}),
    },
    data: { status: 'expired' },
  });
  return count;
}
