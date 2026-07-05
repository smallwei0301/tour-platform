/**
 * KPI 設定資料層（#1570 db.mjs strangler 首批抽出）。
 *
 * 遵守 strangler 硬規則：新／既有可獨立的資料存取一律離開 db.mjs 單體，
 * 移到領域檔。本檔為「純搬移」——邏輯與 db.mjs 原實作逐字一致，只換位置：
 *   - Supabase 分支：kpi_settings / kpi_settings_history 讀寫。
 *   - in-memory fallback：沿用 admin.mjs 既有 *Fallback（未動）。
 *   - audit log 走單一實作 audit-log.mjs。
 * 對外 API（4 個 *Db 函式簽章／回傳 shape）不變，caller 改由本檔 import。
 */
import { randomUUID } from 'node:crypto';
import { hasSupabaseEnv, getSupabase } from './supabase-env.mjs';
import { insertAuditLogDb } from './audit-log.mjs';
import {
  getKpiConfigFallback,
  updateKpiConfigFallback,
  listKpiConfigHistoryFallback,
  revertKpiConfigFallback,
} from './admin.mjs';

export async function getKpiConfigDb() {
  if (!hasSupabaseEnv()) return getKpiConfigFallback();

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('kpi_settings')
    .select('commission_rate, payment_fee_rate, guide_payout_rate, healthy_min_contribution_twd, healthy_allow_exception, updated_at')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    return {
      commissionRate: 0.15,
      paymentFeeRate: 0.035,
      guidePayoutRate: 0.85,
      healthyMinContributionTwd: 1,
      healthyAllowException: false,
      updatedAt: new Date().toISOString()
    };
  }

  return {
    commissionRate: Number(data.commission_rate ?? 0.15),
    paymentFeeRate: Number(data.payment_fee_rate ?? 0.035),
    guidePayoutRate: Number(data.guide_payout_rate ?? 0.85),
    healthyMinContributionTwd: Number(data.healthy_min_contribution_twd ?? 1),
    healthyAllowException: !!data.healthy_allow_exception,
    updatedAt: data.updated_at
  };
}

export async function updateKpiConfigDb(input = {}) {
  if (!hasSupabaseEnv()) return updateKpiConfigFallback(input);

  const actor = String(input?.actor || 'admin');
  const note = String(input?.note || '');
  const skipAuditLog = input?.skipAuditLog === true;

  const current = await getKpiConfigDb();
  const commissionRate = input.commissionRate == null ? current.commissionRate : Number(input.commissionRate);
  const paymentFeeRate = input.paymentFeeRate == null ? current.paymentFeeRate : Number(input.paymentFeeRate);
  const guidePayoutRate = input.guidePayoutRate == null ? current.guidePayoutRate : Number(input.guidePayoutRate);
  const healthyMinContributionTwd = input.healthyMinContributionTwd == null ? current.healthyMinContributionTwd : Number(input.healthyMinContributionTwd);
  const healthyAllowException = input.healthyAllowException == null ? current.healthyAllowException : !!input.healthyAllowException;

  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) throw new Error('commissionRate must be between 0 and 1');
  if (!Number.isFinite(paymentFeeRate) || paymentFeeRate < 0 || paymentFeeRate > 1) throw new Error('paymentFeeRate must be between 0 and 1');
  if (!Number.isFinite(guidePayoutRate) || guidePayoutRate < 0 || guidePayoutRate > 1) throw new Error('guidePayoutRate must be between 0 and 1');

  const supabase = await getSupabase();
  const payload = {
    id: 'default',
    commission_rate: commissionRate,
    payment_fee_rate: paymentFeeRate,
    guide_payout_rate: guidePayoutRate,
    healthy_min_contribution_twd: healthyMinContributionTwd,
    healthy_allow_exception: healthyAllowException,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('kpi_settings').upsert(payload);
  if (error) throw new Error(error.message);

  const updated = await getKpiConfigDb();

  await supabase.from('kpi_settings_history').insert({
    version_id: randomUUID(),
    actor,
    action: 'update',
    note,
    before_payload: current,
    config_payload: updated,
    source_version_id: null,
    created_at: new Date().toISOString()
  });

  if (!skipAuditLog) {
    await insertAuditLogDb(supabase, {
      actor,
      action: 'kpi_config_update',
      metadata: {
        note,
        before: current,
        after: updated
      }
    });
  }

  return updated;
}

export async function listKpiConfigHistoryDb() {
  if (!hasSupabaseEnv()) return listKpiConfigHistoryFallback();

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('kpi_settings_history')
    .select('version_id, actor, action, note, before_payload, config_payload, source_version_id, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return (data || []).map((r) => ({
    versionId: r.version_id,
    actor: r.actor,
    action: r.action,
    note: r.note,
    before: r.before_payload,
    config: r.config_payload,
    sourceVersionId: r.source_version_id,
    createdAt: r.created_at
  }));
}

export async function revertKpiConfigDb(input = {}) {
  if (!hasSupabaseEnv()) return revertKpiConfigFallback(input);

  const versionId = String(input?.versionId || '').trim();
  if (!versionId) throw new Error('versionId is required');

  const supabase = await getSupabase();

  const { data: target, error: targetErr } = await supabase
    .from('kpi_settings_history')
    .select('version_id, config_payload')
    .eq('version_id', versionId)
    .single();

  if (targetErr || !target) throw new Error('kpi config version not found');

  const cfg = target.config_payload || {};
  const actor = String(input.actor || 'admin');
  const updated = await updateKpiConfigDb({
    commissionRate: cfg.commissionRate,
    paymentFeeRate: cfg.paymentFeeRate,
    guidePayoutRate: cfg.guidePayoutRate,
    healthyMinContributionTwd: cfg.healthyMinContributionTwd,
    healthyAllowException: cfg.healthyAllowException,
    actor,
    note: `revert to ${versionId}`,
    skipAuditLog: true
  });

  // record revert op
  await supabase.from('kpi_settings_history').insert({
    version_id: randomUUID(),
    actor,
    action: 'revert',
    note: `revert to ${versionId}`,
    before_payload: null,
    config_payload: updated,
    source_version_id: versionId,
    created_at: new Date().toISOString()
  });

  await insertAuditLogDb(supabase, {
    actor,
    action: 'kpi_config_revert',
    metadata: {
      sourceVersionId: versionId,
      revertedConfig: updated
    }
  });

  return updated;
}
