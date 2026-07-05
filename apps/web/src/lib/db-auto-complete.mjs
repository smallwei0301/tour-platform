/**
 * Issue #1554 — 自動完成 sweep 資料層（獨立領域檔，遵守 #1385 strangler 硬規則：
 * 新資料存取不進 db.mjs 單體）。
 *
 * Supabase 分支與 in-memory fallback 同步實作、同回傳 shape：
 *   { scanned, completed, stalled: [{orderId, reason}], results: [{orderId, completed}] }
 *
 * 冪等性：
 * - Supabase：update ... eq('status','confirmed') 為 compare-and-swap，重跑/併發
 *   時第二個寫入者匹配 0 列 → no-op（純狀態翻轉、不動容量，無鎖序需求；
 *   鎖序準則見 docs/04-tech/04-tech-architecture/12-payment-callback-atomicity.md，
 *   本 sweep 不觸 bookings/activity_schedules）。
 * - in-memory：狀態檢查後翻轉，重跑時已 completed 者不再匹配。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';
import { orders as memOrders } from './store.mjs';
import { appendAuditLog, insertAuditLogDb } from './audit-log.mjs';
import { grantCompletionRewards } from './order-completion-rewards.mjs';
import {
  evaluateAutoCompleteEligibility,
  isStalledConfirmedOrder,
  AUTO_COMPLETE_DEFAULT_GRACE_HOURS,
} from './auto-complete-eligibility.mjs';

const AUDIT_ACTION = 'order_auto_completed';

function normalizeInput(input = {}) {
  const nowIso = input?.now ? new Date(input.now).toISOString() : new Date().toISOString();
  const limit = Number.isInteger(input?.limit) && input.limit > 0 ? Math.min(input.limit, 1000) : 200;
  const graceHours =
    Number.isFinite(input?.graceHours) && input.graceHours > 0
      ? input.graceHours
      : AUTO_COMPLETE_DEFAULT_GRACE_HOURS;
  return { nowIso, limit, graceHours };
}

/** 與 settlement 同源的時間來源優先序：V2 booking.start_at → legacy schedule.start_at。 */
function pickSupabaseEffectiveStartAt(row) {
  const booking = Array.isArray(row?.bookings) ? row.bookings[0] : row?.bookings;
  const schedule = Array.isArray(row?.activity_schedules)
    ? row.activity_schedules[0]
    : row?.activity_schedules;
  return booking?.start_at ?? schedule?.start_at ?? null;
}

export async function autoCompleteConfirmedOrdersDb(input = {}) {
  const { nowIso, limit, graceHours } = normalizeInput(input);

  if (!hasSupabaseEnv()) {
    return autoCompleteConfirmedOrdersInMemory({ nowIso, limit, graceHours });
  }

  const supabase = await getSupabase();
  // #1560 後 orders↔bookings 有兩條 FK（fk_bookings_order_id: bookings.order_id→orders；
  // orders_booking_id_fkey: orders.booking_id→bookings），未指名時 PostgREST 回 PGRST201
  // 「found more than one relationship」→ 500。指名 fk_bookings_order_id（bookings 屬於此
  // order 的方向，且 orders.booking_id 對舊單多為 NULL），與加第二條 FK 前的行為一致。
  const { data: candidates, error } = await supabase
    .from('orders')
    .select('id, status, created_at, user_id, total_twd, bookings!fk_bookings_order_id(start_at), activity_schedules(start_at)')
    .eq('status', 'confirmed')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const results = [];
  const stalled = [];
  let completedCount = 0;

  for (const row of candidates || []) {
    const effectiveStartAt = pickSupabaseEffectiveStartAt(row);
    const verdict = evaluateAutoCompleteEligibility({
      status: row.status,
      effectiveStartAt,
      nowIso,
      graceHours,
    });

    if (!verdict.eligible) {
      if (
        isStalledConfirmedOrder({
          status: row.status,
          effectiveStartAt,
          createdAt: row.created_at,
          nowIso,
          graceHours,
        })
      ) {
        stalled.push({ orderId: row.id, reason: verdict.reason });
      }
      continue;
    }

    // compare-and-swap：eq status confirmed → 冪等/防併發雙寫
    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'completed', updated_at: nowIso })
      .eq('id', row.id)
      .eq('status', 'confirmed')
      .select('id');
    if (updateErr) {
      results.push({ orderId: row.id, completed: false, error: updateErr.message });
      continue;
    }
    const didUpdate = Array.isArray(updated) && updated.length > 0;
    if (didUpdate) {
      completedCount += 1;
      try {
        await insertAuditLogDb(supabase, {
          orderId: row.id,
          actor: 'system',
          action: AUDIT_ACTION,
          metadata: { initiatedBy: 'auto-complete-sweep', effectiveStartAt, graceHours },
        });
      } catch (auditErr) {
        console.error('[auto-complete-sweep] audit error:', auditErr?.message || auditErr);
      }
      // #1594 完成獎勵：發點（冪等）＋站內通知，best-effort（不影響 sweep 結果）。
      try {
        await grantCompletionRewards({
          userId: row.user_id,
          orderId: row.id,
          paidTwd: row.total_twd,
          now: nowIso,
        });
      } catch (rewardErr) {
        console.error('[auto-complete-sweep] reward error:', rewardErr?.message || rewardErr);
      }
    }
    results.push({ orderId: row.id, completed: didUpdate });
  }

  return { scanned: (candidates || []).length, completed: completedCount, stalled, results };
}

function autoCompleteConfirmedOrdersInMemory({ nowIso, limit, graceHours }) {
  const candidates = memOrders.filter((o) => o.status === 'confirmed').slice(0, limit);

  const results = [];
  const stalled = [];
  let completedCount = 0;

  for (const order of candidates) {
    const effectiveStartAt = order.scheduleStartAt ?? null;
    const verdict = evaluateAutoCompleteEligibility({
      status: order.status,
      effectiveStartAt,
      nowIso,
      graceHours,
    });

    if (!verdict.eligible) {
      if (
        isStalledConfirmedOrder({
          status: order.status,
          effectiveStartAt,
          createdAt: order.createdAt,
          nowIso,
          graceHours,
        })
      ) {
        stalled.push({ orderId: order.id, reason: verdict.reason });
      }
      continue;
    }

    order.status = 'completed';
    order.updatedAt = nowIso;
    completedCount += 1;
    appendAuditLog({
      orderId: order.id,
      actor: 'system',
      action: AUDIT_ACTION,
      metadata: { initiatedBy: 'auto-complete-sweep', effectiveStartAt, graceHours },
    });
    results.push({ orderId: order.id, completed: true });
  }

  return { scanned: candidates.length, completed: completedCount, stalled, results };
}
