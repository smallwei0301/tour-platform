import { projectMidaoBookingDetail } from './request-list-resolver.ts';

export function resolveMidaoRequestDetail(projection: unknown) {
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
