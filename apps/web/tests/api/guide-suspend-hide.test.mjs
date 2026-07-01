/**
 * 下架（停權）導遊 → 連帶隱藏其公開導遊頁與所有行程。
 *
 * 現況缺口（停權只把 verification_status 設為 'suspended'）：
 *   - 認識導遊列表 /guides 已隱藏（listPublishedGuidesDb 過濾 approved）。
 *   - 但 /guides/[slug] 詳情頁、/activities 列表、行程詳情都「不看導遊
 *     狀態」，停權導遊仍能直接以網址被看到、行程照常曝光。
 *
 * 補全（全部以 verification_status === 'approved' 為對外可見門檻；
 * is_published 只影響認識導遊列表，預覽與行程不受其影響）：
 *   1. getGuideBySlugDb：導遊非 approved（即 suspended）→ 回 null → 404。
 *   2. listPublishedActivitiesDb：排除導遊已停權的行程（無導遊的平台
 *      行程不受影響）。
 *   3. getActivityBySlugDb：行程所屬導遊已停權 → 回 null → 404。
 *
 * db.mjs 的 Supabase 分支需真實連線，故以 source-contract 鎖定查詢與
 * 守衛；行為層另以 production live smoke 佐證。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..', '..');
const DB_MJS = join(APP_ROOT, 'src/lib/db.mjs');
const SUSPEND_ROUTE = join(APP_ROOT, 'app/api/admin/guides/[guideId]/suspend/route.ts');

function sliceFn(src, name) {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `找不到 ${name}`);
  const next = src.indexOf('\nexport async function ', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

const SRC = readFileSync(DB_MJS, 'utf8');

test('getGuideBySlugDb：停權（非 approved）導遊 → 回 null（詳情頁 404）', () => {
  const fn = sliceFn(SRC, 'getGuideBySlugDb');
  // 載入 gp 後需有「非 approved → return null」的守衛。
  assert.match(
    fn,
    /verification_status\s*!==\s*['"]approved['"][\s\S]{0,40}return null|suspended[\s\S]{0,40}return null/,
    '需在 verification_status 非 approved 時回 null',
  );
});

test('listPublishedActivitiesDb：guide 查詢帶 verification_status 並排除停權導遊的行程', () => {
  const fn = sliceFn(SRC, 'listPublishedActivitiesDb');
  assert.match(fn, /guide_profiles[\s\S]*verification_status/, 'guide 查詢需 select verification_status');
  // 需依導遊狀態過濾（保留無導遊的平台行程）。
  assert.match(fn, /verification_status\s*===\s*['"]approved['"]|approvedGuideIds|\.filter\(/, '需排除停權導遊的行程');
});

test('getActivityBySlugDb：行程所屬導遊已停權 → 回 null（行程詳情 404）', () => {
  const fn = sliceFn(SRC, 'getActivityBySlugDb');
  assert.match(fn, /guide_profiles[\s\S]*verification_status/, 'guide profile 查詢需 select verification_status');
  assert.match(
    fn,
    /verification_status\s*!==\s*['"]approved['"][\s\S]{0,60}return null/,
    '導遊非 approved 時整筆行程回 null',
  );
});

test('suspend route：停權/復權後 on-demand 失效公開頁（list + 導遊頁 + 行程列表，含各 locale #1488）', () => {
  const src = readFileSync(SUSPEND_ROUTE, 'utf8');
  assert.match(src, /from\s+['"]next\/cache['"]/, '需 import next/cache');
  // #1488：/guides、/activities 在 app/[locale]/，需以 localizeRevalidationPaths 展開各 locale。
  assert.match(src, /localizeRevalidationPaths/, '需以 localizeRevalidationPaths 展開各 locale');
  assert.match(src, /['"]\/guides['"]/, '需失效認識導遊列表');
  assert.match(src, /[`'"]\/guides\/\$\{?/, '需失效該導遊詳情頁');
  assert.match(src, /['"]\/activities['"]/, '需失效行程列表');
  assert.match(src, /revalidatePath\(p\)/, '需對每個 locale 版本 revalidatePath');
  assert.match(src, /select\([^)]*\bslug\b/, '需取 slug 以失效該導遊頁');
});
