/**
 * Issue #1777 Phase 3 — 退款差額 adjustment（owner 決策 B）。
 *
 * 缺口 2：recordRefundReversalDb 固定以原 settlement 的完整 gmv／commission／net
 * 建一筆負值 reversal，完全不看本次退款金額；sweep 又排除任何已有 payout item
 * 的訂單，因此不會依剩餘實收重建分錄。「已結算後部分退款」的訂單導遊剩餘應收
 * 被整筆歸零，而非 `max(0, 總額 − 累積退款) × 分潤率`。
 *
 * 決策 B：每次退款只追加本次差額，不得重複全額紅沖。
 *
 * 本檔驗證：
 *   (a) 紅沖固定是整筆全額反轉（by-design；差額由 adjustment 收斂）
 *   (b) — 已移除，見該區塊說明（冪等鍵改由 DB 端推導）
 *   (c) wrapper 契約：單一 RPC、冪等回應、fail-closed
 *   (d) 決策 B 的金額模型在四情境下收斂到同一最終淨應付
 *
 * NOT_AUTOMATABLE-env：差額的實際計算在 plpgsql 內（需 Postgres），此處以與
 * migration 相同的整數規則獨立實作一份 oracle 來鎖住**模型本身**，並由
 * issue1777-migration-contract 鎖住 SQL 的關鍵安全屬性；端到端金額由 staging
 * 驗證。oracle 與 SQL 若分歧，migration-contract 的 floor 斷言會先擋下。
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

// ── (a) 缺口 2：紅沖不看本次退款金額 ────────────────────────────────────────
//
// ⚠️ 這裡原本有一個以 `.from()` chain 模擬 supabase 的測試，斷言
// `recordRefundReversalDb` 會插入 `net_twd: -8500`（原 settlement 的完整 net），
// 用來鎖住「部分退款也整筆全額反轉」這個問題。
//
// #1777 F4（2026-08-04）把紅沖整包搬進 `fn_record_refund_reversal_atomic`，
// 應用層不再讀寫資料表，那個 mock 模擬的路徑已不存在。
//
// **但缺口 2 的性質沒有改變**：紅沖依然是整筆全額反轉（`-gmv/-commission/-net`），
// 它本來就不該知道本次退了多少——把 ledger 收斂到正確最終淨額的責任在
// `fn_apply_refund_adjustment_atomic`（以「目標 − 現值」計算差額，因此不論紅沖
// 是否過頭都會收斂）。兩者的分工是 by-design，不是待修項。
//
// 因此改鎖 SQL 本身：紅沖分錄必須是原 settlement 的完整負值。

describe('#1777 缺口 2 — 紅沖是整筆全額反轉（差額由 adjustment 收斂）', () => {
  it('reversal 分錄寫的是原 settlement 的完整負值，不看本次退款金額', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const sql = readFileSync(
      join(here, '../../../../supabase/migrations/20260804103000_issue1777_atomic_refund_reversal.sql'),
      'utf8',
    ).replace(/--.*$/gm, '');

    assert.match(
      sql,
      /-coalesce\(v_gmv,\s*0\),\s*-coalesce\(v_commission,\s*0\),\s*-coalesce\(v_net,\s*0\)/i,
      '紅沖固定反轉原 settlement 的完整金額——這就是為什麼需要 adjustment 來收斂差額',
    );
    assert.doesNotMatch(
      sql,
      /p_refund_amount|refund_amount_twd/i,
      '紅沖不讀退款金額；金額收斂是 fn_apply_refund_adjustment_atomic 的責任',
    );
  });
});

// ── (b) 冪等鍵語意 ───────────────────────────────────────────────────────────
//
// ⚠️ 原本這裡測的是應用層 helper `buildRefundEventId(orderId, cumulativeRefund)`。
// 該 helper 已於 2026-07-30 移除：它的 docstring 寫「累積額」，但 route 傳的是
// **本次金額**，兩次等額部分退款因此撞同一把鍵（#1777 F2）。這組測試當時全綠，
// 因為它自己餵的是累積額——從未斷言呼叫端傳了什麼。
//
// 冪等鍵現由 fn_apply_refund_adjustment_atomic 在交易內以累積額推導，呼叫端無從
// 傳錯。鍵語意與呼叫端傳值的守門移至
// tests/api/issue1777-refund-chain-accumulation.test.mjs。

// ── (c) wrapper 契約 ─────────────────────────────────────────────────────────

function rpcClient({ result = null, error = null } = {}) {
  const calls = [];
  return {
    calls,
    from() { throw new Error('adjustment 不得在應用層直接讀寫資料表'); },
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve({ data: result, error });
    },
  };
}

describe('#1777 Phase 3 — applyRefundAdjustmentAtomicDb 契約', () => {
  const row = {
    order_id: 'o-1', guide_id: 'g-1', target_net_twd: 5950, previous_net_twd: 8500,
    delta_twd: -2550, applied: true, carry_forward_twd: 0, balance_after: 5950,
  };

  it('單一 RPC 呼叫，只帶本次退款額（鍵由 DB 端推導）', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcClient({ result: [row] });

    const out = await applyRefundAdjustmentAtomicDb(client, {
      orderId: 'o-1', refundDeltaTwd: 3000, actor: 'refund-execute',
    });

    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].fn, 'fn_apply_refund_adjustment_atomic');
    assert.equal(client.calls[0].args.p_refund_delta_twd, 3000);
    assert.equal(out.delta_twd, -2550);
    assert.equal(out.applied, true);
  });

  it('冪等命中時回 applied:false 且差額為 0', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcClient({ result: [{ ...row, applied: false, delta_twd: 0 }] });
    const out = await applyRefundAdjustmentAtomicDb(client, { orderId: 'o-1', refundDeltaTwd: 0 });
    assert.equal(out.applied, false, '同一累積額狀態不得記第二次差額');
    assert.equal(out.delta_twd, 0);
  });

  it('缺 orderId 直接拒絕', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcClient();
    await assert.rejects(
      () => applyRefundAdjustmentAtomicDb(client, { orderId: '', refundDeltaTwd: 100 }),
      /orderId is required/,
    );
    assert.equal(client.calls.length, 0);
  });

  it('RPC 未部署時 fail-closed', async () => {
    const { applyRefundAdjustmentAtomicDb, RPC_MISSING_CODE } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcClient({ error: { code: 'PGRST202', message: 'Could not find the function' } });
    await assert.rejects(
      () => applyRefundAdjustmentAtomicDb(client, { orderId: 'o-1', refundDeltaTwd: 100 }),
      (err) => err.code === RPC_MISSING_CODE,
    );
  });

  it('已出款而餘額轉負時回報 carry-forward（不靜默歸零）', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcClient({
      result: [{ ...row, target_net_twd: 0, delta_twd: -8500, balance_after: -8500, carry_forward_twd: 8500 }],
    });
    const out = await applyRefundAdjustmentAtomicDb(client, { orderId: 'o-1', refundDeltaTwd: 10000 });
    assert.equal(out.carry_forward_twd, 8500, '已付出去的錢必須留下可追蹤的回收金額');
    assert.ok(out.balance_after < 0, '餘額轉負代表欠款，不得截成 0');
  });
});

// ── (d) 決策 B 的金額模型：四情境收斂到同一最終淨應付 ────────────────────────
//
// oracle 與 migration 內的 SQL 使用同一套規則：
//   effective = max(0, total − 累積退款)；target_net = floor(effective × (1 − rate))
//   本次差額 = target_net − ledger 現有淨額

const RATE = 0.15;
const TOTAL = 10000;

function targetNet(cumulativeRefund) {
  const effective = Math.max(0, TOTAL - cumulativeRefund);
  return Math.floor(effective * (1 - RATE));
}

/** 模擬 ledger：套用一次 adjustment 後回傳新的淨額。 */
function applyAdjustment(ledgerNet, cumulativeRefund, seenEvents, eventId) {
  if (seenEvents.has(eventId)) return ledgerNet; // 冪等
  seenEvents.add(eventId);
  return ledgerNet + (targetNet(cumulativeRefund) - ledgerNet);
}

describe('#1777 Phase 3 — 四情境的最終淨應付一致', () => {
  it('情境 1：結算前退款（sweep 直接按 effective 結算）', () => {
    // 退 3000 後才結算：sweep 以 effective 7000 產生分錄
    const ledger = targetNet(3000);
    assert.equal(ledger, 5950, 'floor(7000 × 0.85)');
  });

  it('情境 2：結算後部分退款 → 剩餘應收按有效金額重算', () => {
    let ledger = targetNet(0); // 已結算 8500
    assert.equal(ledger, 8500);
    ledger = applyAdjustment(ledger, 3000, new Set(), 'o:cum:3000');
    assert.equal(ledger, 5950, '結算後退 3000，最終淨應付必須等於 floor(7000 × 0.85)');
    assert.equal(ledger, targetNet(3000), '與「結算前就退款」得到同一結果');
  });

  it('情境 3：結算後全額退款 → 最終淨應付為 0', () => {
    let ledger = targetNet(0);
    ledger = applyAdjustment(ledger, TOTAL, new Set(), 'o:cum:10000');
    assert.equal(ledger, 0, '全額退款後導遊淨應付必須歸零');
  });

  it('情境 4：退款重送 → 冪等，不重複扣減', () => {
    const seen = new Set();
    let ledger = targetNet(0);
    ledger = applyAdjustment(ledger, 3000, seen, 'o:cum:3000');
    const afterFirst = ledger;
    ledger = applyAdjustment(ledger, 3000, seen, 'o:cum:3000'); // 重送
    assert.equal(ledger, afterFirst, '同一退款事件重送不得再次調整');
    assert.equal(ledger, 5950);
  });

  it('多次部分退款：每次只記差額，最終等於一次退到底', () => {
    const seen = new Set();
    let ledger = targetNet(0);
    ledger = applyAdjustment(ledger, 2000, seen, 'o:cum:2000');
    assert.equal(ledger, targetNet(2000));
    ledger = applyAdjustment(ledger, 5000, seen, 'o:cum:5000');
    assert.equal(ledger, targetNet(5000));
    ledger = applyAdjustment(ledger, 8000, seen, 'o:cum:8000');

    assert.equal(ledger, targetNet(8000), '逐次部分退款的最終淨額');
    assert.equal(ledger, 1700, 'floor(2000 × 0.85)');
    // 與「一次退 8000」比較
    const oneShot = applyAdjustment(targetNet(0), 8000, new Set(), 'x:cum:8000');
    assert.equal(ledger, oneShot, '分次退與一次退必須得到同一最終淨應付');
  });

  it('超額退款不會產生負的目標淨額', () => {
    assert.equal(targetNet(TOTAL + 5000), 0, 'effective 以 0 為下限');
  });
});
