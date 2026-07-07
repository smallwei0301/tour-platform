// @ts-check
/**
 * #1637 月結報表組裝服務 — JSON route 與 CSV route 共用。
 * 無 Supabase env 時回傳空報表（env-fallback，本地/測試友善）。
 */

import { buildMonthlyAccountingReport } from './report.mjs';
import { getMonthlyAccountingReportDataDb } from './db-report.mjs';
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
 * @returns {Promise<ReturnType<typeof buildMonthlyAccountingReport>>}
 */
export async function getMonthlyAccountingReport(month) {
  if (!getSupabaseUrl()) {
    return buildMonthlyAccountingReport({ month, generatedAt: new Date().toISOString() });
  }
  const supabase = await getServiceSupabase();
  const data = await getMonthlyAccountingReportDataDb(supabase, month);
  return buildMonthlyAccountingReport({
    month,
    generatedAt: new Date().toISOString(),
    ...data,
  });
}
