// Order-event email fan-out for GUIDE + ADMIN (#302b notification architecture).
//
// Fills the audited gap: guides received no email on core order events, and
// admins only on payment. This resolves the order's guide email (reusing
// reschedule-notify's lookupOrderContext) and emails the guide + admins.
//
// Fire-and-forget: never throws; guide email skips silently when the order has
// no resolvable guide email (e.g. in-memory fixtures / guest data).

import { lookupOrderContext } from './reschedule-notify';
import {
  sendGuideOrderNotification,
  sendAdminOrderNotification,
  type OrderEventEmailKind,
} from './email';

export async function dispatchOrderEventEmails(params: {
  orderId: string;
  kind: OrderEventEmailKind;
  activityTitle: string;
  scheduleDate?: string | null;
  peopleCount?: number;
  totalTwd?: number;
  // Payment already emails admins via sendAdminPaymentNotification — set false to
  // avoid a duplicate admin email on that event.
  includeAdmin?: boolean;
}): Promise<void> {
  const { orderId, kind, activityTitle, scheduleDate, peopleCount, totalTwd, includeAdmin = true } = params;
  const base = { orderId, activityTitle, scheduleDate, peopleCount, totalTwd, contactEmail: '' };

  // Guide email — resolve guide_email from the order; skip silently if absent.
  try {
    const ctx = await lookupOrderContext(orderId);
    if (ctx?.guideEmail) {
      await sendGuideOrderNotification({ ...base, to: ctx.guideEmail, kind });
    }
  } catch {
    /* fire-and-forget */
  }

  // Admin email — to the ADMIN_EMAIL_ALLOWLIST (no-op when empty).
  if (includeAdmin) {
    try {
      await sendAdminOrderNotification({ ...base, kind });
    } catch {
      /* fire-and-forget */
    }
  }
}
