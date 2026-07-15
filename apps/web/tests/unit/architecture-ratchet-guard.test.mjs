/**
 * 架構 ratchet guard — 雜亂度「只能降、不能升」。
 *
 * 源自 2026-07-04 架構健檢（docs/04-tech/04-tech-architecture/15-architecture-modularity-review.md）。
 * 把健檢當日量到的四項雜亂度指標鎖成天花板：
 *   1. 巨型檔案（>800 行）逐檔鎖現值，且不得出現新的 >800 行檔案
 *   2. app/api 直接 import @supabase/supabase-js｜@supabase/ssr 的檔案數
 *   3. app+src 直讀 process.env 的檔案數（src/config 之外）
 *   4. src/lib 頂層攤平檔案數（新領域請開子資料夾或 db-<domain> 檔）
 *
 * 每次清理後請把對應天花板「下修」到新值以鎖住成果。
 * 若因修 P0 bug 必須超標 —— 那是唯一該調高天花板的理由，且應在 PR 說明；
 * 預設請優先「拆檔／改走共用 helper」而非放寬天花板。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '../..');

const SOURCE_EXTS = ['.ts', '.tsx', '.mjs'];

function isSourceFile(relPath) {
  if (!SOURCE_EXTS.some((ext) => relPath.endsWith(ext))) return false;
  if (relPath.endsWith('.d.ts') || relPath.endsWith('.d.mts')) return false;
  if (relPath.includes('.test.')) return false;
  if (relPath.split('/').includes('tests')) return false;
  return true;
}

function walkSourceFiles(relDir) {
  const out = [];
  const absDir = join(WEB_ROOT, relDir);
  for (const entry of readdirSync(absDir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const abs = join(absDir, entry);
    const rel = relative(WEB_ROOT, abs).split('\\').join('/');
    if (statSync(abs).isDirectory()) {
      out.push(...walkSourceFiles(rel));
    } else if (isSourceFile(rel)) {
      out.push(rel);
    }
  }
  return out;
}

function countLines(relPath) {
  return readFileSync(join(WEB_ROOT, relPath), 'utf8').split('\n').length;
}

// Route groups are URL-invisible structural containers. Normalize them before
// checking the historical route-file ceilings so moving an existing page into a
// root-layout group cannot masquerade as a new giant file.
function canonicalRoutePath(relPath) {
  return relPath.replace(/^app\/\(non-locale\)\//, 'app/');
}

// ---------------------------------------------------------------------------
// 1) 巨型檔案天花板（2026-07-04 現值）。
//    db.mjs 不在此表 —— 它由 tests/unit/db-mjs-size-guard.test.mjs 單獨管。
//    拆完一個檔請把該檔天花板下修（或整列刪除，讓它回到 800 行一般上限）。
// ---------------------------------------------------------------------------
// 行數以 split('\n').length 計（與 db-mjs-size-guard 同語意，比 wc -l 多 1）。
// 2026-07-05 #1615：admin activities edit（1538→721）/plans（1306→639）、
// admin/guide availability（1221→631／1218→623）四頁拆解完成、脫離白名單。
const GOD_FILE_CEILINGS = new Map([
  // 1200→1206：#1591/#1594 加購/點數折抵接線。重邏輯（驗證＋DB 快照重算＋回寫金額，約 85 行）
  // 已抽到 src/lib/checkout/order-extras.mjs，route 只留 1 import＋1 個 fail-soft helper 呼叫。
  ['app/api/v2/bookings/draft/route.ts', 1207],
  // 1080→1110：#1591/#1594 加購/點數折抵接線。互動狀態＋兩個選購器已抽到
  // src/components/activity/CheckoutExtrasSection.tsx，頁面殘留＝費用明細顯示行（加購/折抵）＋接線。
  ['app/booking/[activityId]/page.tsx', 1111],
  ['app/guide/profile/page.tsx', 992],
  ['src/lib/email.ts', 863],
  // 827→866：merge origin/main 帶入 #1596 pre-tour-contact 顯示（上游功能，非本分支回退；後續拆頁時下修）。
  ['app/me/orders/[orderId]/page.tsx', 866],
]);

const GENERAL_FILE_LINE_LIMIT = 800;
const DB_MJS = 'src/lib/db.mjs'; // 由 db-mjs-size-guard 管，這裡跳過

test('巨型檔案不得再長大；非白名單檔案不得超過 800 行', () => {
  const files = [...walkSourceFiles('app'), ...walkSourceFiles('src')];
  const violations = [];
  for (const rel of files) {
    if (rel === DB_MJS) continue;
    const lines = countLines(rel);
    const ceiling = GOD_FILE_CEILINGS.get(canonicalRoutePath(rel));
    if (ceiling !== undefined) {
      if (lines > ceiling) violations.push(`${rel}: ${lines} 行 > 天花板 ${ceiling}`);
    } else if (lines > GENERAL_FILE_LINE_LIMIT) {
      violations.push(`${rel}: ${lines} 行 > 一般上限 ${GENERAL_FILE_LINE_LIMIT}（新檔請拆小；勿把新巨檔加進白名單）`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `巨型檔案 ratchet 超標：\n${violations.join('\n')}\n` +
      '請拆出子元件／領域模組，而非放寬天花板。詳見 docs/04-tech/04-tech-architecture/15-architecture-modularity-review.md'
  );
});

// ---------------------------------------------------------------------------
// 2) app/api 直接 import supabase 套件的檔案數（應改用 src/lib/supabase/server.ts
//    或經 db-<domain> 領域檔）。2026-07-04 現值 20。
// ---------------------------------------------------------------------------
const DIRECT_SUPABASE_IMPORT_CEILING = 20;
const SUPABASE_IMPORT_RE = /from\s*['"]@supabase\/(supabase-js|ssr)['"]/;

test('app/api 直接 import @supabase/* 的檔案數不得增加', () => {
  const offenders = walkSourceFiles('app/api').filter((rel) =>
    SUPABASE_IMPORT_RE.test(readFileSync(join(WEB_ROOT, rel), 'utf8'))
  );
  assert.ok(
    offenders.length <= DIRECT_SUPABASE_IMPORT_CEILING,
    `app/api 直接 import supabase 套件的檔案數 ${offenders.length} > 天花板 ${DIRECT_SUPABASE_IMPORT_CEILING}。\n` +
      `新 route 請用 src/lib/supabase/server.ts 或 db-<domain> 領域檔。\n名單：\n${offenders.join('\n')}`
  );
});

// ---------------------------------------------------------------------------
// 3) 直讀 process.env 的檔案數（src/config、src/test-support、src/fixtures 之外）。
//    基準 159（2026-07-04）→ 98（2026-07-05：#1616 第一批把 SUPABASE_URL／
//    SERVICE_ROLE_KEY 直讀全數改走 src/config/supabase-service-env.mjs getter，
//    另有 issue1616-service-role-env-guard 鎖住不回流）→ 99（merge origin/main：
//    #1599 新增 rate-limit-distributed.ts 讀 UPSTASH_* env，非本分支新增）。
//    後續批次繼續下修。新程式的 env 讀取一律經 src/config/*。
// ---------------------------------------------------------------------------
const PROCESS_ENV_FILE_CEILING = 99;
const ENV_EXEMPT_PREFIXES = ['src/config/', 'src/test-support/', 'src/fixtures/'];

test('直讀 process.env 的檔案數不得增加（env 一律經 src/config）', () => {
  const offenders = [...walkSourceFiles('app'), ...walkSourceFiles('src')].filter(
    (rel) =>
      !ENV_EXEMPT_PREFIXES.some((p) => rel.startsWith(p)) &&
      readFileSync(join(WEB_ROOT, rel), 'utf8').includes('process.env')
  );
  assert.ok(
    offenders.length <= PROCESS_ENV_FILE_CEILING,
    `直讀 process.env 的檔案數 ${offenders.length} > 天花板 ${PROCESS_ENV_FILE_CEILING}。` +
      '新增的 env 讀取請集中到 src/config/*（env.ts／security-env.mjs／feature-flags.mjs）。'
  );
});

// ---------------------------------------------------------------------------
// 4) src/lib 頂層攤平檔案數。基準 156（2026-07-04）→ 157（#1613 抽 supabase-env.mjs）。
//    此天花板擋的是「無正當理由的新散檔」；strangler 從 db.mjs 拆出領域檔屬**淨降雜亂**的
//    sanctioned 例外——拆一個檔會使頂層 +1，允許隨拆遷 PR 逐次上調（PR 須說明）。
//    一般新領域仍請開子資料夾（如 availability-v2/），不要往頂層堆。
// ---------------------------------------------------------------------------
// 2026-07-05：#1613 批次抽出 9 個 db-* 領域檔（sanctioned 拆檔）＋#1614 共用 api-response.ts
// （與 api.ts 並列的跨 route 基礎設施）→ 167 → merge origin/main 帶入 #1598
// route-error.ts／#1599 rate-limit-distributed.ts／#1611 guide-dashboard-trend.mjs
// （皆非本分支新增）→ 170 → 二次 merge origin/main 帶入 #1624（#1590–#1594）9 個新檔
// （db-addons／db-notifications／db-points／db-pre-tour-contact／db-review-reply／
// addon-pricing／points-calc／pre-tour-contact-eligibility／review-distribution）→ 179。
const LIB_TOP_LEVEL_FILE_CEILING = 179;

test('src/lib 頂層檔案數不得增加（新領域請開子資料夾）', () => {
  const count = readdirSync(join(WEB_ROOT, 'src/lib')).filter((entry) =>
    statSync(join(WEB_ROOT, 'src/lib', entry)).isFile()
  ).length;
  assert.ok(
    count <= LIB_TOP_LEVEL_FILE_CEILING,
    `src/lib 頂層有 ${count} 個檔案 > 天花板 ${LIB_TOP_LEVEL_FILE_CEILING}。` +
      '請把新模組放進領域子資料夾，或整併進既有領域檔。'
  );
});
