/**
 * Issue #1777 退款鏈修復 — 累積退款額與冪等鍵。
 *
 * 收尾稽核（2026-07-30）在**呼叫端**抓到兩個 P0。兩者都躲過了原本的測試，原因
 * 值得記下來：Phase 3 的測試只驗了 helper 在「餵累積額」時的行為，從未斷言
 * route 真正傳了什麼；而 route 是 .ts、測試是 Node 內建 runner 的 .mjs（無 TS
 * loader），只能寫 source-string 測試——字串都在，傳的值錯。
 *
 *   F1  operations_tracking.refund_amount_twd 被**覆寫**而非累加。
 *       NT$2,000 訂單先退 500 再退 500 → 欄位停在 500 → effective GMV 多算 500
 *       → 導遊多領 floor(500 × 0.85) = 425。
 *   F2  冪等鍵以「本次金額」組成 → 兩次等額部分退款撞同一把鍵 → 第二次差額被
 *       ON CONFLICT DO NOTHING 吃掉 → 導遊淨應付偏高。
 *
 * 修法：把累積與鍵的推導搬進 fn_apply_refund_adjustment_atomic 的交易內，
 * 呼叫端只說「本次退了多少」。決策邏輯搬到 refund-payout-sync.mjs 之後，
 * 可以用**行為測試**（斷言實際傳給 RPC 的參數）而不只是字串比對。
 *
 * NOT_AUTOMATABLE-env：累積本身在 plpgsql 內（需 Postgres）。本檔以一份與
 * migration 同規則的 oracle 模擬 RPC，鎖住**模型**與**呼叫端傳值**；SQL 的關鍵
 * 屬性由 issue1777-migration-contract 鎖住；端到端由 production/staging 實跑驗證。
 *
 * Run: node --test apps/web/tests/api/issue1777-refund-chain-accumulation.test.mjs
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
/**
 * 剝掉註解後才做字串守門。
 *
 * 教訓：route 的說明註解本身就引用了「錯誤寫法」當反例
 * （`.update({ refund_amount_twd: 本次金額 })` 是覆寫而非累加），不剝註解的話
 * 守門會咬到自己的說明文字——與 #1777 migration 契約測試踩到的是同一個坑，只是
 * 方向相反（那次是假綠，這次是假紅）。
 *
 * 已知限制：不解析字串字面值，故字串內的 `//` 也會被剝掉。本檔斷言的字串
 * （incident 訊息）不含 `//`，這個取捨可接受。
 */
function tsCode(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const routeSrc = tsCode(readFileSync(
  join(repoRoot, 'app/api/v2/admin/orders/[orderId]/refund-execute/route.ts'),
  'utf8',
));

// ── 剩餘可退把關（純函式）───────────────────────────────────────────────────

describe('#1777 — checkRefundWithinRemaining', () => {
  it('首次退款：剩餘＝訂單總額', async () => {
    const { checkRefundWithinRemaining } = await import('../../src/lib/settlement/refund-payout-sync.mjs');
    const out = checkRefundWithinRemaining({ totalTwd: 1000, cumulativeRefundTwd: 0, refundAmountTwd: 1000 });
    assert.equal(out.ok, true);
    assert.equal(out.remainingTwd, 1000);
  });

  it('第二次部分退款只能退剩下的部分', async () => {
    const { checkRefundWithinRemaining } = await import('../../src/lib/settlement/refund-payout-sync.mjs');
    const out = checkRefundWithinRemaining({ totalTwd: 1000, cumulativeRefundTwd: 800, refundAmountTwd: 200 });
    assert.equal(out.ok, true);
    assert.equal(out.remainingTwd, 200);
  });

  it('超過剩餘可退直接擋掉（舊驗證只比 total，連退兩次 800 都會過）', async () => {
    const { checkRefundWithinRemaining } = await import('../../src/lib/settlement/refund-payout-sync.mjs');
    const out = checkRefundWithinRemaining({ totalTwd: 1000, cumulativeRefundTwd: 800, refundAmountTwd: 800 });
    assert.equal(out.ok, false, '800 + 800 > 1000，必須擋在呼叫 provider 之前');
    assert.equal(out.remainingTwd, 200);
    assert.match(out.reason, /exceeds remaining refundable 200/);
  });

  it('已全額退款後剩餘為 0', async () => {
    const { checkRefundWithinRemaining } = await import('../../src/lib/settlement/refund-payout-sync.mjs');
    const out = checkRefundWithinRemaining({ totalTwd: 1000, cumulativeRefundTwd: 1000, refundAmountTwd: 1 });
    assert.equal(out.ok, false);
    assert.equal(out.remainingTwd, 0);
  });

  it('非正數金額不算通過', async () => {
    const { checkRefundWithinRemaining } = await import('../../src/lib/settlement/refund-payout-sync.mjs');
    assert.equal(checkRefundWithinRemaining({ totalTwd: 1000, cumulativeRefundTwd: 0, refundAmountTwd: 0 }).ok, false);
  });
});

// ── 累積額讀取 ──────────────────────────────────────────────────────────────

describe('#1777 — readCumulativeRefundTwd', () => {
  function opsClient({ row = null, error = null } = {}) {
    return {
      from(table) {
        assert.equal(table, 'operations_tracking');
        const api = {
          select() { return api; },
          eq() { return api; },
          maybeSingle: () => Promise.resolve({ data: row, error }),
        };
        return api;
      },
    };
  }

  it('無 ops 追蹤列視為 0', async () => {
    const { readCumulativeRefundTwd } = await import('../../src/lib/settlement/refund-payout-sync.mjs');
    const out = await readCumulativeRefundTwd(opsClient(), 'o-1');
    assert.equal(out.ok, true);
    assert.equal(out.cumulativeRefundTwd, 0);
  });

  it('讀回累積退款額', async () => {
    const { readCumulativeRefundTwd } = await import('../../src/lib/settlement/refund-payout-sync.mjs');
    const out = await readCumulativeRefundTwd(opsClient({ row: { refund_amount_twd: 800 } }), 'o-1');
    assert.equal(out.cumulativeRefundTwd, 800);
  });

  it('讀取失敗回 ok:false（呼叫端據此決定放行或擋下）', async () => {
    const { readCumulativeRefundTwd } = await import('../../src/lib/settlement/refund-payout-sync.mjs');
    const out = await readCumulativeRefundTwd(opsClient({ error: { message: 'boom' } }), 'o-1');
    assert.equal(out.ok, false);
    assert.equal(out.cumulativeRefundTwd, 0);
  });
});

// ── 呼叫端傳值：F2 的真正修法 ────────────────────────────────────────────────
//
// 這組是原本缺的那一塊：斷言**實際傳給 RPC 的參數**，而不是 helper 在理想輸入
// 下的行為。

describe('#1777 F2 — 呼叫端只傳本次金額，鍵由 DB 端推導', () => {
  function rpcSpy(result) {
    const calls = [];
    return {
      calls,
      from() { throw new Error('accumulation 不得在應用層讀寫 operations_tracking'); },
      rpc(fn, args) {
        calls.push({ fn, args });
        return Promise.resolve({ data: result, error: null });
      },
    };
  }

  const okRow = {
    order_id: 'o-1', guide_id: 'g-1', refund_event_id: 'cum:500',
    cumulative_refund_twd: 500, target_net_twd: 1275, previous_net_twd: 1700,
    delta_twd: -425, applied: true, settled: true, carry_forward_twd: 0, balance_after: 1275,
    over_refund: false,
  };

  it('傳 p_refund_delta_twd（本次金額），不傳任何應用層組出的冪等鍵', async () => {
    const { syncRefundToPayoutLedger } = await import('../../src/lib/settlement/refund-payout-sync.mjs');
    const client = rpcSpy(okRow);

    await syncRefundToPayoutLedger(client, { orderId: 'o-1', refundDeltaTwd: 500, actor: 'refund-execute' });

    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].fn, 'fn_apply_refund_adjustment_atomic');
    assert.deepEqual(client.calls[0].args, {
      p_order_id: 'o-1',
      p_refund_delta_twd: 500,
      p_actor: 'refund-execute',
    });
    assert.ok(
      !('p_refund_event_id' in client.calls[0].args),
      '冪等鍵不得由應用層提供——那是 F2 的成因（本次金額組鍵會撞鍵）',
    );
  });

  it('負的 delta 直接拒絕（累積額必須單調遞增，否則鍵會重複）', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcSpy(okRow);
    await assert.rejects(
      () => applyRefundAdjustmentAtomicDb(client, { orderId: 'o-1', refundDeltaTwd: -100 }),
      /non-negative integer/,
    );
    assert.equal(client.calls.length, 0, '不合法的值不得送到 DB');
  });

  it('非整數 delta 直接拒絕', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    await assert.rejects(
      () => applyRefundAdjustmentAtomicDb(rpcSpy(okRow), { orderId: 'o-1', refundDeltaTwd: 12.5 }),
      /non-negative integer/,
    );
  });

  it('delta=0 允許（只對帳、不累加，可安全重跑修復）', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcSpy({ ...okRow, delta_twd: 0, applied: false });
    const out = await applyRefundAdjustmentAtomicDb(client, { orderId: 'o-1', refundDeltaTwd: 0 });
    assert.equal(client.calls[0].args.p_refund_delta_twd, 0);
    assert.equal(out.applied, false);
  });

  it('尚未結算的訂單回 settled:false，但累積額已記錄（供 sweep 用）', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const out = await applyRefundAdjustmentAtomicDb(
      rpcSpy({ ...okRow, guide_id: null, settled: false, applied: false, delta_twd: 0, cumulative_refund_twd: 500 }),
      { orderId: 'o-1', refundDeltaTwd: 500 },
    );
    assert.equal(out.settled, false);
    assert.equal(out.cumulative_refund_twd, 500, '未結算也必須記下累積額，否則 sweep 的 effective GMV 會算錯');
  });

  it('超額退款以旗標回報，不靜默通過', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const out = await applyRefundAdjustmentAtomicDb(
      rpcSpy({ ...okRow, over_refund: true, cumulative_refund_twd: 2500 }),
      { orderId: 'o-1', refundDeltaTwd: 500 },
    );
    assert.equal(out.over_refund, true);
  });
});

// ── F1／F2：兩次等額部分退款的端到端模型 ────────────────────────────────────
//
// oracle 與 20260730093000 的 plpgsql 同規則：
//   累積額 += delta；eventId = 'cum:' + 累積額
//   target = floor(max(0, total − 累積額) × (1 − rate))；差額 = target − ledger 現值
//   同 eventId 重放 → 不記帳

const TOTAL = 2000;
const RATE = 0.15;

/** 新行為：累積由 DB 端在交易內完成，鍵由累積額推導。 */
function makeFixedRpcWorld(initialLedgerNet) {
  return {
    cumulative: 0,
    ledgerNet: initialLedgerNet,
    events: [],
    apply(delta) {
      this.cumulative += delta;
      const eventId = `cum:${this.cumulative}`;
      if (this.events.includes(eventId)) return { eventId, applied: false, delta: 0 };
      const target = Math.floor(Math.max(0, TOTAL - this.cumulative) * (1 - RATE));
      const ledgerDelta = target - this.ledgerNet;
      if (ledgerDelta === 0) return { eventId, applied: false, delta: 0 };
      this.events.push(eventId);
      this.ledgerNet = target;
      return { eventId, applied: true, delta: ledgerDelta };
    },
  };
}

/** 舊行為（修復前）：應用層覆寫累積額、以本次金額組鍵。 */
function makeBrokenAppWorld(initialLedgerNet) {
  return {
    cumulative: 0,
    ledgerNet: initialLedgerNet,
    events: [],
    apply(amount) {
      this.cumulative = amount; // ← F1：覆寫
      const eventId = `o-1:cum:${amount}`; // ← F2：鍵用本次金額
      if (this.events.includes(eventId)) return { eventId, applied: false, delta: 0 };
      const target = Math.floor(Math.max(0, TOTAL - this.cumulative) * (1 - RATE));
      const ledgerDelta = target - this.ledgerNet;
      if (ledgerDelta === 0) return { eventId, applied: false, delta: 0 };
      this.events.push(eventId);
      this.ledgerNet = target;
      return { eventId, applied: true, delta: ledgerDelta };
    },
  };
}

const settledNet = Math.floor(TOTAL * (1 - RATE)); // 1700

describe('#1777 F1／F2 — 兩次等額部分退款（500 + 500）', () => {
  it('修復前：累積額停在 500、第二次撞鍵 → 導遊多領 425', () => {
    const w = makeBrokenAppWorld(settledNet);
    const first = w.apply(500);
    const second = w.apply(500);

    assert.equal(w.cumulative, 500, '覆寫後累積額只剩最後一次的金額（實際已退 1000）');
    assert.equal(first.eventId, second.eventId, '兩次等額退款算出同一把鍵');
    assert.equal(second.applied, false, '第二次差額被冪等吃掉');
    assert.equal(w.ledgerNet, 1275, 'ledger 停在 floor(1500 × 0.85)');
    assert.equal(
      w.ledgerNet - Math.floor((TOTAL - 1000) * (1 - RATE)),
      425,
      '正確值應是 floor(1000 × 0.85)=850；差額 425 就是導遊被多撥的金額',
    );
  });

  it('修復後：累積額 1000、兩把不同鍵、ledger 收斂到 850', () => {
    const w = makeFixedRpcWorld(settledNet);
    const first = w.apply(500);
    const second = w.apply(500);

    assert.equal(w.cumulative, 1000, '累積額必須是兩次之和');
    assert.notEqual(first.eventId, second.eventId, '累積額不同 ⇒ 鍵不同 ⇒ 各記一筆差額');
    assert.equal(first.applied, true);
    assert.equal(second.applied, true);
    assert.equal(w.ledgerNet, 850, 'floor((2000 − 1000) × 0.85)');
    assert.equal(first.delta + second.delta, 850 - settledNet, '兩筆差額之和等於總調整量');
  });

  it('修復後：分三次退（300/300/400）與一次退 1000 得到同一最終淨額', () => {
    const stepwise = makeFixedRpcWorld(settledNet);
    stepwise.apply(300);
    stepwise.apply(300);
    stepwise.apply(400);

    const oneShot = makeFixedRpcWorld(settledNet);
    oneShot.apply(1000);

    assert.equal(stepwise.cumulative, 1000);
    assert.equal(stepwise.ledgerNet, oneShot.ledgerNet, '分次退與一次退必須收斂到同一最終淨應付');
    assert.equal(stepwise.ledgerNet, 850);
  });

  it('修復後：全額退款 → 最終淨應付歸 0', () => {
    const w = makeFixedRpcWorld(settledNet);
    w.apply(TOTAL);
    assert.equal(w.ledgerNet, 0);
  });
});

// ── route 線路 ──────────────────────────────────────────────────────────────

describe('#1777 — route 不再自行維護累積退款額', () => {
  it('route 不得直接寫 refund_amount_twd（那是 F1 的成因）', () => {
    assert.doesNotMatch(
      routeSrc,
      /\.update\(\s*\{[^}]*refund_amount_twd/,
      'route 不得以 update 覆寫 refund_amount_twd——累加必須在 RPC 交易內',
    );
    assert.doesNotMatch(
      routeSrc,
      /\.insert\(\s*\{[^}]*refund_amount_twd/,
      'route 不得直接 insert refund_amount_twd',
    );
  });

  it('route 不得自行組冪等鍵', () => {
    assert.doesNotMatch(routeSrc, /buildRefundEventId/, '冪等鍵已改由 DB 端推導');
    assert.doesNotMatch(routeSrc, /p_refund_event_id/, 'route 不得傳入冪等鍵');
  });

  it('route 委派給 syncRefundToPayoutLedger，並傳本次金額', () => {
    assert.match(routeSrc, /syncRefundToPayoutLedger/);
    assert.match(routeSrc, /refundDeltaTwd/, '傳的是本次退款額（delta），不是累積額');
  });

  it('route 在呼叫 provider 之前把關剩餘可退', () => {
    assert.match(routeSrc, /checkRefundWithinRemaining/);
    assert.match(routeSrc, /REFUND_EXCEEDS_REMAINING_CODE/);

    // 把關必須排在 executeRefund／executeEcpayReversal 之前，否則錢已經出去了。
    const guardAt = routeSrc.indexOf('checkRefundWithinRemaining(');
    const reversalAt = routeSrc.indexOf('await executeEcpayReversal(');
    assert.ok(guardAt > 0 && reversalAt > 0, '兩處都應存在');
    assert.ok(guardAt < reversalAt, '剩餘可退把關必須在呼叫 provider 之前');
  });

  it('同步失敗時的 incident 誠實說明「兩者皆未寫入」', () => {
    // 累積額與 ledger 在同一交易，失敗代表 refund_amount_twd 也沒寫進去——
    // 訊息若只說 ledger 過時，值班人員會漏掉必須補登累積額這件事。
    assert.match(
      routeSrc,
      /refund_amount_twd accumulation and payout ledger adjustment both failed/,
      'incident 訊息必須說明兩者同交易、同時失敗',
    );
    assert.match(routeSrc, /manual backfill required/);
  });
});
