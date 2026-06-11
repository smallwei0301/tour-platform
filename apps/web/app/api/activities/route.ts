import { ok, fail } from '../../../src/lib/api';
import { hasSupabaseEnv, listPublishedActivitiesDb } from '../../../src/lib/db.mjs';
import { applyPublicActivitiesCacheHeaders } from '../../../src/lib/public-cache-headers.mjs';
import {
  parseActivitiesFilterParams,
  applyPriceRange,
  hasOpenScheduleOn,
} from '../../../src/lib/activities-list-filters.mjs';
import { getV2ActivityAvailability } from '../../../src/lib/availability-v2/activity-day-availability';

// #1380: 日期可訂過濾的逐活動評估上限 — 限制 v2 引擎查詢扇出，避免大型結果集
// 拖垮列表回應（issue 註明可先限制在已過濾結果集；超出上限的活動 fail-open 保留）。
const DATE_FILTER_EVAL_CAP = 50;

type ListedActivity = {
  id: string;
  slug: string;
  priceTwd: number;
};

function makeRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

async function filterByDateAvailability(activities: ListedActivity[], date: string): Promise<ListedActivity[]> {
  if (!hasSupabaseEnv()) {
    // in-memory fallback：以 fixture 的 legacy schedules 判定（與訂位 fallback 同源）
    const { activities: fixtureActivities } = await import('../../../src/fixtures/data');
    const schedulesBySlug = new Map(
      (fixtureActivities || []).map((a) => [a.slug, a.schedules])
    );
    return activities.filter((a) => hasOpenScheduleOn(schedulesBySlug.get(a.slug), date));
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const evaluated = activities.slice(0, DATE_FILTER_EVAL_CAP);
  const rest = activities.slice(DATE_FILTER_EVAL_CAP);

  const verdicts = await Promise.all(
    evaluated.map(async (activity) => {
      try {
        const result = await getV2ActivityAvailability(supabase, activity.id, {
          dateFrom: date,
          dateTo: date,
        });
        return (result.plans || []).some((row) => row.status === 'open' && row.remaining > 0);
      } catch {
        // fail-open：引擎個別失敗時保留該活動，避免發現面因引擎抖動而空白；
        // 最終可訂真相仍由詳情頁/訂位流程把關
        return true;
      }
    })
  );

  return [...evaluated.filter((_, i) => verdicts[i]), ...rest];
}

export async function GET(request: Request) {
  const requestId = makeRequestId();
  const startedAt = Date.now();
  const url = new URL(request.url);
  const region = url.searchParams.get('region') || '';
  const category = url.searchParams.get('category') || '';
  const q = url.searchParams.get('q') || '';

  // #1380: date / priceMin / priceMax（非法輸入 400，不進查詢）
  const filterParams = parseActivitiesFilterParams(url.searchParams);
  if (filterParams.error) {
    const res = Response.json(fail(filterParams.error.code, filterParams.error.message), { status: 400 });
    res.headers.set('x-request-id', requestId);
    return res;
  }

  try {
    let data = await listPublishedActivitiesDb({ region, category, q });

    // #1380: 價格與日期過濾套用於統一回傳 shape — Supabase 與 in-memory
    // fallback 走同一條 code path，行為必然一致
    data = applyPriceRange(data, filterParams.priceMin, filterParams.priceMax);
    if (filterParams.date) {
      data = await filterByDateAvailability(data, filterParams.date);
    }

    const res = Response.json(ok(data));
    res.headers.set('x-request-id', requestId);
    // #1249: public listing data — let Vercel Edge cache anonymous
    // responses so traveler navigations don't pay the function round
    // trip every time. Error path stays uncached below. The shared
    // helper also defensively strips Authorization / Set-Cookie / admin
    // headers so nothing personal can leak into a public cached body.
    applyPublicActivitiesCacheHeaders(res);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const elapsedMs = Date.now() - startedAt;
    console.error('[api/activities] failed', {
      requestId,
      elapsedMs,
      region,
      category,
      q,
      error: message,
    });

    const res = Response.json(
      fail('SERVER_ERROR', `activities_fetch_failed (requestId=${requestId})`),
      { status: 500 }
    );
    res.headers.set('x-request-id', requestId);
    return res;
  }
}
