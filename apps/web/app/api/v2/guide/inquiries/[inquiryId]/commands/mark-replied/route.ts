/**
 * #1759 Package 4／Task 39：導遊標記詢問單已回覆。
 *
 * 契約來源：2026-08-07-issue1759-task39-conversion-gateway-plan.md §4.6。
 * 不重造 gateway —— 復用既有 `markMidaoInquiryRepliedDb`（ownership + 狀態機 +
 * CAS + lost-update 偵測皆已具備），本檔只做 result-object → MidaoRouteError 翻譯。
 */
import { markMidaoInquiryRepliedDb } from '../../../../../../../../src/lib/midao/db-midao-inquiries.mjs';
import { MidaoRouteError } from '../../../../../../../../src/lib/midao/route-errors.ts';
import { withMidaoGuideCommand } from '../../../../../../../../src/lib/midao/with-guide-route.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function normalizeInquiryId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new MidaoRouteError('INVALID_INQUIRY_ID', 'Invalid inquiry id', 422);
  }
  return value.trim().toLowerCase();
}

/** body 契約：必須是嚴格空物件。 */
function assertEmptyBody(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 0) {
    throw new MidaoRouteError('INVALID_REQUEST_BODY', 'Invalid request body', 422);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ inquiryId: string }> },
) {
  return withMidaoGuideCommand(
    request,
    async ({ guideId, body }) => {
      const inquiryId = normalizeInquiryId((await params).inquiryId);
      assertEmptyBody(body);

      const result = await markMidaoInquiryRepliedDb({ inquiryId, guideId });
      if (!result.ok) {
        throw new MidaoRouteError(
          result.code === 'INQUIRY_NOT_FOUND' ? 'NOT_FOUND' : result.code,
          result.code === 'INQUIRY_NOT_FOUND'
            ? 'Resource not found'
            : 'Inquiry state does not allow this action',
          result.status,
        );
      }
      return { inquiry: result.inquiry };
    },
    { route: 'v2/guide/inquiries/[inquiryId]/commands/mark-replied' },
  );
}
