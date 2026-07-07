/**
 * Issue #1598 — v2 route 事故上報覆蓋守門（source-contract）。
 *
 * 規則：app/api/v2/**​/route.ts 的例外處理一律過 handleRouteError／reportRouteError
 * （消滅「只 console.error」的靜默失敗）。少數 route 因結構或性質列白名單，需在此註明原因。
 *
 * 白名單只能縮不能擴：新增 v2 route 若不接上報又不進白名單，本測試會擋。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V2_DIR = path.resolve(__dirname, '../..', 'app/api/v2');

// 白名單：key = 相對 app/api/v2 的路徑，value = 原因。皆為「無頂層 try/catch 的唯讀
// GET／handoff route」——例外會落到 Next 預設 500（不含使用者輸入的敏感操作），
// 事故價值低於 mutation 路徑。conflict-overrides 的頂層 catch 僅守 body parse，
// 下游 DB 例外目前 bubble 到預設 500，列為 follow-up（POST 但屬 admin 內部工具）。
const WHITELIST = {
  'activities/[activityId]/available-slots/route.ts': '唯讀 GET，無頂層 try/catch；可用性查詢例外落 Next 預設 500',
  'admin/activities/[activityId]/readiness/route.ts': '唯讀 GET readiness 快照；無頂層 try/catch',
  'orders/[orderId]/refund-preview/route.ts': '唯讀 GET 退款試算；無頂層 try/catch',
  'line/auth/handoff/route.ts': 'LINE handoff（redirect），無頂層 try/catch',
  'admin/guides/[guideId]/conflict-overrides/route.ts': 'follow-up：頂層 catch 僅守 body parse，下游 DB 例外待另包 try 上報',
  // #1649 Phase 6 自 legacy 搬遷的唯讀 GET（legacy 即無頂層 try/catch，例外落 Next 預設 500）：
  'guide/bookings/route.ts': '唯讀 GET 導遊訂單列表；無頂層 try/catch（#1649 搬遷保留 legacy 態）',
  'guide/bookings/[bookingId]/route.ts': '唯讀 GET 訂單明細；無頂層 try/catch（#1649 搬遷保留 legacy 態）',
  'guide/payout/monthly/route.ts': '唯讀 GET 月結估算；無頂層 try/catch（#1649 搬遷保留 legacy 態）',
  'guide/payout/monthly/csv/route.ts': '唯讀 GET 月結 CSV；無頂層 try/catch（#1649 搬遷保留 legacy 態）',
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

/**
 * #1649 strangler 委派殼：v2 命名空間 route 直接 re-export（或 CSRF wrapper 後委派）
 * legacy handler——殼內零業務邏輯、零 try/catch，「靜默 console.error」在結構上不可能，
 * 錯誤處理語意由被委派的 legacy 實作持有（那邊自有測試鎖定）。
 * 判定條件刻意嚴格：除了註解/​import 之外只允許 re-export 與 CSRF 委派樣板；
 * 一旦殼長出自己的 try/catch 或 supabase 呼叫，就回到一般規則（必須接上報）。
 * Phase 6 實作搬遷進 v2 後，此類殼消失，本函式隨之無匹配對象。
 */
function isDelegationShell(src) {
  if (/try\s*\{|console\.error|supabase/.test(src)) return false;
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .trim();
  const lines = stripped.split('\n').map((l) => l.trim()).filter(Boolean);
  const allowed = [
    /^export \{ [A-Za-z, ]+ \} from '[^']+';?$/,
    /^import \{ validateCsrf \} from '[^']+';?$/,
    /^import \{ (GET|POST|PATCH|DELETE) as legacy(GET|POST|PATCH|DELETE) \} from '[^']+';?$/,
    /^export async function (POST|PATCH|DELETE)\(request: Request, context: \{ params: Promise<\{ \w+: string \}> \}\) \{$/,
    /^const csrfError = validateCsrf\(request\);$/,
    /^if \(csrfError\) return csrfError;$/,
    /^return legacy(GET|POST|PATCH|DELETE)\(request, context\);$/,
    /^\}$/,
  ];
  return lines.every((line) => allowed.some((re) => re.test(line)));
}

test('T1598.coverage — 每個 v2 route 皆接事故上報，或在白名單且註明原因', () => {
  const routes = walk(V2_DIR);
  assert.ok(routes.length >= 25, `應掃到足量 v2 route（實得 ${routes.length}）`);

  const uncovered = [];
  for (const full of routes) {
    const rel = path.relative(V2_DIR, full);
    const src = readFileSync(full, 'utf8');
    const wired = /handleRouteError|reportRouteError/.test(src);
    const whitelisted = Object.prototype.hasOwnProperty.call(WHITELIST, rel);
    if (isDelegationShell(src)) continue; // #1649 委派殼：錯誤語意由 legacy 實作持有
    if (!wired && !whitelisted) uncovered.push(rel);
    // 白名單但其實已接上報 → 應把它移出白名單（避免白名單腐化）
    if (wired && whitelisted) {
      assert.fail(`${rel} 已接上報，請移出白名單`);
    }
  }
  assert.deepEqual(uncovered, [], `以下 v2 route 未接事故上報且不在白名單：\n${uncovered.join('\n')}`);
});

test('T1598.coverage-ratio — 實接上報比例 ≥ 90%（排除白名單與 #1649 委派殼後）', () => {
  const routes = walk(V2_DIR);
  const applicable = routes.filter(
    (f) => !WHITELIST[path.relative(V2_DIR, f)] && !isDelegationShell(readFileSync(f, 'utf8'))
  );
  const wired = applicable.filter((f) => /handleRouteError|reportRouteError/.test(readFileSync(f, 'utf8')));
  const ratio = wired.length / applicable.length;
  assert.ok(ratio >= 0.9, `applicable route 上報覆蓋率 ${(ratio * 100).toFixed(0)}% < 90%`);
});

test('T1598.payment — 金流／退款鏈路 100% 接上報', () => {
  const critical = [
    'app/api/v2/bookings/[bookingId]/checkout/route.ts',
    'app/api/v2/bookings/draft/route.ts',
    'app/api/v2/admin/pos/orders/[orderId]/refund/route.ts',
    'app/api/v2/admin/pos/orders/[orderId]/additional-payment/route.ts',
    'app/api/v2/admin/pos/bookings/[bookingId]/manual-payment/route.ts',
    'app/api/v2/bookings/[bookingId]/transfer-info/route.ts',
  ];
  for (const rel of critical) {
    const src = readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
    assert.match(src, /handleRouteError|reportRouteError/, `${rel} 金流鏈路必須接事故上報`);
  }
});
