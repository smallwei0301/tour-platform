/**
 * Issue #1777 Phase 1 — 確認出款 fail-closed guard。
 *
 * 決策 A（owner 2026-07-29 拍板）：在 #1777 Phase 2 的原子 RPC 完成並驗收前，
 * 真實 payout confirmation 維持 **HOLD**。
 *
 * 理由（#1777 缺口 4）：confirmPayoutDb（db-payouts.mjs:59-116）把「扣
 * guide_balances → payouts pending→paid → 寫 audit」拆成三次獨立呼叫。扣款
 * 成功但 payout update 失敗時，payout 仍是 pending、餘額卻已被扣，重試會**再扣
 * 一次**；`Math.max(0, …)`（:75）還會把餘額不足靜默截成 0。在修好前，任何一次
 * 真實 confirm 都可能重複扣減導遊餘額。
 *
 * 為什麼不沿用 cron-job-controls 的 kill-switch：
 *   isCronJobEnabled 是**刻意 fail-open** 的（cron-job-controls.mjs:127-130
 *   「排程連續性優先於後台可用性」），讀取失敗一律視為 enabled。用在金流出款
 *   上語意完全相反——這裡必須 fail-closed：任何讀不到／解析不了的狀態都應該
 *   擋下出款。且 payout confirm 是 admin 手動 API 而非排程 job，塞進
 *   CRON_JOBS registry 會讓後台排程清單出現不存在的工作。
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

async function loadGuard() {
  return import('../../src/lib/settlement/payout-confirm-guard.mjs');
}

describe('#1777 — payout confirm guard 預設 fail-closed', () => {
  it('未設定任何 env 時擋下出款（預設 HOLD，非預設放行）', async () => {
    const { isPayoutConfirmAllowed } = await loadGuard();
    const result = isPayoutConfirmAllowed({});
    assert.equal(result.allowed, false, '未明確開啟時必須擋下——這是 fail-closed 的核心');
    assert.ok(result.reasonZh, '必須提供繁中理由供 admin 介面顯示');
  });

  it('env 明確為 "true" 時放行（修復驗收後的解鎖路徑）', async () => {
    const { isPayoutConfirmAllowed } = await loadGuard();
    assert.equal(isPayoutConfirmAllowed({ PAYOUT_CONFIRM_ENABLED: 'true' }).allowed, true);
  });

  it('大小寫與前後空白不影響解鎖判定', async () => {
    const { isPayoutConfirmAllowed } = await loadGuard();
    for (const raw of ['TRUE', ' true ', 'True']) {
      assert.equal(isPayoutConfirmAllowed({ PAYOUT_CONFIRM_ENABLED: raw }).allowed, true, `"${raw}" 應解鎖`);
    }
  });

  it('任何非 "true" 的值一律擋下（不得把 "1"／"yes"／空字串當成開啟）', async () => {
    const { isPayoutConfirmAllowed } = await loadGuard();
    for (const raw of ['1', 'yes', 'on', 'enabled', '', 'false', 'FALSE', 'null', 'undefined']) {
      assert.equal(
        isPayoutConfirmAllowed({ PAYOUT_CONFIRM_ENABLED: raw }).allowed,
        false,
        `"${raw}" 不得被當成開啟——出款解鎖必須是明確且唯一的字面值`,
      );
    }
  });

  it('env 物件本身異常時仍 fail-closed（不得因讀取失敗而放行）', async () => {
    const { isPayoutConfirmAllowed } = await loadGuard();
    const hostile = new Proxy({}, { get() { throw new Error('env read exploded'); } });
    assert.equal(isPayoutConfirmAllowed(hostile).allowed, false, '讀取拋錯時必須擋下，不得 fail-open');
    assert.equal(isPayoutConfirmAllowed(null).allowed, false);
    assert.equal(isPayoutConfirmAllowed(undefined).allowed, false, '無參數時預設讀 process.env，測試環境未設 → 擋下');
  });

  it('回傳穩定的錯誤碼供前端與稽核辨識', async () => {
    const { isPayoutConfirmAllowed, PAYOUT_CONFIRM_HOLD_CODE } = await loadGuard();
    assert.equal(PAYOUT_CONFIRM_HOLD_CODE, 'PAYOUT_CONFIRM_ON_HOLD');
    assert.equal(isPayoutConfirmAllowed({}).code, PAYOUT_CONFIRM_HOLD_CODE);
  });
});

// ── route 層：HOLD 必須擋在任何 DB 接觸之前 ───────────────────────────────────
//
// NOT_AUTOMATABLE-env：無法在 node --test 內實際執行本 route。route.ts 使用
// extensionless TS import（`from '.../route-error'`），Node ESM 解析不了，需
// Next.js bundler——這也是 repo 內既有 route 契約測試一律走原始碼分析的原因。
// 因此這裡鎖**順序契約**而非字串存在性：guard 必須出現在 createClient 與
// confirmPayoutDb 之前。「把 guard 加了但擺在扣款之後」這種真實錯誤會被抓到，
// 而那正是本 guard 唯一會失效的方式。核心判定邏輯已由上方的行為測試覆蓋。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIRM_ROUTE = join(__dirname, '../../app/api/v2/admin/payouts/[payoutId]/confirm/route.ts');

describe('#1777 — confirm route 的 HOLD gate 必須擋在扣款之前', () => {
  const src = readFileSync(CONFIRM_ROUTE, 'utf8');

  it('route 引用 fail-closed guard', () => {
    assert.match(src, /isPayoutConfirmAllowed/, 'confirm route 必須接上 payout-confirm-guard');
  });

  it('guard 判定早於 Supabase client 建立與出款扣款呼叫', () => {
    const gateAt = src.indexOf('isPayoutConfirmAllowed(');
    const clientAt = src.indexOf('createClient(');
    // #1777 Phase 2 起改走原子 RPC wrapper；比對「實際呼叫」而非註解提及，
    // 因此鎖 `await confirmPayoutAtomicDb(` 這個呼叫形式。
    const debitAt = src.indexOf('await confirmPayoutAtomicDb(');

    assert.ok(gateAt >= 0, 'guard 必須被呼叫');
    assert.ok(clientAt >= 0 && debitAt >= 0, 'route 仍應保有出款實作');
    assert.ok(gateAt < clientAt, 'guard 必須早於 Supabase client 建立');
    assert.ok(gateAt < debitAt, 'guard 必須早於扣款呼叫——否則餘額可能已被扣');
  });

  it('HOLD 時回 503 並帶穩定錯誤碼', () => {
    assert.match(src, /status:\s*503/, 'HOLD 必須回 503（暫時不可用），而非 400');
    assert.match(src, /gate\.code/, '回應必須帶 guard 的錯誤碼供前端與稽核辨識');
  });
});
