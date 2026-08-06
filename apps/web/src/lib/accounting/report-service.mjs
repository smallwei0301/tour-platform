// @ts-check
/**
 * #1637 月結報表組裝服務 — JSON route 與 CSV route 共用。
 * 無 Supabase env 時回傳空報表（env-fallback，本地/測試友善）。
 */

import { buildMonthlyAccountingReport } from './report.mjs';
import { getMonthlyAccountingReportDataDb } from './db-report.mjs';
import { getReconciliationDataDb } from './db-reconciliation.mjs';
import {
  buildGuideReconciliation,
  buildOrderReconciliation,
  buildEligibilityAudit,
  buildMissedSettlementAudit,
  buildReconciliationReport,
} from './reconciliation.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../config/supabase-service-env.mjs';

async function getServiceSupabase() {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) throw new Error('Supabase service env missing');
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key);
}

/**
 * @param {string} month - 'YYYY-MM'（呼叫端先驗格式）
 * @returns {Promise<ReturnType<typeof buildMonthlyAccountingReport> & { reconciliation?: any }>}
 *   #1777 Phase 4 起額外附帶 reconciliation 區塊（無 Supabase env 的 fallback 路徑不含）。
 */
export async function getMonthlyAccountingReport(month) {
  if (!getSupabaseUrl()) {
    return buildMonthlyAccountingReport({ month, generatedAt: new Date().toISOString() });
  }
  const supabase = await getServiceSupabase();
  const data = await getMonthlyAccountingReportDataDb(supabase, month);
  const report = buildMonthlyAccountingReport({
    month,
    generatedAt: new Date().toISOString(),
    ...data,
  });

  // #1777 Phase 4：附上 ledger／balance／payout 三方對帳結論與待人工處理項。
  // 對帳是全期不變量檢查（非歸月），因此與月報表資料分開查詢。失敗不影響月報
  // 主體——報表本身仍要出得來，對帳區塊標記為不可用即可。
  let reconciliation;
  try {
    const reconciliationData = await getReconciliationDataDb(supabase);
    reconciliation = buildReconciliationReport({
      guideReconciliation: buildGuideReconciliation(reconciliationData),
      orderReconciliation: buildOrderReconciliation({
        orders: reconciliationData.orders,
        ledgerRows: reconciliationData.ledgerRows,
        commissionRate: reconciliationData.commissionRate,
      }),
      eligibilityAudit: buildEligibilityAudit({
        orders: reconciliationData.orders,
        ledgerRows: reconciliationData.ledgerRows,
      }),
      // #1777 F6：另一個方向——該結算卻連一筆分錄都沒有的訂單。
      // 少了這一項，一整批漏結算會因為「三方金額都是 0」而顯示為完全正常。
      missedSettlementAudit: buildMissedSettlementAudit({
        orders: reconciliationData.orders,
        ledgerRows: reconciliationData.ledgerRows,
        commissionRate: reconciliationData.commissionRate,
        tDays: reconciliationData.tDays,
        asOf: new Date().toISOString(),
      }),
    });
  } catch (err) {
    reconciliation = {
      available: false,
      error: err instanceof Error ? err.message : 'reconciliation failed',
    };
  }

  return { ...report, reconciliation };
}
