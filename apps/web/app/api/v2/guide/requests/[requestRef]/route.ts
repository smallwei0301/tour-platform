import { getMidaoBookingRequestDb, getMidaoInquiryRequestDb } from '../../../../../../src/lib/midao/db-requests.mjs';
import { resolveMidaoRequestDetail } from '../../../../../../src/lib/midao/request-detail-resolver.ts';
import { parseRequestRef } from '../../../../../../src/lib/midao/request-ref.mjs';
import { MidaoRouteError } from '../../../../../../src/lib/midao/route-errors.ts';
import { withMidaoGuideQuery } from '../../../../../../src/lib/midao/with-guide-route.ts';

type DetailRouteContext = {
  params: Promise<{ requestRef: string }>;
};

function translateDetailError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error
    && error.code === 'INVALID_REQUEST_REF') {
    throw new MidaoRouteError('INVALID_REQUEST_REF', 'Invalid request reference', 422);
  }

  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('BOOKING_NOT_FOUND:') || message.startsWith('INQUIRY_NOT_FOUND:')) {
    throw new MidaoRouteError('NOT_FOUND', 'Resource not found', 404);
  }
  throw error;
}

export async function GET(request: Request, { params }: DetailRouteContext) {
  return withMidaoGuideQuery(
    request,
    async ({ guideId }) => {
      let reference;
      try {
        reference = parseRequestRef((await params).requestRef);
      } catch (error) {
        return translateDetailError(error);
      }

      try {
        const projection = reference.kind === 'booking'
          ? await getMidaoBookingRequestDb({ guideId, bookingId: reference.id })
          : await getMidaoInquiryRequestDb({ guideId, inquiryId: reference.id });
        return resolveMidaoRequestDetail(projection);
      } catch (error) {
        return translateDetailError(error);
      }
    },
    { route: 'v2/guide/requests/detail' },
  );
}
