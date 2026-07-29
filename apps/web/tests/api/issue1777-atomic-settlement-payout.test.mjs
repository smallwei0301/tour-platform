/**
 * Issue #1777 Phase 2 — 結算與確認出款的原子性（owner 決策 C）。
 *
 * 缺口 3（settlement split-brain）：
 *   舊路徑先 upsert payout_items、再由 JS 讀出 guide_balances 加 delta 後整列
 *   寫回。payout item 成功而 balance 失敗時，重跑會因 sweep「已有 payout item
 *   就排除」而永久跳過 → **餘額永久漏加**。
 *
 * 缺口 4（payout confirm 重扣）：
 *   舊路徑「扣餘額 → pending→paid → audit」三次獨立呼叫。扣款成功但 update
 *   失敗時 payout 仍 pending、餘額已扣，重試即**重複扣款**；`Math.max(0, …)`
 *   還把餘額不足靜默截成 0。
 *
 * 本檔以 fault injection 驗證兩件事：
 *   (a) 舊路徑在注入故障時確實留下半套資料（鎖住「為什麼要改」）；
 *   (b) 新路徑把整組寫入交給單一 RPC，故障時不可能只寫一半，且重送冪等。
 *
 * 註：DB 端交易語意由 Postgres 保證，無法在 node --test 內執行 plpgsql；
 * 這裡驗證的是**應用層契約**——新路徑只發出一次 RPC 呼叫、不做任何
 * read-modify-write、RPC 缺席時 fail-closed。plpgsql 本身的交易行為另由
 * migration 契約測試（issue1777-migration-contract）與 staging 驗證覆蓋。
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

// ── mock Supabase client ─────────────────────────────────────────────────────

/**
 * 可注入故障的 PostgREST 風格 mock。
 * @param {{ failOn?: string, rpcResult?: any, rpcError?: any }} opts
 *   failOn — 在哪張表的寫入注入錯誤（模擬中途失敗）
 */
function makeMockClient({ failOn = null, rpcResult = null, rpcError = null } = {}) {
  const calls = { rpc: [], tables: [], writes: [] };
  const state = {
    payout_items: [],
    guide_balances: new Map(),
    payouts: new Map(),
    audit_logs: [],
  };

  function table(name) {
    calls.tables.push(name);
    const api = {
      _filters: {},
      select() { return api; },
      eq(col, val) { api._filters[col] = val; return api; },
      gte() { return api; },
      gt() { return api; },
      in() { return api; },
      order() { return api; },
      limit() { return api; },
      maybeSingle() { return api._resolveRead(); },
      single() { return api._resolveRead(); },
      _resolveRead() {
        if (name === 'guide_balances') {
          const row = state.guide_balances.get(api._filters.guide_id);
          return Promise.resolve({ data: row ? { ...row } : null, error: null });
        }
        if (name === 'payouts') {
          const row = state.payouts.get(api._filters.id);
          return Promise.resolve({ data: row ? { ...row } : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      upsert(rows) {
        calls.writes.push({ table: name, op: 'upsert' });
        if (failOn === name) {
          return Promise.resolve({ data: null, error: { message: `injected failure on ${name}` } });
        }
        const list = Array.isArray(rows) ? rows : [rows];
        if (name === 'payout_items') {
          for (const r of list) {
            const dup = state.payout_items.some(
              (x) => x.order_id === r.order_id && x.settlement_kind === r.settlement_kind,
            );
            if (!dup) state.payout_items.push({ ...r });
          }
        }
        if (name === 'guide_balances') {
          for (const r of list) state.guide_balances.set(r.guide_id, { ...r });
        }
        const chain = Promise.resolve({ data: list, error: null });
        chain.select = () => ({ maybeSingle: () => Promise.resolve({ data: list[0] ?? null, error: null }) });
        return chain;
      },
      update(patch) {
        calls.writes.push({ table: name, op: 'update' });
        const upd = {
          eq(col, val) {
            if (failOn === name) {
              const p = Promise.resolve({ data: null, error: { message: `injected failure on ${name}` } });
              p.select = () => ({ single: () => Promise.resolve({ data: null, error: { message: `injected failure on ${name}` } }) });
              return p;
            }
            if (name === 'payouts') {
              const row = state.payouts.get(val);
              if (row) state.payouts.set(val, { ...row, ...patch });
            }
            const p = Promise.resolve({ data: null, error: null });
            p.select = () => ({ single: () => Promise.resolve({ data: state.payouts.get(val) ?? null, error: null }) });
            return p;
          },
        };
        return upd;
      },
      insert(rows) {
        calls.writes.push({ table: name, op: 'insert' });
        if (failOn === name) {
          return Promise.resolve({ data: null, error: { message: `injected failure on ${name}` } });
        }
        if (name === 'audit_logs') state.audit_logs.push(rows);
        return Promise.resolve({ data: rows, error: null });
      },
    };
    return api;
  }

  return {
    state,
    calls,
    from: table,
    rpc(fn, args) {
      calls.rpc.push({ fn, args });
      if (rpcError) return Promise.resolve({ data: null, error: rpcError });
      return Promise.resolve({ data: rpcResult, error: null });
    },
  };
}

const ITEMS = [
  { order_id: 'o-1', guide_id: 'g-1', gmv_twd: 10000, commission_twd: 1500, net_twd: 8500, rules_version: 'v1' },
];

// ── (a) 舊路徑：注入故障後留下半套資料（鎖住問題本身）────────────────────────

describe('#1777 缺口 3 — 舊 recordSettlementDb 在 balance 失敗時留下半套資料', () => {
  it('payout item 已寫入但 balance 未更新（split-brain）', async () => {
    const { recordSettlementDb } = await import('../../src/lib/db-settlement-ops.mjs');
    const client = makeMockClient({ failOn: 'guide_balances' });

    // 舊路徑直接 `throw balError`（db-settlement-ops.mjs:118），拋出的是
    // PostgREST 的純物件而非 Error 實例——這本身也是既有的錯誤處理債。
    await assert.rejects(
      () => recordSettlementDb(client, ITEMS),
      (err) => {
        assert.equal(err.message, 'injected failure on guide_balances');
        return true;
      },
      '舊路徑會在 balance 步驟拋錯',
    );

    assert.equal(client.state.payout_items.length, 1, 'ledger 分錄已落地');
    assert.equal(client.state.guide_balances.size, 0, '餘額卻沒更新——這就是永久漏加的成因');
  });
});

describe('#1777 缺口 4 — 舊 confirmPayoutDb 在 payout update 失敗時已扣餘額', () => {
  it('餘額被扣但 payout 仍 pending（重試即重複扣款）', async () => {
    const { confirmPayoutDb } = await import('../../src/lib/db-payouts.mjs');
    const client = makeMockClient({ failOn: 'payouts' });
    client.state.payouts.set('p-1', { id: 'p-1', guide_id: 'g-1', total_twd: 5000, state: 'pending' });
    client.state.guide_balances.set('g-1', { guide_id: 'g-1', balance_twd: 8500 });

    await assert.rejects(() => confirmPayoutDb(client, 'p-1', 'admin', 'T-1'));

    assert.equal(client.state.guide_balances.get('g-1').balance_twd, 3500, '餘額已被扣');
    assert.equal(client.state.payouts.get('p-1').state, 'pending', 'payout 卻仍是 pending');
  });

  it('餘額不足時靜默截成 0（差額憑空消失）', async () => {
    const { confirmPayoutDb } = await import('../../src/lib/db-payouts.mjs');
    const client = makeMockClient();
    client.state.payouts.set('p-2', { id: 'p-2', guide_id: 'g-2', total_twd: 9000, state: 'pending' });
    client.state.guide_balances.set('g-2', { guide_id: 'g-2', balance_twd: 1000 });

    await confirmPayoutDb(client, 'p-2', 'admin', null);
    assert.equal(
      client.state.guide_balances.get('g-2').balance_twd,
      0,
      '舊路徑用 Math.max(0, …) 把 8000 的差額吞掉，未拋錯也未告警',
    );
  });
});

// ── (b) 新路徑：單一 RPC、無 read-modify-write、fail-closed ──────────────────

describe('#1777 Phase 2 — recordSettlementAtomicDb 單一交易契約', () => {
  it('只發出一次 RPC，且完全不碰任何資料表', async () => {
    const { recordSettlementAtomicDb } = await import('../../src/lib/db-settlement-atomic.mjs');
    const client = makeMockClient({
      rpcResult: [{ settled_count: 1, skipped_existing: 0, rejected_ineligible: 0, guides_updated: 1, rejected_order_ids: [] }],
    });

    const result = await recordSettlementAtomicDb(client, ITEMS, '2026-07-29T00:00:00.000Z');

    assert.equal(client.calls.rpc.length, 1, '整批寫入必須是單一 RPC 呼叫');
    assert.equal(client.calls.rpc[0].fn, 'fn_record_settlement_atomic');
    assert.deepEqual(client.calls.tables, [], '不得在應用層直接讀寫任何表（read-modify-write 是缺口成因）');
    assert.equal(result.settled_count, 1);
    assert.equal(result.guides_updated, 1);
  });

  it('空清單不呼叫 RPC（no-op）', async () => {
    const { recordSettlementAtomicDb } = await import('../../src/lib/db-settlement-atomic.mjs');
    const client = makeMockClient();
    const result = await recordSettlementAtomicDb(client, []);
    assert.equal(client.calls.rpc.length, 0);
    assert.equal(result.settled_count, 0);
  });

  it('重送回報 skipped_existing 而非重複累加', async () => {
    const { recordSettlementAtomicDb } = await import('../../src/lib/db-settlement-atomic.mjs');
    const client = makeMockClient({
      rpcResult: [{ settled_count: 0, skipped_existing: 1, rejected_ineligible: 0, guides_updated: 0, rejected_order_ids: [] }],
    });
    const result = await recordSettlementAtomicDb(client, ITEMS);
    assert.equal(result.settled_count, 0, '重送不得再次結算');
    assert.equal(result.skipped_existing, 1);
    assert.equal(result.guides_updated, 0, '重送不得再次動餘額');
  });

  it('交易內資格重驗不通過者回報 rejected（爭議訂單不入帳）', async () => {
    const { recordSettlementAtomicDb } = await import('../../src/lib/db-settlement-atomic.mjs');
    const client = makeMockClient({
      rpcResult: [{ settled_count: 0, skipped_existing: 0, rejected_ineligible: 1, guides_updated: 0, rejected_order_ids: ['o-1'] }],
    });
    const result = await recordSettlementAtomicDb(client, ITEMS);
    assert.equal(result.rejected_ineligible, 1);
    assert.deepEqual(result.rejected_order_ids, ['o-1']);
  });

  it('RPC 未部署時 fail-closed（不得退回非原子路徑）', async () => {
    const { recordSettlementAtomicDb, RPC_MISSING_CODE } = await import('../../src/lib/db-settlement-atomic.mjs');
    const client = makeMockClient({ rpcError: { code: 'PGRST202', message: 'Could not find the function' } });

    await assert.rejects(
      () => recordSettlementAtomicDb(client, ITEMS),
      (err) => {
        assert.equal(err.code, RPC_MISSING_CODE, 'migration 未套用必須是可辨識的專屬錯誤');
        return true;
      },
    );
    assert.deepEqual(client.calls.writes, [], 'fail-closed：不得改以直接寫表的方式補救');
  });
});

describe('#1777 Phase 2 — confirmPayoutAtomicDb 單一交易契約', () => {
  const okRow = {
    payout_id: 'p-1', guide_id: 'g-1', total_twd: 5000, state: 'paid',
    confirmed_at: '2026-07-29T00:00:00.000Z', transfer_ref: 'T-1',
    before_balance: 8500, after_balance: 3500, already_paid: false,
  };

  it('只發出一次 RPC，不在應用層讀寫餘額或 payout', async () => {
    const { confirmPayoutAtomicDb } = await import('../../src/lib/db-settlement-atomic.mjs');
    const client = makeMockClient({ rpcResult: [okRow] });

    const result = await confirmPayoutAtomicDb(client, 'p-1', 'admin', 'T-1');

    assert.equal(client.calls.rpc.length, 1);
    assert.equal(client.calls.rpc[0].fn, 'fn_confirm_payout_atomic');
    assert.deepEqual(client.calls.tables, [], '扣款、狀態轉移、audit 都必須在 DB 交易內完成');
    assert.equal(result.after_balance, 3500);
    assert.equal(result.already_paid, false);
  });

  it('重送同一 payout 回 already_paid 且餘額不變（不重扣）', async () => {
    const { confirmPayoutAtomicDb } = await import('../../src/lib/db-settlement-atomic.mjs');
    const client = makeMockClient({
      rpcResult: [{ ...okRow, already_paid: true, before_balance: 3500, after_balance: 3500 }],
    });

    const result = await confirmPayoutAtomicDb(client, 'p-1', 'admin', 'T-1');
    assert.equal(result.already_paid, true);
    assert.equal(result.before_balance, result.after_balance, '重送不得再次扣減餘額');
  });

  it('餘額不足時錯誤往上拋，不得被截斷或吞掉', async () => {
    const { confirmPayoutAtomicDb } = await import('../../src/lib/db-settlement-atomic.mjs');
    const client = makeMockClient({
      rpcError: { code: '22000', message: 'insufficient guide balance: have 1000, need 9000' },
    });

    await assert.rejects(
      () => confirmPayoutAtomicDb(client, 'p-2', 'admin', null),
      /insufficient guide balance/,
      '餘額不足是帳務異常，必須擋下讓人工處理',
    );
  });

  it('payoutId 缺漏直接拒絕', async () => {
    const { confirmPayoutAtomicDb } = await import('../../src/lib/db-settlement-atomic.mjs');
    const client = makeMockClient();
    await assert.rejects(() => confirmPayoutAtomicDb(client, '', 'admin', null), /payoutId is required/);
    assert.equal(client.calls.rpc.length, 0);
  });

  it('RPC 未部署時 fail-closed', async () => {
    const { confirmPayoutAtomicDb, RPC_MISSING_CODE } = await import('../../src/lib/db-settlement-atomic.mjs');
    const client = makeMockClient({ rpcError: { code: 'PGRST202', message: 'Could not find the function' } });
    await assert.rejects(
      () => confirmPayoutAtomicDb(client, 'p-1', 'admin', null),
      (err) => err.code === RPC_MISSING_CODE,
    );
  });
});
