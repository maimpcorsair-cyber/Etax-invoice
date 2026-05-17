import { logger } from './logger';

/**
 * Structured audit log for document-state transitions and other
 * compliance-relevant events. Writes to the standard logger with a
 * consistent shape so it can be filtered in Render logs / Sentry
 * breadcrumbs without a dedicated DB table.
 *
 * Format: { audit: true, event, companyId, actorUserId, intakeId, ...extra }
 *
 * Future evolution: a proper IntakeAuditLog table can ingest the same
 * events when accounting-compliance demands persistent audit (e.g. for
 * 5-year RD retention). The shape here matches what that table would
 * have so the migration is mechanical.
 */
export interface AuditEventInput {
  event:
    | 'intake_created'
    | 'intake_ocr_completed'
    | 'intake_confirmed'
    | 'intake_saved_as_purchase'
    | 'intake_matched_with_slip'
    | 'intake_matched_with_bill'
    | 'intake_rejected'
    | 'intake_cancelled'
    | 'intake_quota_blocked'
    | 'intake_duplicate_warned'
    | 'purchase_paid_via_slip'
    | 'category_set'
    | 'field_edited';
  companyId?: string | null;
  actorUserId?: string | null;
  actorLineUserId?: string | null;
  intakeId?: string | null;
  purchaseInvoiceId?: string | null;
  invoiceId?: string | null;
  extra?: Record<string, unknown>;
}

export function auditLog(input: AuditEventInput): void {
  try {
    logger.info('[audit]', {
      audit: true,
      event: input.event,
      at: new Date().toISOString(),
      companyId: input.companyId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorLineUserId: input.actorLineUserId ?? null,
      intakeId: input.intakeId ?? null,
      purchaseInvoiceId: input.purchaseInvoiceId ?? null,
      invoiceId: input.invoiceId ?? null,
      ...(input.extra ?? {}),
    });
  } catch {
    // Audit logging must never throw — fall back silently.
  }
}
