/**
 * GET /api/v2/guide/services
 * #1758 S8 · Task 29 — guide 服務清單 API（min/max price、draft/published、分頁）。
 *
 * 白話：讓導遊看到自己名下所有服務項目的分頁清單，涵蓋草稿與已發布狀態，並顯示每個
 * 服務的價格區間（最低／最高方案價）。此為唯讀查詢（無副作用），沿用既有唯讀 guide route
 * 慣例（canonical guide session；不需 CSRF / mutations flag）。
 *
 * Auth：canonical guide session（HMAC cookie + runtime 檢查，沿用 Midao boundary）。清單只
 * 回自己名下（guide_id）的服務，天生無跨人洩漏；分頁查詢參數不合法回 422。
 */
import { resolveGuideServiceList } from '../../../../../src/lib/midao/service-list-resolver.ts';
import { MidaoRouteError } from '../../../../../src/lib/midao/route-errors.ts';
import { withMidaoGuideQuery } from '../../../../../src/lib/midao/with-guide-route.ts';

const ALLOWED_QUERY_KEYS = new Set(['page', 'pageSize', 'status']);
const STATUS_VALUES = new Set(['all', 'draft', 'published']);
const POSITIVE_INT_PATTERN = /^[1-9][0-9]*$/u;

function invalidQuery(): never {
  throw new MidaoRouteError('INVALID_REQUEST_QUERY', 'Invalid request query', 422);
}

function parseListQuery(request: Request): { page: number; pageSize: number; status: string } {
  const searchParams = new URL(request.url).searchParams;
  const values = new Map<string, string>();

  for (const key of searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key) || searchParams.getAll(key).length !== 1) invalidQuery();
    const value = searchParams.get(key);
    if (value === null || value === '') invalidQuery();
    values.set(key, value);
  }

  const pageValue = values.get('page');
  const pageSizeValue = values.get('pageSize');
  const status = values.get('status') ?? 'all';

  if (pageValue !== undefined && !POSITIVE_INT_PATTERN.test(pageValue)) invalidQuery();
  if (pageSizeValue !== undefined && !POSITIVE_INT_PATTERN.test(pageSizeValue)) invalidQuery();
  if (!STATUS_VALUES.has(status)) invalidQuery();

  const page = pageValue === undefined ? 1 : Number(pageValue);
  const pageSize = pageSizeValue === undefined ? 20 : Number(pageSizeValue);
  return { page, pageSize, status };
}

// resolver 的輸入驗證錯誤（例如 pageSize 超出上限）→ 對外 422，其餘非預期錯誤上拋 → 500。
function translateResolverError(error: unknown): never {
  const candidate = error as { code?: unknown; status?: unknown };
  if (candidate && candidate.code === 'INVALID_REQUEST_QUERY') {
    throw new MidaoRouteError('INVALID_REQUEST_QUERY', 'Invalid request query', 422);
  }
  throw error;
}

export async function GET(request: Request) {
  return withMidaoGuideQuery(
    request,
    async ({ guideId }) => {
      const query = parseListQuery(request);
      try {
        return await resolveGuideServiceList(guideId, query);
      } catch (error) {
        return translateResolverError(error);
      }
    },
    { route: 'v2/guide/services' },
  );
}
