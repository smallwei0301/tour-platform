/**
 * Issue #1365 缺口 2 — admin 出款管理手動操作 fallback
 *
 * 在 settlement cron 尚未排程（或排程間隔內）的情況下，admin 必須能在
 * /admin/payouts 完成營運動作：
 *   1. 看見「已結算但尚未產生出款單」的導遊餘額（含未達門檻者）
 *   2. 手動對導遊餘額產生 pending 出款單（冪等：已有 pending → 阻擋）
 *   3. 手動取消 pending 出款單（pending → cancelled，餘額不扣回）
 *   4. 所有手動操作寫 audit log
 *
 * 行為測試直接呼叫真實 db.mjs helpers + fake Supabase；
 * route / page 接線以 source-contract 鎖定。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFakeSupabase } from '../helpers/fake-supabase.mjs';
import {
  listGuideBalancesWithProfilesDb,
  generateManualPayoutDb,
  cancelPayoutDb,
} from '../../src/lib/db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const G1 = 'guide-1365-aaaa'; // 達門檻、無 pending
const G2 = 'guide-1365-bbbb'; // 未達門檻
const G3 = 'guide-1365-cccc'; // 已有 pending payout
const G4 = 'guide-1365-dddd'; // 餘額 0 → 不顯示

function seedTables() {
  return {
    guide_balances: [
      { guide_id: G1, balance_twd: 8500, last_settled_at: '2026-06-10T00:00:00Z', updated_at: '2026-06-10T00:00:00Z' },
      { guide_id: G2, balance_twd: 3000, last_settled_at: '2026-06-09T00:00:00Z', updated_at: '2026-06-09T00:00:00Z' },
      { guide_id: G3, balance_twd: 6000, last_settled_at: '2026-06-08T00:00:00Z', updated_at: '2026-06-08T00:00:00Z' },
      { guide_id: G4, balance_twd: 0, last_settled_at: null, updated_at: '2026-06-01T00:00:00Z' },
    ],
    guide_profiles: [
      { id: G1, display_name: '阿德導遊', guide_email: 'ade@example.test' },
      { id: G2, display_name: '小美導遊', guide_email: 'mei@example.test' },
      { id: G3, display_name: '阿龍導遊', guide_email: 'long@example.test' },
      { id: G4, display_name: '空餘額導遊', guide_email: 'zero@example.test' },
    ],
    payouts: [
      { id: 'payout-g3-pending', guide_id: G3, total_twd: 6000, state: 'pending', confirmed_by: null, confirmed_at: null, transfer_ref: null, notes: null, created_at: '2026-06-08T01:00:00Z' },
    ],
    audit_logs: [],
  };
}

// ── AC1: 導遊餘額清單（含未達門檻） ────────────────────────────────────────────

describe('#1365 AC1 — listGuideBalancesWithProfilesDb', () => {
  it('回傳餘額 > 0 的導遊（含未達門檻），排除餘額 0', async () => {
    const supabase = createFakeSupabase(seedTables());
    const rows = await listGuideBalancesWithProfilesDb(supabase);
    const ids = rows.map((r) => r.guide_id);
    assert.ok(ids.includes(G1), '達門檻導遊必須出現');
    assert.ok(ids.includes(G2), '未達門檻導遊也必須出現（缺口 2 核心需求）');
    assert.ok(ids.includes(G3));
    assert.ok(!ids.includes(G4), '餘額 0 不顯示');
  });

  it('附上 display_name / email / last_settled_at / has_pending_payout', async () => {
    const supabase = createFakeSupabase(seedTables());
    const rows = await listGuideBalancesWithProfilesDb(supabase);
    const g2 = rows.find((r) => r.guide_id === G2);
    assert.equal(g2.display_name, '小美導遊');
    assert.equal(g2.email, 'mei@example.test');
    assert.equal(g2.balance_twd, 3000);
    assert.equal(g2.last_settled_at, '2026-06-09T00:00:00Z');
    assert.equal(g2.has_pending_payout, false);

    const g3 = rows.find((r) => r.guide_id === G3);
    assert.equal(g3.has_pending_payout, true, '已有 pending 的導遊要標記，前端據此擋重複產生');
  });

  it('餘額由大到小排序', async () => {
    const supabase = createFakeSupabase(seedTables());
    const rows = await listGuideBalancesWithProfilesDb(supabase);
    const balances = rows.map((r) => r.balance_twd);
    assert.deepEqual(balances, [...balances].sort((a, b) => b - a));
  });
});

// ── AC2: 手動產生出款單 ───────────────────────────────────────────────────────

describe('#1365 AC2 — generateManualPayoutDb', () => {
  it('對有餘額的導遊建立 pending payout 並寫 audit log', async () => {
    const tables = seedTables();
    const supabase = createFakeSupabase(tables);
    const result = await generateManualPayoutDb(supabase, { guideId: G1, actor: 'admin' });

    assert.equal(result.skipped, false);
    assert.equal(result.state, 'pending');
    assert.equal(result.total_twd, 8500, '出款金額 = 當前導遊餘額');

    const audit = tables.audit_logs.find((a) => a.action === 'payout_manually_generated');
    assert.ok(audit, '手動產生必須寫 audit log');
    assert.equal(audit.actor, 'admin');
    assert.equal(audit.metadata.guide_id, G1);
    assert.equal(audit.metadata.total_twd, 8500);
  });

  it('冪等：導遊已有 pending → skipped，不產生第二筆、不寫 audit', async () => {
    const tables = seedTables();
    const supabase = createFakeSupabase(tables);
    const result = await generateManualPayoutDb(supabase, { guideId: G3, actor: 'admin' });

    assert.equal(result.skipped, true);
    assert.equal(result.id, 'payout-g3-pending', '回傳既有 pending 的 id');
    assert.equal(tables.payouts.filter((p) => p.guide_id === G3).length, 1);
    assert.equal(tables.audit_logs.length, 0, 'skip 不寫 audit log');
  });

  it('未達門檻的導遊也可手動產生（admin 判斷提前出款）', async () => {
    const tables = seedTables();
    const supabase = createFakeSupabase(tables);
    const result = await generateManualPayoutDb(supabase, { guideId: G2, actor: 'admin' });
    assert.equal(result.skipped, false);
    assert.equal(result.total_twd, 3000);
  });

  it('餘額 0 / 無餘額記錄 → 擋下', async () => {
    const supabase = createFakeSupabase(seedTables());
    await assert.rejects(
      () => generateManualPayoutDb(supabase, { guideId: G4, actor: 'admin' }),
      /balance/i,
    );
    await assert.rejects(
      () => generateManualPayoutDb(supabase, { guideId: 'guide-no-row', actor: 'admin' }),
      /balance/i,
    );
  });
});

// ── AC3: 取消 pending 出款單 ──────────────────────────────────────────────────

describe('#1365 AC3 — cancelPayoutDb', () => {
  it('pending → cancelled，餘額不扣回，寫 audit log', async () => {
    const tables = seedTables();
    const supabase = createFakeSupabase(tables);
    const updated = await cancelPayoutDb(supabase, 'payout-g3-pending', 'admin', '導遊要求暫緩');

    assert.equal(updated.state, 'cancelled');
    assert.equal(
      tables.guide_balances.find((b) => b.guide_id === G3).balance_twd,
      6000,
      '取消不得動到導遊餘額',
    );

    const audit = tables.audit_logs.find((a) => a.action === 'payout_cancelled');
    assert.ok(audit, '取消必須寫 audit log');
    assert.equal(audit.metadata.payout_id, 'payout-g3-pending');
    assert.equal(audit.metadata.guide_id, G3);
    assert.equal(audit.metadata.reason, '導遊要求暫緩');
  });

  it('取消後可再手動產生新的出款單（pending 唯一性已釋放）', async () => {
    const tables = seedTables();
    const supabase = createFakeSupabase(tables);
    await cancelPayoutDb(supabase, 'payout-g3-pending', 'admin', null);
    const regenerated = await generateManualPayoutDb(supabase, { guideId: G3, actor: 'admin' });
    assert.equal(regenerated.skipped, false);
    assert.equal(regenerated.total_twd, 6000);
  });

  it('已 paid / 已 cancelled 不能取消', async () => {
    const tables = seedTables();
    tables.payouts.push({ id: 'payout-paid', guide_id: G1, total_twd: 100, state: 'paid' });
    const supabase = createFakeSupabase(tables);

    await assert.rejects(() => cancelPayoutDb(supabase, 'payout-paid', 'admin', null), /already paid/);
    await cancelPayoutDb(supabase, 'payout-g3-pending', 'admin', null);
    await assert.rejects(
      () => cancelPayoutDb(supabase, 'payout-g3-pending', 'admin', null),
      /already cancelled/,
    );
  });

  it('payout 不存在 → not found', async () => {
    const supabase = createFakeSupabase(seedTables());
    await assert.rejects(() => cancelPayoutDb(supabase, 'no-such-payout', 'admin', null), /not found/);
  });
});

// ── Route / page 接線 source-contract ─────────────────────────────────────────

describe('#1365 — route source contracts', () => {
  it('GET /api/admin/payouts/balances：查餘額清單 + 回傳 min_withdrawal 門檻', () => {
    const src = read('app/api/admin/payouts/balances/route.ts');
    assert.match(src, /export\s+async\s+function\s+GET/);
    assert.match(src, /listGuideBalancesWithProfilesDb/);
    assert.match(src, /getSettlementConfig/, '需回傳門檻讓前端標示達標/未達標');
    assert.match(src, /min_withdrawal_twd/);
  });

  it('POST /api/admin/payouts/generate：呼叫 generateManualPayoutDb，skip 回 409', () => {
    const src = read('app/api/admin/payouts/generate/route.ts');
    assert.match(src, /export\s+async\s+function\s+POST/);
    assert.match(src, /generateManualPayoutDb/);
    assert.match(src, /guide_id/);
    assert.match(src, /409/, '已有 pending 必須回 409 讓前端提示');
  });

  it('POST /api/admin/payouts/[payoutId]/cancel：呼叫 cancelPayoutDb', () => {
    const src = read('app/api/admin/payouts/[payoutId]/cancel/route.ts');
    assert.match(src, /export\s+async\s+function\s+POST/);
    assert.match(src, /cancelPayoutDb/);
    assert.match(src, /await\s+params/, 'Next.js 15 params Promise pattern');
  });
});

describe('#1365 — admin payouts page contract', () => {
  it('頁面載入餘額清單並提供手動產生/取消操作（皆帶 CSRF）', () => {
    const src = read('app/admin/payouts/page.tsx');
    // #1649：admin UI 全面改走 /api/v2/admin/**（v2 route re-export legacy handler）
    assert.match(src, /\/api\/v2\/admin\/payouts\/balances/, '頁面必須抓餘額清單');
    assert.match(src, /手動產生出款單/);
    assert.match(src, /\/api\/v2\/admin\/payouts\/generate/);
    assert.match(src, /\/cancel/, '需有取消 pending 的呼叫');
    assert.match(src, /csrfHeaders/);
    assert.match(src, /未達門檻|達門檻/, '需標示門檻狀態');
  });
});
