/**
 * #1614 — v2 route 手刻回應樣板 ratchet guard（只能縮不能增）。
 *
 * 新 v2 route 的成功／錯誤回應一律走 src/lib/api-response.ts 的 jsonOk/jsonError
 * （必要時搭配 #1600 parseBody、#1598 handleRouteError）。本 guard 把「直接呼叫
 * Response.json / NextResponse.json 的 v2 route 檔」鎖成白名單：
 *   - 新增 route 檔出現手刻樣板 → 紅燈（請改用 helper）
 *   - 白名單內的檔案改完 helper 後 → 請把該檔自白名單移除鎖住成果
 * 2026-07-05 基準：28 檔（jsonOk/jsonError 首批示範接入 3 檔後的現值）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '../..');
const V2_ROOT = join(WEB_ROOT, 'app/api/v2');

// 手刻樣板白名單（2026-07-05 現值；只能移除、不得追加）
const LEGACY_HANDROLLED = new Set([
  'app/api/v2/activities/[activityId]/available-slots/route-handler.ts',
  'app/api/v2/admin/activities/[activityId]/plans/[planId]/route.ts',
  'app/api/v2/admin/activities/[activityId]/plans/[planId]/seasons/[seasonId]/route.ts',
  'app/api/v2/admin/activities/[activityId]/plans/[planId]/seasons/route.ts',
  'app/api/v2/admin/activities/[activityId]/plans/route.ts',
  'app/api/v2/admin/activities/[activityId]/readiness/route.ts',
  'app/api/v2/admin/activities/[activityId]/schedules/route.ts',
  'app/api/v2/admin/guides/[guideId]/activity-plans/route.ts',
  'app/api/v2/admin/guides/[guideId]/availability-preview/route.ts',
  'app/api/v2/admin/guides/[guideId]/availability-rules/[ruleId]/route.ts',
  'app/api/v2/admin/guides/[guideId]/availability-rules/route.ts',
  'app/api/v2/admin/guides/[guideId]/blackout-dates/[blackoutId]/route.ts',
  'app/api/v2/admin/guides/[guideId]/blackout-dates/route.ts',
  'app/api/v2/admin/guides/[guideId]/conflict-overrides/route.ts',
  'app/api/v2/admin/orders/[orderId]/post-trip-status/route.ts',
  'app/api/v2/admin/orders/[orderId]/send-review-invitation/route.ts',
  'app/api/v2/admin/orders/post-trip-summary/route.ts',
  'app/api/v2/admin/pos/bookings/[bookingId]/manual-payment/route.ts',
  'app/api/v2/admin/pos/bookings/[bookingId]/route.ts',
  'app/api/v2/admin/pos/orders/[orderId]/additional-payment/route.ts',
  'app/api/v2/admin/pos/orders/[orderId]/refund/route.ts',
  'app/api/v2/bookings/[bookingId]/checkout/route.ts',
  'app/api/v2/bookings/draft/route.ts',
  'app/api/v2/guide/orders/[orderId]/redeem/route.ts',
  'app/api/v2/guide/orders/[orderId]/trip-report/route.ts',
  'app/api/v2/guide/trip-reports-due/route.ts',
  'app/api/v2/line/auth/handoff/route.ts',
  'app/api/v2/orders/[orderId]/refund-preview/route.ts',
  // merge origin/main 帶入：#1592 導遊評論回覆（上游功能，其開發時 api-response helper
  // 尚未存在；比照白名單同性質列入，後續可另案改走 jsonOk/jsonError）。
  'app/api/v2/guide/reviews/[reviewId]/reply/route.ts',
]);

const HANDROLLED_RE = /(?:^|[^A-Za-z])(?:Response|NextResponse)\.json\(/;

function walkRoutes(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...walkRoutes(abs));
    else if (/^route.*\.ts$/.test(entry)) out.push(abs);
  }
  return out;
}

test('v2 route 手刻 Response.json 僅限白名單（新 route 一律走 jsonOk/jsonError）', () => {
  const offenders = walkRoutes(V2_ROOT)
    .filter((abs) => HANDROLLED_RE.test(readFileSync(abs, 'utf8')))
    .map((abs) => relative(WEB_ROOT, abs).split('\\').join('/'))
    .filter((rel) => !LEGACY_HANDROLLED.has(rel));
  assert.deepEqual(
    offenders,
    [],
    `以下 v2 route 手刻了 Response.json／NextResponse.json（白名單之外）：\n${offenders.join('\n')}\n` +
      '請改用 src/lib/api-response.ts 的 jsonOk/jsonError（#1614）。'
  );
});

test('白名單毒丸：已改用 helper 的檔案應自白名單移除（只能縮）', () => {
  const stale = [...LEGACY_HANDROLLED].filter((rel) => {
    try {
      return !HANDROLLED_RE.test(readFileSync(join(WEB_ROOT, rel), 'utf8'));
    } catch {
      return true; // 檔案已刪除 → 白名單也該清
    }
  });
  assert.deepEqual(
    stale,
    [],
    `以下白名單項目已不再手刻回應（或檔案已刪除），請自 LEGACY_HANDROLLED 移除鎖住成果：\n${stale.join('\n')}`
  );
});
