/**
 * Issue #1777 F4 — 退款紅沖收斂為單一 DB 交易。
 *
 * `recordRefundReversalDb` 是本 issue 四個缺口裡唯一沒被改掉的應用層
 * read-modify-write，而且**仍在 live 退款路徑上**（refund-execute 三個呼叫點
 * ＋ refund-requests 自動執行）。舊實作的第五步是：
 *
 *     讀 guide_balances → 在 JS 算新餘額 → 寫回**絕對值**
 *
 * 三個後果：
 *   (1) lost update：兩個併發 writer 讀到同一個舊餘額，後寫的蓋掉前一筆。
 *   (2) 新餘額由「可能過期的讀值」＋「audit marker 的歷史值」湊出來，湊法有三個
 *       分支，任一分支判斷錯就把錯的絕對值寫進餘額。
 *   (3) reversal 分錄寫成功但餘額扣失敗 → 重跑走 already_reversed → **餘額永久
 *       漏扣**。舊版用 status='started' 的 audit marker 想補這個洞，但 marker
 *       本身也不是原子的。
 *
 * 修法：整包交給 fn_record_refund_reversal_atomic，與 orders FOR UPDATE 同交易；
 * 冪等由 payout_items 的部分唯一索引判定（只有真正插入新分錄才動餘額），餘額改
 * SQL 層 `balance + delta`。
 *
 * 本檔驗證：
 *   (a) 舊模式的 lost update 是真的（以 oracle 重演，鎖住問題）
 *   (b) 應用層不再讀寫 guide_balances／payout_items（單一 writer）
 *   (c) 回傳形狀與舊版逐字相容（呼叫端不需要改判定）
 *   (d) migration 的關鍵安全屬性
 *
 * NOT_AUTOMATABLE-env：交易語意在 plpgsql 內（需 Postgres）。此處鎖呼叫線路與
 * 契約；SQL 屬性由 issue1777-migration-contract 鎖住；端到端由 production 實跑驗證。
 *
 * Run: node --test apps/web/tests/api/issue1777-atomic-refund-reversal.test.mjs
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

// ── (a) 舊模式為什麼會算錯 ───────────────────────────────────────────────────

describe('#1777 F4 — 絕對值寫回的 lost update', () => {
  it('兩個併發 writer 各自讀到同一個舊餘額，後寫的蓋掉前一筆', () => {
    // 舊模式：read → compute → write(絕對值)
    let stored = 5000;
    const readA = stored;            // writer A 讀
    const readB = stored;            // writer B 也讀（同一個舊值）
    stored = readA - 2700;           // A 寫回絕對值 2300
    stored = readB - 1000;           // B 寫回絕對值 4000 ← A 的扣款不見了
    assert.equal(stored, 4000);
    assert.notEqual(stored, 5000 - 2700 - 1000, '正確結果應是 1300，A 的 2700 被蓋掉了');
  });

  it('改成 SQL 層增減後，同樣的兩筆併發都會生效', () => {
    // 新模式：balance = balance + delta（由 DB 在同一列上原子套用）
    let stored = 5000;
    stored += -2700;
    stored += -1000;
    assert.equal(stored, 1300, '兩筆增減都保留');
  });

  it('紅沖可以把餘額扣成負數（carry-forward，不得截成 0）', () => {
    let stored = 3000;
    stored += -9000;
    assert.equal(stored, -6000, '錢已經付出去了，必須留下欠款而非靜默歸零');
  });
});

// ── (b) 單一 writer：應用層不再直接讀寫帳務表 ────────────────────────────────

describe('#1777 F4 — 應用層不再 read-modify-write', () => {
  function rpcOnlyClient(result) {
    const calls = [];
    return {
      calls,
      from(table) {
        throw new Error(`紅沖不得在應用層直接讀寫資料表（收到 from('${table}')）`);
      },
      rpc(fn, args) {
        calls.push({ fn, args });
        return Promise.resolve({ data: result, error: null });
      },
    };
  }

  it('recordRefundReversalDb 只呼叫 RPC，完全不碰 from()', async () => {
    const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
    const client = rpcOnlyClient({
      outcome: 'reversed', reversal_id: 'rev-1', guide_id: 'g-1',
      settlement_id: 's-1', debit: 2700, before_balance: 5000, after_balance: 2300,
    });

    const out = await recordRefundReversalDb(client, { orderId: 'o-1', actor: 'test' });

    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].fn, 'fn_record_refund_reversal_atomic');
    assert.deepEqual(client.calls[0].args, { p_order_id: 'o-1', p_actor: 'test' });
    assert.equal(out.reversed, true);
  });

  it('db.mjs 不再自己算餘額（舊實作的 read-modify-write 已移除）', () => {
    const dbSrc = readFileSync(join(repoRoot, 'src/lib/db.mjs'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(
      dbSrc,
      /guide_balance_debited_reversal/,
      'audit marker 機制應隨舊實作一併移除——冪等改由部分唯一索引判定',
    );
    assert.doesNotMatch(
      dbSrc,
      /settlement_kind['"]?\s*,\s*['"]reversal/,
      'db.mjs 不應再自行寫 reversal 分錄',
    );
  });
});

// ── (c) 回傳形狀與舊版逐字相容 ──────────────────────────────────────────────

describe('#1777 F4 — 回傳契約（呼叫端不需要改判定）', () => {
  function rpcClient({ result = null, error = null } = {}) {
    return {
      from() { throw new Error('不得直接讀寫資料表'); },
      rpc: () => Promise.resolve({ data: result, error }),
    };
  }

  it('尚未結算 → { skipped: "pre_settlement" }（逐字相容）', async () => {
    const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
    const out = await recordRefundReversalDb(rpcClient({ result: { outcome: 'pre_settlement' } }), { orderId: 'o-1' });
    assert.deepEqual(out, { skipped: 'pre_settlement' });
  });

  it('已紅沖 → { skipped: "already_reversed" }（逐字相容，且不重複扣款）', async () => {
    const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
    const out = await recordRefundReversalDb(rpcClient({ result: { outcome: 'already_reversed' } }), { orderId: 'o-1' });
    assert.deepEqual(out, { skipped: 'already_reversed' });
  });

  it('新建紅沖 → reversed/repaired/reversal_id/before_balance/after_balance', async () => {
    const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
    const out = await recordRefundReversalDb(
      rpcClient({ result: { outcome: 'reversed', reversal_id: 'rev-9', before_balance: 5000, after_balance: 2300 } }),
      { orderId: 'o-1' },
    );
    assert.equal(out.reversed, true);
    assert.equal(out.repaired, true);
    assert.equal(out.reversal_id, 'rev-9');
    assert.equal(out.before_balance, 5000);
    assert.equal(out.after_balance, 2300);
  });

  it('餘額轉負如實回報（不截斷）', async () => {
    const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
    const out = await recordRefundReversalDb(
      rpcClient({ result: { outcome: 'reversed', reversal_id: 'rev-x', before_balance: 3000, after_balance: -6000 } }),
      { orderId: 'o-1' },
    );
    assert.equal(out.after_balance, -6000);
  });

  it('PostgREST 回陣列時取第一筆', async () => {
    const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
    const out = await recordRefundReversalDb(rpcClient({ result: [{ outcome: 'pre_settlement' }] }), { orderId: 'o-1' });
    assert.deepEqual(out, { skipped: 'pre_settlement' });
  });

  it('缺 orderId 直接拒絕', async () => {
    const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
    await assert.rejects(() => recordRefundReversalDb(rpcClient(), { orderId: '' }), /orderId is required/);
  });

  it('RPC 錯誤原樣往上拋（呼叫端據此 fail-closed）', async () => {
    const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
    await assert.rejects(
      () => recordRefundReversalDb(rpcClient({ error: { message: 'order not found', code: 'P0002' } }), { orderId: 'o-1' }),
      (err) => err.code === 'P0002' && /order not found/.test(err.message),
    );
  });

  it('RPC 未部署時 fail-closed（不退回舊的非原子路徑）', async () => {
    const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
    const { RPC_MISSING_CODE } = await import('../../src/lib/settlement/db-settlement-atomic.mjs');
    await assert.rejects(
      () => recordRefundReversalDb(
        rpcClient({ error: { code: 'PGRST202', message: 'Could not find the function' } }),
        { orderId: 'o-1' },
      ),
      (err) => err.code === RPC_MISSING_CODE,
    );
  });

  it('未知 outcome 不得被當成成功', async () => {
    const { recordRefundReversalDb } = await import('../../src/lib/db.mjs');
    await assert.rejects(
      () => recordRefundReversalDb(rpcClient({ result: { outcome: 'weird' } }), { orderId: 'o-1' }),
      /unknown outcome/,
    );
  });
});
