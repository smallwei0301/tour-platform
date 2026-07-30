#!/usr/bin/env node
/**
 * #1777 Phase 4 — 財務對帳 read-only preview（含 #1647 歷史資料三項）。
 *
 * ⚠️ 本腳本**只執行 SELECT**。沒有任何 INSERT／UPDATE／DELETE／RPC 寫入路徑。
 *    #1777 的授權邊界明訂：production DML／backfill／balance adjustment／真實
 *    refund／payout confirm 都需 owner 逐次另行授權。這支腳本的用途是產出那份
 *    授權所需的 preview 與影響範圍，不是執行它。
 *
 * Privacy：輸出一律遮罩識別碼（只留前 8 碼）、只含金額與計數，不含姓名、
 * email、付款 payload 或任何 PII（#1777 safety 條款）。
 *
 * 用法：
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     node scripts/admin/issue1777-reconciliation-preview.mjs
 *
 *   輸出 JSON 至 stdout；加 --out <path> 可另存檔案。
 */
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

import { getReconciliationDataDb } from '../../apps/web/src/lib/accounting/db-reconciliation.mjs';
import {
  buildGuideReconciliation,
  buildOrderReconciliation,
  buildEligibilityAudit,
  buildReconciliationReport,
  maskId,
} from '../../apps/web/src/lib/accounting/reconciliation.mjs';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

/** #1647 項目一：卡在 paid、從未結算的歷史訂單。 */
async function previewStuckPaidOrders() {
  const { data: paidOrders, error } = await supabase
    .from('orders')
    .select('id, total_twd, paid_at, payment_status')
    .eq('status', 'paid')
    .limit(2000);
  if (error) throw new Error(error.message);

  const ids = (paidOrders ?? []).map((o) => o.id);
  let settledIds = new Set();
  if (ids.length > 0) {
    const { data: settled } = await supabase
      .from('payout_items')
      .select('order_id')
      .in('order_id', ids);
    settledIds = new Set((settled ?? []).map((r) => r.order_id));
  }

  const stuck = (paidOrders ?? []).filter((o) => !settledIds.has(o.id));

  return {
    description: '狀態卡在 paid、無任何 ledger 分錄的訂單',
    count: stuck.length,
    totalTwd: stuck.reduce((s, o) => s + Number(o.total_twd ?? 0), 0),
    // 判斷是否可安全推進：provider 已收款（paid_at 有值）才在候選內
    collectedCount: stuck.filter((o) => o.paid_at).length,
    notCollectedCount: stuck.filter((o) => !o.paid_at).length,
    paymentStatusMismatchCount: stuck.filter((o) => o.paid_at && o.payment_status === 'pending').length,
    samples: stuck.slice(0, 20).map((o) => ({
      orderIdMasked: maskId(o.id),
      totalTwd: Number(o.total_twd ?? 0),
      hasPaidAt: !!o.paid_at,
      paymentStatus: o.payment_status ?? null,
    })),
    proposal: '只推進 provider 已收款（paid_at 非空）、行程資料完整、狀態轉移合法者；'
      + '其餘維持原狀並個別檢視。不建議無條件全改。',
  };
}

/**
 * #1647 項目二：未實收卻入帳的金額。
 *
 * 兩條互補的偵測路徑——2026-07-29 的生產實測顯示，只看金額會漏掉這一類：
 *   (a) 餘額高於 ledger 期望值 → 有餘額但無分錄支撐
 *   (b) 資格稽核 → 有分錄且金額算得對，但訂單當初根本不該被結算
 * 生產上那筆 NT$6,120 屬於 (b)，且淨額已被 reversal 沖銷為 0。
 */
async function previewUncollectedInBalance(reconciliation, eligibility) {
  const surplus = reconciliation.guides.filter((g) => g.diffTwd > 0);
  return {
    description: '未實收卻入帳的金額（餘額無分錄支撐 ＋ 分錄不符資格兩路偵測）',
    balanceSurplus: {
      guideCount: surplus.length,
      totalTwd: surplus.reduce((s, g) => s + g.diffTwd, 0),
      guides: surplus.map((g) => ({
        guideIdMasked: g.guideIdMasked,
        surplusTwd: g.diffTwd,
        actualBalanceTwd: g.actualBalanceTwd,
        expectedBalanceTwd: g.expectedBalanceTwd,
      })),
    },
    ineligibleSettlements: {
      needsAttentionCount: eligibility.totals.needsAttentionCount,
      outstandingTwd: eligibility.totals.outstandingTwd,
      alreadyReversedCount: eligibility.totals.alreadyReversedCount,
      orders: eligibility.orders,
    },
    proposal: '仍有淨額者：原則沖銷；若款項已實際付給導遊，改列下期 carry-forward 回收並留'
      + '會計理由。淨額已被 reversal 沖銷為 0 者（alreadyReversed）帳已平，無需處理。'
      + '任何寫入都需 owner 個別授權。',
  };
}

/** #1647 項目三：過期／金額與餘額不符的 pending 出款單。 */
async function previewStalePendingPayouts(reconciliation) {
  const { data: pendings, error } = await supabase
    .from('payouts')
    .select('id, guide_id, total_twd, created_at')
    .eq('state', 'pending')
    .limit(2000);
  if (error) throw new Error(error.message);

  const balanceByGuide = new Map(
    reconciliation.guides.map((g) => [g.guideIdMasked, g.actualBalanceTwd]),
  );

  const rows = (pendings ?? []).map((p) => {
    const masked = maskId(p.guide_id);
    const balance = balanceByGuide.get(masked) ?? 0;
    const ageDays = p.created_at
      ? Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000)
      : null;
    return {
      payoutIdMasked: maskId(p.id),
      guideIdMasked: masked,
      totalTwd: Number(p.total_twd ?? 0),
      currentBalanceTwd: balance,
      exceedsBalance: Number(p.total_twd ?? 0) > balance,
      ageDays,
    };
  });

  return {
    description: 'pending 狀態的出款單（金額為建立當下的餘額快照）',
    count: rows.length,
    totalTwd: rows.reduce((s, r) => s + r.totalTwd, 0),
    exceedsBalanceCount: rows.filter((r) => r.exceedsBalance).length,
    payouts: rows,
    proposal: '先完成餘額對帳 → cancel 舊快照（cancel 不動餘額，只釋放 pending 唯一鍵）'
      + ' → 依最新正確餘額重產。不可直接 confirm 舊快照。',
  };
}

async function main() {
  const data = await getReconciliationDataDb(supabase);
  const guideReconciliation = buildGuideReconciliation(data);
  const orderReconciliation = buildOrderReconciliation({
    orders: data.orders,
    ledgerRows: data.ledgerRows,
    commissionRate: data.commissionRate,
  });
  const eligibilityAudit = buildEligibilityAudit({
    orders: data.orders,
    ledgerRows: data.ledgerRows,
  });
  const reconciliation = buildReconciliationReport({
    guideReconciliation,
    orderReconciliation,
    eligibilityAudit,
  });

  const report = {
    issue: 1777,
    mode: 'READ_ONLY_PREVIEW',
    generatedAt: new Date().toISOString(),
    note: '本報告僅供 owner 授權判斷；未執行任何寫入。',
    commissionRate: data.commissionRate,
    reconciliation,
    historical: {
      stuckPaidOrders: await previewStuckPaidOrders(),
      uncollectedInBalance: await previewUncollectedInBalance(guideReconciliation, eligibilityAudit),
      stalePendingPayouts: await previewStalePendingPayouts(guideReconciliation),
    },
  };

  const json = JSON.stringify(report, null, 2);
  const outIdx = process.argv.indexOf('--out');
  if (outIdx >= 0 && process.argv[outIdx + 1]) {
    writeFileSync(process.argv[outIdx + 1], json);
    console.error(`已寫入 ${process.argv[outIdx + 1]}`);
  } else {
    console.log(json);
  }
}

main().catch((err) => {
  console.error('preview failed:', err?.message ?? err);
  process.exit(1);
});
