import { resolveMidaoInquiryDetail } from './inquiry-detail-resolver.ts';
import { projectMidaoBookingDetail } from './request-list-resolver.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveMidaoBookingDetail(projection: unknown) {
  const detail = projectMidaoBookingDetail(projection);
  const canDecide = detail.kind === 'booking'
    && detail.bookingStatus === 'draft'
    && detail.guideApprovalStatus === 'pending'
    && detail.orderStatus === 'pending_payment'
    && detail.bucket === 'new'
    && detail.secondaryState === 'pending_approval';

  return {
    ...detail,
    allowedActions: {
      approve: canDecide,
      reject: canDecide,
      markReplied: false,
      convertInquiry: false,
    },
  };
}

export function resolveMidaoRequestDetail(projection: unknown) {
  if (isRecord(projection) && projection.kind === 'inquiry') {
    return resolveMidaoInquiryDetail(projection);
  }
  return resolveMidaoBookingDetail(projection);
}
