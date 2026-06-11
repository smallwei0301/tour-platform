/**
 * Issue #1360 follow-up — 完整出款鏈路驗證（mock 訂單 → 結算 → 待出款 → admin 確認）
 *
 * 背景：admin 把訂單標成 completed 後，出款管理 (/admin/payouts) 不會立即出現
 * 該筆 — 中間還隔著兩段 internal cron 與三道門檻：
 *   1. settlement sweep：status='completed' 且 start_at <= now - t_days（預設 7 天）
 *      且無 payout hold → 寫入 payout_items、累積 guide_balances
 *   2. generate-payouts：guide_balances.balance_twd >= min_withdrawal_twd（預設 5,000）
 *      → 在 payouts 建 pending 記錄，admin 頁面才看得到
 *   3. admin 確認出款：pending → paid，扣回 guide_balances，寫 audit log
 *
 * 本測試用一筆 mock 訂單（NT$10,000、8 天前出團、completed）走完整條鏈，
 * 出款段直接呼叫真實 production helpers（db.mjs 的 getGuideBalancesAboveThresholdDb /
 * createPayoutDb / confirmPayoutDb、post-trip-eligibility 的 isPayoutOnHold /
 * isCompletionEligible），搭配 in-memory fake Supabase；sweep 段鏡像
 * app/api/internal/settlement/sweep/route.ts 的 eligibility + 金額公式
 * （該 route 為 .ts，node --test 無法直接 import）。
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  getGuideBalancesAboveThresholdDb,
  createPayoutDb,
  confirmPayoutDb,
} from '../../src/lib/db.mjs';
import { isPayoutOnHold, isCompletionEligible } from '../../src/lib/post-trip-eligibility.mjs';

// ── In-memory fake Supabase（支援本鏈路用到的 query 形狀） ────────────────────

function createFakeSupabase(tables) {
  function exec(q) {
    const rows = (tables[q.table] ??= []);

    if (q.op === 'insert') {
      const row = {
        id: q.payload.id ?? `${q.table}-${rows.length + 1}`,
        created_at: new Date().toISOString(),
        ...q.payload,
      };
      rows.push(row);
      return { data: q.single ? row : [row], error: null };
    }

    if (q.op === 'upsert') {
      const key = q.onConflict || 'id';
      const existing = rows.find((r) => r[key] === q.payload[key]);
      if (existing) Object.assign(existing, q.payload);
      else rows.push({ ...q.payload });
      return { data: null, error: null };
    }

    const matched = rows.filter((r) =>
      q.filters.every((f) => (f.type === 'gte' ? r[f.col] >= f.val : r[f.col] === f.val)),
    );

    if (q.op === 'update') {
      for (const r of matched) Object.assign(r, q.payload);
    }

    // 真實 Supabase 回傳的是 JSON 副本，不是 row 的物件參考 —
    // 深拷貝避免後續 update/upsert 汙染呼叫端已取得的資料。
    if (q.single) {
      return matched.length
        ? { data: structuredClone(matched[0]), error: null }
        : { data: null, error: { message: `${q.table}: row not found` } };
    }
    if (q.maybeSingle) return { data: matched[0] ? structuredClone(matched[0]) : null, error: null };
    return { data: structuredClone(matched), error: null };
  }

  return {
    from(table) {
      const q = { table, filters: [], op: 'select', payload: null, single: false, maybeSingle: false, onConflict: null };
      const api = {
        select: () => api,
        insert: (p) => { q.op = 'insert'; q.payload = p; return api; },
        update: (p) => { q.op = 'update'; q.payload = p; return api; },
        upsert: (p, opts) => { q.op = 'upsert'; q.payload = p; q.onConflict = opts?.onConflict ?? null; return api; },
        eq: (col, val) => { q.filters.push({ type: 'eq', col, val }); return api; },
        gte: (col, val) => { q.filters.push({ type: 'gte', col, val }); return api; },
        single: () => { q.single = true; return api; },
        maybeSingle: () => { q.maybeSingle = true; return api; },
        then: (resolve, reject) => Promise.resolve(exec(q)).then(resolve, reject),
      };
      return api;
    },
  };
}

// ── Sweep 鏡像（公式與 hold gate 對齊 sweep route + computeSweepPayoutItem） ──

const CONFIG = { commission_rate: 0.15, t_days: 7, min_withdrawal_twd: 5000, version: 'v1-test' };

function runSettlementSweepMirror(orders, tables, now) {
  tables.payout_items ??= [];
  tables.guide_balances ??= [];
  const cutoffMs = now.getTime() - CONFIG.t_days * 24 * 60 * 60 * 1000;
  const settled = [];

  for (const order of orders) {
    // route eligibility: completed-only + 尚未結算 + start_at <= cutoff
    if (order.status !== 'completed') continue;
    if (tables.payout_items.some((i) => i.order_id === order.id)) continue; // idempotent
    if (!order.start_at || Date.parse(order.start_at) > cutoffMs) continue;

    // computeSweepPayoutItem mirror: effective gmv → hold gate（真實 helper）→ 金額
    const effective = (Number(order.total_twd) || 0) - Number(order.ops?.refund_amount_twd ?? 0);
    if (effective <= 0) continue;
    const hold = isPayoutOnHold({
      refundAmountTwd: 0,
      hasComplaint: order.ops?.has_complaint === true,
      hasOversellIssue: order.ops?.has_oversell_issue === true,
      isDisputed: order.ops?.is_disputed === true,
      isSafetyCase: order.ops?.is_safety_case === true,
    });
    if (hold) continue;

    const item = {
      order_id: order.id,
      guide_id: order.guide_id,
      gmv_twd: effective,
      commission_twd: Math.floor(effective * CONFIG.commission_rate),
      net_twd: Math.floor(effective * (1 - CONFIG.commission_rate)),
      rules_version: CONFIG.version,
      settled_at: now.toISOString(),
    };
    tables.payout_items.push(item);

    const bal = tables.guide_balances.find((b) => b.guide_id === order.guide_id);
    if (bal) bal.balance_twd += item.net_twd;
    else tables.guide_balances.push({ guide_id: order.guide_id, balance_twd: item.net_twd });
    settled.push(item);
  }
  return settled;
}

// ── 鏈路測試 ───────────────────────────────────────────────────────────────────

const GUIDE_ID = 'guide-fullchain-0001';
const NOW = new Date('2026-06-11T10:00:00Z');

describe('出款完整鏈路 — mock 訂單 NT$10,000 從 completed 走到 payout paid', () => {
  const tables = { payouts: [], guide_balances: [], audit_logs: [], payout_items: [] };
  const supabase = createFakeSupabase(tables);

  // mock 訂單：8 天前出團，已被 admin 標記 completed
  const mockOrder = {
    id: 'order-fullchain-0001',
    guide_id: GUIDE_ID,
    total_twd: 10000,
    status: 'completed',
    start_at: '2026-06-03T01:00:00Z', // NOW - 8 天 → 已過 T+7 結算門檻
    end_at: '2026-06-03T09:00:00Z',
    ops: { refund_amount_twd: 0 },
  };

  // 對照組：這些訂單「不該」進結算（解釋為什麼標了 completed 仍看不到出款）
  const controlOrders = [
    { ...mockOrder, id: 'order-too-recent', start_at: '2026-06-09T01:00:00Z' }, // 2 天前 → 未過 T+7
    { ...mockOrder, id: 'order-only-paid', status: 'paid' }, // 未標 completed
    { ...mockOrder, id: 'order-complaint-hold', ops: { refund_amount_twd: 0, has_complaint: true } },
    { ...mockOrder, id: 'order-fully-refunded', ops: { refund_amount_twd: 10000 } },
  ];

  let settled;
  before(() => {
    settled = runSettlementSweepMirror([mockOrder, ...controlOrders], tables, NOW);
  });

  it('前置：completed + 出團已結束 → completion-eligible（真實 helper）', () => {
    assert.equal(
      isCompletionEligible({ orderStatus: 'completed', scheduleEndAt: mockOrder.end_at, now: NOW }),
      true,
    );
  });

  it('Stage 1 — sweep：只有合格的 mock 訂單被結算，四個對照組全部被擋下', () => {
    assert.equal(settled.length, 1);
    assert.equal(settled[0].order_id, mockOrder.id);
    const settledIds = tables.payout_items.map((i) => i.order_id);
    assert.ok(!settledIds.includes('order-too-recent'), '未過 T+7 的 completed 訂單不得結算');
    assert.ok(!settledIds.includes('order-only-paid'), 'paid（未 completed）不得結算');
    assert.ok(!settledIds.includes('order-complaint-hold'), '客訴 hold 不得結算');
    assert.ok(!settledIds.includes('order-fully-refunded'), '全額退款不得結算');
  });

  it('Stage 1 — 金額：NT$10,000 抽成 15% → 平台 1,500、導遊淨額 8,500', () => {
    assert.equal(settled[0].gmv_twd, 10000);
    assert.equal(settled[0].commission_twd, 1500);
    assert.equal(settled[0].net_twd, 8500);
  });

  it('Stage 1 — 導遊待出款餘額成功增加到 NT$8,500', () => {
    const bal = tables.guide_balances.find((b) => b.guide_id === GUIDE_ID);
    assert.equal(bal?.balance_twd, 8500);
  });

  it('Stage 1 — sweep 重跑具冪等性（不會重複結算同一訂單）', () => {
    const again = runSettlementSweepMirror([mockOrder, ...controlOrders], tables, NOW);
    assert.equal(again.length, 0);
    assert.equal(tables.guide_balances.find((b) => b.guide_id === GUIDE_ID)?.balance_twd, 8500);
  });

  it('Stage 2 — generate-payouts：餘額 8,500 >= 門檻 5,000 → 真實 helper 撈得到', async () => {
    // 低於門檻的導遊不應出現
    tables.guide_balances.push({ guide_id: 'guide-below-threshold', balance_twd: 3000 });
    const eligible = await getGuideBalancesAboveThresholdDb(supabase, CONFIG.min_withdrawal_twd);
    assert.deepEqual(
      eligible.map((g) => g.guide_id),
      [GUIDE_ID],
      '只有達到 min_withdrawal_twd 的導遊會產生 payout',
    );
  });

  it('Stage 2 — createPayoutDb（真實 helper）建立 pending payout，重跑被 skip', async () => {
    const created = await createPayoutDb(supabase, GUIDE_ID, 8500);
    assert.equal(created.skipped, false);
    assert.equal(created.state, 'pending');
    assert.equal(created.total_twd, 8500);

    // 冪等：同導遊已有 pending → skip，不會出現第二筆
    const again = await createPayoutDb(supabase, GUIDE_ID, 8500);
    assert.equal(again.skipped, true);
    assert.equal(tables.payouts.filter((p) => p.guide_id === GUIDE_ID).length, 1);
  });

  it('Stage 3 — admin 出款管理列表此時才看得到該筆 pending', () => {
    const pending = tables.payouts.filter((p) => p.state === 'pending');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].guide_id, GUIDE_ID);
    assert.equal(pending[0].total_twd, 8500);
  });

  it('Stage 3 — confirmPayoutDb（真實 helper）：pending → paid、扣回餘額、寫 audit log', async () => {
    const payoutId = tables.payouts[0].id;
    const updated = await confirmPayoutDb(supabase, payoutId, 'admin', 'TRX-FULLCHAIN-001');

    assert.equal(updated.state, 'paid');
    assert.equal(updated.transfer_ref, 'TRX-FULLCHAIN-001');
    assert.equal(updated.confirmed_by, 'admin');
    assert.ok(updated.confirmed_at, 'confirmed_at 必須有值');

    // 導遊餘額 8,500 - 8,500 → 0
    assert.equal(tables.guide_balances.find((b) => b.guide_id === GUIDE_ID)?.balance_twd, 0);

    // audit log
    const audit = tables.audit_logs.find((a) => a.action === 'payout_confirmed');
    assert.ok(audit, '必須寫入 payout_confirmed audit log');
    assert.equal(audit.metadata.before_balance, 8500);
    assert.equal(audit.metadata.after_balance, 0);
    assert.equal(audit.metadata.transfer_ref, 'TRX-FULLCHAIN-001');
  });

  it('Stage 3 — 已 paid 的 payout 不能重複確認（state machine 守住）', async () => {
    const payoutId = tables.payouts[0].id;
    await assert.rejects(
      () => confirmPayoutDb(supabase, payoutId, 'admin', 'TRX-DUP'),
      /already paid/,
    );
  });
});
