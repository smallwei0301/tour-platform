export const REQUEST_BUCKETS = Object.freeze([
  'new',
  'needs_reply',
  'replied',
  'completed',
]);

export const REQUEST_SECONDARY_STATES = Object.freeze([
  'pending_approval',
  'awaiting_payment',
  'success',
  'rejected',
  'cancelled',
  'expired',
  'no_show',
  'refund_pending',
  'refunded',
  'closed',
]);

const BOOKING_STATUSES = new Set([
  'draft',
  'pending_confirmation',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'reschedule_requested',
]);
const GUIDE_APPROVAL_STATUSES = new Set(['pending', 'approved', 'rejected']);
const ORDER_STATUSES = new Set([
  'pending_payment',
  'paid',
  'confirmed',
  'completed',
  'rejected',
  'cancelled_by_user',
  'cancelled_by_guide',
  'cancelled_unpaid',
  'refund_pending',
  'refunded',
]);
const INQUIRY_STATUSES = new Set([
  'new',
  'opened',
  'replied',
  'ready_to_convert',
  'converted',
  'closed',
  'expired',
]);

function invalid(field) {
  return {
    ok: false,
    error: { code: 'INVALID_REQUEST_STATE', field },
  };
}

function resolved(bucket, secondaryState = null) {
  return { ok: true, bucket, secondaryState };
}

function resolveBookingBucket(input) {
  if (!BOOKING_STATUSES.has(input.bookingStatus)) return invalid('bookingStatus');
  if (!GUIDE_APPROVAL_STATUSES.has(input.guideApprovalStatus)) {
    return invalid('guideApprovalStatus');
  }
  if (!ORDER_STATUSES.has(input.orderStatus)) return invalid('orderStatus');

  const { bookingStatus, guideApprovalStatus, orderStatus, needsReply } = input;

  if (
    guideApprovalStatus === 'rejected'
    && bookingStatus === 'cancelled'
    && orderStatus === 'cancelled_by_guide'
  ) {
    return resolved('completed', 'rejected');
  }

  if (guideApprovalStatus === 'approved' && bookingStatus === 'cancelled') {
    const terminalByOrderStatus = {
      cancelled_unpaid: 'expired',
      cancelled_by_user: 'cancelled',
      cancelled_by_guide: 'cancelled',
      refund_pending: 'refund_pending',
      refunded: 'refunded',
    };
    const secondaryState = terminalByOrderStatus[orderStatus];
    if (secondaryState) return resolved('completed', secondaryState);
  }

  if (
    guideApprovalStatus === 'approved'
    && bookingStatus === 'no_show'
    && ['paid', 'confirmed', 'completed'].includes(orderStatus)
  ) {
    return resolved('completed', 'no_show');
  }

  if (
    guideApprovalStatus === 'approved'
    && (
      (bookingStatus === 'confirmed' && ['paid', 'confirmed'].includes(orderStatus))
      || (bookingStatus === 'completed' && orderStatus === 'completed')
    )
  ) {
    return resolved('completed', 'success');
  }

  if (
    guideApprovalStatus === 'pending'
    && bookingStatus === 'draft'
    && orderStatus === 'pending_payment'
  ) {
    return resolved('new', 'pending_approval');
  }

  if (
    guideApprovalStatus === 'approved'
    && bookingStatus === 'draft'
    && orderStatus === 'pending_payment'
  ) {
    return needsReply
      ? resolved('needs_reply')
      : resolved('replied', 'awaiting_payment');
  }

  return invalid('state');
}

function resolveInquiryBucket(input) {
  if (!INQUIRY_STATUSES.has(input.inquiryStatus)) return invalid('inquiryStatus');

  const { inquiryStatus, needsReply } = input;
  if (inquiryStatus === 'converted') return resolved('completed', 'success');
  if (inquiryStatus === 'closed') return resolved('completed', 'closed');
  if (inquiryStatus === 'expired') return resolved('completed', 'expired');
  if (inquiryStatus === 'new') return resolved('new');
  if (needsReply) return resolved('needs_reply');
  if (inquiryStatus === 'replied' || inquiryStatus === 'ready_to_convert') {
    return resolved('replied');
  }
  return invalid('state');
}

export function resolveRequestBucket(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('input');
  if (Object.hasOwn(input, 'status')) return invalid('status');
  if (input.kind !== 'booking' && input.kind !== 'inquiry') return invalid('kind');

  const crossDomainFields = input.kind === 'booking'
    ? ['inquiryStatus']
    : ['bookingStatus', 'guideApprovalStatus', 'orderStatus'];
  for (const field of crossDomainFields) {
    if (Object.hasOwn(input, field)) return invalid(field);
  }

  if (typeof input.needsReply !== 'boolean') return invalid('needsReply');

  return input.kind === 'booking'
    ? resolveBookingBucket(input)
    : resolveInquiryBucket(input);
}
