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
 *   (a) 舊 recordRefundReversalDb 的確是全額紅沖（鎖住問題）
 *   (b) 冪等鍵語意：同次退款重送同鍵、二次部分退款得新鍵
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

// ── (a) 舊路徑：整筆全額紅沖 ─────────────────────────────────────────────────

describe('#1777 缺口 2 — 舊紅沖路徑不看本次退款金額', () => {
  it('部分退款也把整筆 settlement 全額反轉', async () => {
    const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');

    const settlement = {
      id: 'pi-1', order_id: 'o-1', guide_id: 'g-1',
      gmv_twd: 10000, commission_twd: 1500, net_twd: 8500,
      rules_version: 'v1', settlement_kind: 'settlement',
    };
    const inserted = [];

    const client = {
      from(table) {
        const api = {
          _f: {},
          select() { return api; },
          eq(k, v) { api._f[k] = v; return api; },
          maybeSingle() {
            if (table === 'payout_items' && api._f.settlement_kind === 'settlement') {
              return Promise.resolve({ data: settlement, error: null });
            }
            if (table === 'guide_balances') {
              return Promise.resolve({ data: { balance_twd: 8500 }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          upsert(row) {
            if (table === 'payout_items') inserted.push(row);
            const chain = Promise.resolve({ data: row, error: null });
            chain.select = () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'pi-rev' }, error: null }) });
            return chain;
          },
          insert(row) { return Promise.resolve({ data: row, error: null }); },
        };
        return api;
      },
    };

    await recordRefundReversalDb(client, { orderId: 'o-1', actor: 'test' });

    assert.equal(inserted.length, 1, '舊路徑會插入一筆 reversal');
    assert.equal(
      inserted[0].net_twd,
      -8500,
      '不論本次只退多少，一律以原 settlement 的完整 net 反轉——這就是剩餘應收被歸零的原因',
    );
  });
});

// ── (b) 冪等鍵語意 ───────────────────────────────────────────────────────────

describe('#1777 Phase 3 — 退款事件冪等鍵', () => {
  it('同一次退款重送得到相同鍵（不重複記帳）', async () => {
    const { buildRefundEventId } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    assert.equal(buildRefundEventId('o-1', 3000), buildRefundEventId('o-1', 3000));
  });

  it('第二次部分退款因累積額不同而得到新鍵（各記一次差額）', async () => {
    const { buildRefundEventId } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    assert.notEqual(
      buildRefundEventId('o-1', 3000),
      buildRefundEventId('o-1', 5000),
      '累積退款額不同必須是不同事件，否則第二次部分退款會被冪等吃掉',
    );
  });

  it('不同訂單不共用鍵', async () => {
    const { buildRefundEventId } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    assert.notEqual(buildRefundEventId('o-1', 3000), buildRefundEventId('o-2', 3000));
  });
});

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

  it('單一 RPC 呼叫，帶上冪等鍵', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcClient({ result: [row] });

    const out = await applyRefundAdjustmentAtomicDb(client, {
      orderId: 'o-1', refundEventId: 'o-1:cum:3000', actor: 'refund-execute',
    });

    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].fn, 'fn_apply_refund_adjustment_atomic');
    assert.equal(client.calls[0].args.p_refund_event_id, 'o-1:cum:3000');
    assert.equal(out.delta_twd, -2550);
    assert.equal(out.applied, true);
  });

  it('重送同一事件回 applied:false 且差額為 0', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcClient({ result: [{ ...row, applied: false, delta_twd: 0 }] });
    const out = await applyRefundAdjustmentAtomicDb(client, { orderId: 'o-1', refundEventId: 'o-1:cum:3000' });
    assert.equal(out.applied, false, '同一退款事件不得記第二次差額');
    assert.equal(out.delta_twd, 0);
  });

  it('缺冪等鍵直接拒絕（避免無鍵寫入導致重複記帳）', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcClient();
    await assert.rejects(
      () => applyRefundAdjustmentAtomicDb(client, { orderId: 'o-1', refundEventId: '' }),
      /refundEventId is required/,
    );
    assert.equal(client.calls.length, 0);
  });

  it('RPC 未部署時 fail-closed', async () => {
    const { applyRefundAdjustmentAtomicDb, RPC_MISSING_CODE } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcClient({ error: { code: 'PGRST202', message: 'Could not find the function' } });
    await assert.rejects(
      () => applyRefundAdjustmentAtomicDb(client, { orderId: 'o-1', refundEventId: 'k' }),
      (err) => err.code === RPC_MISSING_CODE,
    );
  });

  it('已出款而餘額轉負時回報 carry-forward（不靜默歸零）', async () => {
    const { applyRefundAdjustmentAtomicDb } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    const client = rpcClient({
      result: [{ ...row, target_net_twd: 0, delta_twd: -8500, balance_after: -8500, carry_forward_twd: 8500 }],
    });
    const out = await applyRefundAdjustmentAtomicDb(client, { orderId: 'o-1', refundEventId: 'o-1:cum:10000' });
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
