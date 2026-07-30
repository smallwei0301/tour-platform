/**
 * Issue #1777 Phase 4 — 財務對帳報表。
 *
 * AC：「admin monthly report 可列出 ledger／balance／payout 差異與待人工處理項」
 * 以及「排程重跑能修復或明確告警不一致」。
 *
 * 這裡鎖住不變量本身：
 *   期望餘額 = Σ ledger 淨額 − Σ 已付出款
 *   每張訂單的 ledger 淨額 = floor(max(0, total − 累積退款) × (1 − 分潤率))
 *
 * 並以 #1637 稽核報告記錄的三種真實歷史異常作為案例（未實收卻入帳、過期
 * pending 出款、全額紅沖後未重建剩餘應付），確認報表確實把它們標成待處理。
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = () => import('../../src/lib/accounting/reconciliation.mjs');

describe('#1777 Phase 4 — 識別碼遮罩（privacy）', () => {
  it('只保留前 8 碼', async () => {
    const { maskId } = await load();
    assert.equal(maskId('1158aa21-0000-4000-8000-000000000000'), '1158aa21…');
  });

  it('空值回 null，短值不炸', async () => {
    const { maskId } = await load();
    assert.equal(maskId(null), null);
    assert.equal(maskId(''), null);
    assert.equal(maskId('abc'), 'abc');
  });
});

describe('#1777 Phase 4 — 目標淨應付沿用 floor 語意', () => {
  it('無退款：floor(total × (1 − rate))', async () => {
    const { targetNetPayable } = await load();
    assert.equal(targetNetPayable(10000, 0, 0.15), 8500);
  });

  it('部分退款按有效金額計算', async () => {
    const { targetNetPayable } = await load();
    assert.equal(targetNetPayable(10000, 3000, 0.15), 5950);
  });

  it('全額／超額退款下限為 0', async () => {
    const { targetNetPayable } = await load();
    assert.equal(targetNetPayable(10000, 10000, 0.15), 0);
    assert.equal(targetNetPayable(10000, 99999, 0.15), 0);
  });

  it('floor 而非四捨五入（殘差歸平台，與 sweep 一致）', async () => {
    const { targetNetPayable } = await load();
    // 999 × 0.85 = 849.15 → floor 849
    assert.equal(targetNetPayable(999, 0, 0.15), 849);
  });
});

describe('#1777 Phase 4 — 逐導遊對帳', () => {
  it('ledger − 已付出款 = 餘額時判定一致', async () => {
    const { buildGuideReconciliation } = await load();
    const out = buildGuideReconciliation({
      ledgerRows: [{ guide_id: 'g-1', net_twd: 8500 }, { guide_id: 'g-1', net_twd: 5000 }],
      paidPayouts: [{ guide_id: 'g-1', total_twd: 5000 }],
      balanceRows: [{ guide_id: 'g-1', balance_twd: 8500 }],
      pendingPayouts: [],
    });

    assert.equal(out.mismatchCount, 0);
    assert.equal(out.guides[0].expectedBalanceTwd, 8500);
    assert.equal(out.guides[0].diffTwd, 0);
    assert.equal(out.guides[0].needsAttention, false);
  });

  it('餘額漏加（缺口 3 的後果）被標為 mismatch', async () => {
    const { buildGuideReconciliation } = await load();
    // ledger 有分錄但餘額沒加——正是 payout item 成功而 balance 失敗的殘留
    const out = buildGuideReconciliation({
      ledgerRows: [{ guide_id: 'g-1', net_twd: 8500 }],
      balanceRows: [{ guide_id: 'g-1', balance_twd: 0 }],
      paidPayouts: [],
      pendingPayouts: [],
    });

    assert.equal(out.mismatchCount, 1);
    assert.equal(out.guides[0].diffTwd, -8500, '實際餘額比 ledger 少 8500');
    assert.ok(out.guides[0].issues.includes('balance_ledger_mismatch'));
  });

  it('未實收卻入帳（#1637 P1-4）造成餘額多出來，同樣被抓到', async () => {
    const { buildGuideReconciliation } = await load();
    // 餘額含一筆平台從未實收的 6120，但 ledger 沒有對應分錄
    const out = buildGuideReconciliation({
      ledgerRows: [{ guide_id: 'g-1', net_twd: 15694 }],
      balanceRows: [{ guide_id: 'g-1', balance_twd: 21814 }],
      paidPayouts: [],
      pendingPayouts: [],
    });

    assert.equal(out.guides[0].diffTwd, 6120, '差額應精確指出多出來的金額');
    assert.equal(out.guides[0].needsAttention, true);
  });

  it('過期 pending 出款超過現有餘額（#1637 P1-5）被標記', async () => {
    const { buildGuideReconciliation } = await load();
    const out = buildGuideReconciliation({
      ledgerRows: [{ guide_id: 'g-1', net_twd: 3000 }],
      balanceRows: [{ guide_id: 'g-1', balance_twd: 3000 }],
      paidPayouts: [],
      pendingPayouts: [{ guide_id: 'g-1', total_twd: 7168 }],
    });

    assert.ok(
      out.guides[0].issues.includes('pending_payout_exceeds_balance'),
      '舊快照出款單金額大於餘額，confirm 會被擋下——必須先對帳再重產',
    );
    assert.equal(out.guides[0].needsAttention, true);
  });

  it('負餘額（carry-forward）被單獨標記', async () => {
    const { buildGuideReconciliation } = await load();
    const out = buildGuideReconciliation({
      ledgerRows: [{ guide_id: 'g-1', net_twd: 0 }],
      balanceRows: [{ guide_id: 'g-1', balance_twd: -8500 }],
      paidPayouts: [{ guide_id: 'g-1', total_twd: 8500 }],
      pendingPayouts: [],
    });

    assert.ok(out.guides[0].issues.includes('negative_balance_carry_forward'));
  });

  it('差額大者排前面，且輸出不含未遮罩識別碼', async () => {
    const { buildGuideReconciliation } = await load();
    const out = buildGuideReconciliation({
      ledgerRows: [{ guide_id: 'guide-aaaaaaaa-1', net_twd: 100 }, { guide_id: 'guide-bbbbbbbb-2', net_twd: 9000 }],
      balanceRows: [{ guide_id: 'guide-aaaaaaaa-1', balance_twd: 0 }, { guide_id: 'guide-bbbbbbbb-2', balance_twd: 0 }],
      paidPayouts: [],
      pendingPayouts: [],
    });

    assert.equal(out.guides[0].diffTwd, -9000, '差額絕對值大的排前面');
    for (const g of out.guides) {
      assert.ok(g.guideIdMasked.endsWith('…'), '識別碼必須遮罩');
      assert.equal(g.guideId, undefined, '不得輸出完整 guide_id');
    }
  });

  it('空輸入回一致（不誤報）', async () => {
    const { buildGuideReconciliation } = await load();
    const out = buildGuideReconciliation({});
    assert.equal(out.mismatchCount, 0);
    assert.equal(out.totals.guideCount, 0);
  });
});

describe('#1777 Phase 4 — 逐訂單對帳', () => {
  it('全額紅沖後未重建剩餘應付（缺口 2 的後果）被抓到', async () => {
    const { buildOrderReconciliation } = await load();
    // 訂單 10000、退 3000；ledger 因 settlement 8500 + reversal −8500 = 0
    const out = buildOrderReconciliation({
      orders: [{ id: 'o-1', total_twd: 10000, refund_amount_twd: 3000 }],
      ledgerRows: [{ order_id: 'o-1', net_twd: 8500 }, { order_id: 'o-1', net_twd: -8500 }],
      commissionRate: 0.15,
    });

    assert.equal(out.totals.mismatchCount, 1);
    assert.equal(out.orders[0].ledgerNetTwd, 0);
    assert.equal(out.orders[0].targetNetTwd, 5950);
    assert.equal(out.orders[0].diffTwd, -5950, '導遊被少算 5950——正是決策 B 要修的');
  });

  it('Phase 3 的差額 adjustment 套用後判定一致', async () => {
    const { buildOrderReconciliation } = await load();
    const out = buildOrderReconciliation({
      orders: [{ id: 'o-1', total_twd: 10000, refund_amount_twd: 3000 }],
      // settlement 8500 → reversal −8500 → adjustment +5950
      ledgerRows: [
        { order_id: 'o-1', net_twd: 8500 },
        { order_id: 'o-1', net_twd: -8500 },
        { order_id: 'o-1', net_twd: 5950 },
      ],
      commissionRate: 0.15,
    });

    assert.equal(out.totals.mismatchCount, 0, '差額補上後即與目標一致');
  });

  it('從未結算的訂單不列入（沒有分錄不代表有問題）', async () => {
    const { buildOrderReconciliation } = await load();
    const out = buildOrderReconciliation({
      orders: [{ id: 'o-never-settled', total_twd: 10000, refund_amount_twd: 0 }],
      ledgerRows: [],
      commissionRate: 0.15,
    });

    assert.equal(out.totals.checkedCount, 0, '未進 ledger 者由 sweep 的 effective-gmv 處理');
    assert.equal(out.totals.mismatchCount, 0);
  });

  it('訂單識別碼一律遮罩', async () => {
    const { buildOrderReconciliation } = await load();
    const out = buildOrderReconciliation({
      orders: [{ id: '1158aa21-0000-4000-8000-000000000000', total_twd: 7200, refund_amount_twd: 0 }],
      ledgerRows: [{ order_id: '1158aa21-0000-4000-8000-000000000000', net_twd: 6120 }],
      commissionRate: 0.15,
    });

    assert.equal(out.orders[0].orderIdMasked, '1158aa21…');
    assert.equal(out.orders[0].orderId, undefined);
  });
});

// ── 授權邊界：對帳與 preview 一律唯讀 ─────────────────────────────────────────
//
// #1777 明訂 production DML／backfill／balance adjustment 皆需 owner 逐次授權。
// 這組斷言確保「對帳」這條路徑在程式碼層面就不可能寫入——避免日後有人在報表
// 裡順手加一段「自動修復」。

describe('#1777 Phase 4 — 對帳路徑必須是唯讀', () => {
  const RECON_DB = join(__dirname, '../../src/lib/accounting/db-reconciliation.mjs');
  const PREVIEW_SCRIPT = join(__dirname, '../../../../scripts/admin/issue1777-reconciliation-preview.mjs');

  /** 去掉註解，避免說明文字影響判定。 */
  const codeOf = (p) => readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  for (const [name, path] of [['db-reconciliation', RECON_DB], ['preview script', PREVIEW_SCRIPT]]) {
    it(`${name} 不含任何寫入呼叫`, () => {
      const code = codeOf(path);
      for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
        assert.ok(
          !code.includes(forbidden),
          `${name} 不得出現 ${forbidden}——對帳只負責發現問題，修復一律另案取得 owner 授權`,
        );
      }
    });
  }

  it('preview script 明確標示自己是唯讀模式', () => {
    const src = readFileSync(PREVIEW_SCRIPT, 'utf8');
    assert.match(src, /READ_ONLY_PREVIEW/, '輸出必須自我標示為唯讀 preview');
  });

  it('preview script 不輸出未遮罩識別碼或 PII 欄位', () => {
    const code = codeOf(PREVIEW_SCRIPT);
    // 名稱／email 等 PII 不得出現在查詢投影中
    for (const pii of ['display_name', 'guide_email', 'contact_email', 'contact_phone']) {
      assert.ok(!code.includes(pii), `preview 不得撈取 ${pii}（#1777 privacy 條款）`);
    }
  });
});

// ── 資格稽核：金額對帳抓不到的那一類錯 ───────────────────────────────────────
//
// 2026-07-29 生產實測催生的檢查：訂單 1158aa21…（NT$7,200、paid_at IS NULL、
// 平台從未實收）曾被結算成 net 6120。它的金額完全正確——floor(7200 × 0.85)
// = 6120，ledger 與餘額也一致——所以逐導遊與逐訂單的金額對帳全判「正常」。
// 錯的不是金額，是資格。

describe('#1777 Phase 4 — 已結算但不符資格的分錄', () => {
  it('未實收（paid_at 為空）卻有淨額 → 標為待處理', async () => {
    const { buildEligibilityAudit } = await load();
    const out = buildEligibilityAudit({
      orders: [{ id: 'o-uncollected', status: 'completed', paid_at: null }],
      ledgerRows: [{ order_id: 'o-uncollected', net_twd: 6120 }],
    });

    assert.equal(out.totals.needsAttentionCount, 1);
    assert.equal(out.totals.outstandingTwd, 6120);
    assert.ok(out.orders[0].reasons.includes('never_collected'));
  });

  it('未實收但淨額已被 reversal 沖銷為 0 → 不列為待處理（帳已平）', async () => {
    const { buildEligibilityAudit } = await load();
    // 生產實況：settlement +6120 與 reversal −6120 並存，淨額 0
    const out = buildEligibilityAudit({
      orders: [{ id: 'o-reversed', status: 'completed', paid_at: null }],
      ledgerRows: [
        { order_id: 'o-reversed', net_twd: 6120 },
        { order_id: 'o-reversed', net_twd: -6120 },
      ],
    });

    assert.equal(out.totals.needsAttentionCount, 0, '帳已平就不該再要求人工處理');
    assert.equal(out.totals.alreadyReversedCount, 1, '但仍保留可追溯的紀錄');
    assert.equal(out.orders[0].alreadyReversed, true);
  });

  it('hold 中的訂單卻有結算分錄 → 逐項列出 hold 理由', async () => {
    const { buildEligibilityAudit } = await load();
    const out = buildEligibilityAudit({
      orders: [{ id: 'o-hold', status: 'completed', paid_at: '2026-07-01T00:00:00Z', is_disputed: true, has_complaint: true }],
      ledgerRows: [{ order_id: 'o-hold', net_twd: 8500 }],
    });

    assert.equal(out.totals.needsAttentionCount, 1);
    assert.ok(out.orders[0].reasons.includes('payment_dispute'));
    assert.ok(out.orders[0].reasons.includes('complaint_under_review'));
  });

  it('狀態非 completed 卻已結算 → 標出實際狀態', async () => {
    const { buildEligibilityAudit } = await load();
    const out = buildEligibilityAudit({
      orders: [{ id: 'o-paid', status: 'paid', paid_at: '2026-07-01T00:00:00Z' }],
      ledgerRows: [{ order_id: 'o-paid', net_twd: 5000 }],
    });
    assert.ok(out.orders[0].reasons.includes('status_paid'));
  });

  it('完全合規的訂單不列入', async () => {
    const { buildEligibilityAudit } = await load();
    const out = buildEligibilityAudit({
      orders: [{ id: 'o-ok', status: 'completed', paid_at: '2026-07-01T00:00:00Z' }],
      ledgerRows: [{ order_id: 'o-ok', net_twd: 8500 }],
    });
    assert.equal(out.totals.flaggedCount, 0);
  });

  it('沒有 ledger 分錄的訂單不列入（未結算不是問題）', async () => {
    const { buildEligibilityAudit } = await load();
    const out = buildEligibilityAudit({
      orders: [{ id: 'o-never', status: 'paid', paid_at: null }],
      ledgerRows: [],
    });
    assert.equal(out.totals.flaggedCount, 0);
  });

  it('識別碼遮罩', async () => {
    const { buildEligibilityAudit } = await load();
    const out = buildEligibilityAudit({
      orders: [{ id: '1158aa21-0000-4000-8000-000000000000', status: 'completed', paid_at: null }],
      ledgerRows: [{ order_id: '1158aa21-0000-4000-8000-000000000000', net_twd: 6120 }],
    });
    assert.equal(out.orders[0].orderIdMasked, '1158aa21…');
    assert.equal(out.orders[0].orderId, undefined);
  });
});

describe('#1777 Phase 4 — 對帳結論', () => {
  it('全一致時 ok=true 且不列出待處理項', async () => {
    const { buildReconciliationReport, buildGuideReconciliation, buildOrderReconciliation } = await load();
    const report = buildReconciliationReport({
      guideReconciliation: buildGuideReconciliation({
        ledgerRows: [{ guide_id: 'g-1', net_twd: 8500 }],
        balanceRows: [{ guide_id: 'g-1', balance_twd: 8500 }],
      }),
      orderReconciliation: buildOrderReconciliation({
        orders: [{ id: 'o-1', total_twd: 10000, refund_amount_twd: 0 }],
        ledgerRows: [{ order_id: 'o-1', net_twd: 8500 }],
        commissionRate: 0.15,
      }),
    });

    assert.equal(report.ok, true);
    assert.equal(report.orders.length, 0);
  });

  it('金額全對但有不符資格的分錄 → ok=false（不得因金額平就放行）', async () => {
    const { buildReconciliationReport, buildGuideReconciliation, buildOrderReconciliation, buildEligibilityAudit } = await load();
    // 生產實例的形狀：金額算對、ledger 與餘額一致，但訂單從未實收
    const orders = [{ id: 'o-uncollected', total_twd: 7200, refund_amount_twd: 0, status: 'completed', paid_at: null }];
    const ledgerRows = [{ order_id: 'o-uncollected', guide_id: 'g-1', net_twd: 6120 }];

    const report = buildReconciliationReport({
      guideReconciliation: buildGuideReconciliation({
        ledgerRows,
        balanceRows: [{ guide_id: 'g-1', balance_twd: 6120 }],
      }),
      orderReconciliation: buildOrderReconciliation({ orders, ledgerRows, commissionRate: 0.15 }),
      eligibilityAudit: buildEligibilityAudit({ orders, ledgerRows }),
    });

    assert.equal(report.guideMismatchCount, 0, '三方金額一致');
    assert.equal(report.orderMismatchCount, 0, '訂單淨額也等於目標值');
    assert.equal(report.eligibilityIssueCount, 1, '但資格稽核必須抓到');
    assert.equal(report.ok, false, '金額對不代表帳是對的');
    assert.equal(report.ineligibleSettlements[0].orderIdMasked, 'o-uncoll…');
  });

  it('任一層不一致即 ok=false，並只列出待處理訂單', async () => {
    const { buildReconciliationReport, buildGuideReconciliation, buildOrderReconciliation } = await load();
    const report = buildReconciliationReport({
      guideReconciliation: buildGuideReconciliation({
        ledgerRows: [{ guide_id: 'g-1', net_twd: 8500 }],
        balanceRows: [{ guide_id: 'g-1', balance_twd: 0 }],
      }),
      orderReconciliation: buildOrderReconciliation({
        orders: [
          { id: 'o-ok', total_twd: 10000, refund_amount_twd: 0 },
          { id: 'o-bad', total_twd: 10000, refund_amount_twd: 3000 },
        ],
        ledgerRows: [
          { order_id: 'o-ok', net_twd: 8500 },
          { order_id: 'o-bad', net_twd: 0 },
        ],
        commissionRate: 0.15,
      }),
    });

    assert.equal(report.ok, false);
    assert.equal(report.guideMismatchCount, 1);
    assert.equal(report.orderMismatchCount, 1);
    assert.equal(report.orders.length, 1, '只列待處理項，不重複列出正常訂單');
    assert.equal(report.orders[0].orderIdMasked, 'o-bad');
  });
});
