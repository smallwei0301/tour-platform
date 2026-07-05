/**
 * 訂單改期 gateway（#1383；設計見 docs 13-order-reschedule-design）
 * #1613 db.mjs strangler：整塊自 db.mjs 純搬移（行為零變更；型別債見 #1597）。
 * db.mjs 以 re-export 保持既有 caller 匯入路徑不變。
 */
import { insertAuditLogDb } from './audit-log.mjs';
import { createRescheduleRequestInMemory, decideRescheduleRequestInMemory, listGuideRescheduleRequestsInMemory, listRescheduleOptionsInMemory, withdrawRescheduleRequestInMemory } from './reschedule-store.mjs';
import { canRequestReschedule, isRescheduleRequestExpired, isRescheduleTargetValid } from './reschedule.mjs';
import { getSupabase, hasSupabaseEnv } from './supabase-env.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// #1383 — 訂單改期 gateway（設計：docs/04-tech/04-tech-architecture/13-order-reschedule-design.md）
// in-memory fallback 與 Supabase 同狀態轉移；Supabase approve 的原子性由
// fn_reschedule_booking_atomic RPC 保證（鎖序 orders → bookings → activity_schedules）。
// ─────────────────────────────────────────────────────────────────────────────

function mapRescheduleRow(row, orderRow) {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    fromScheduleId: row.from_schedule_id,
    toScheduleId: row.to_schedule_id,
    fromStartAt: row.from_start_at ?? null,
    toStartAt: row.to_start_at ?? null,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at ?? null,
    resolver: row.resolver ?? null,
    note: row.note ?? '',
    priorOrderStatus: row.prior_order_status,
    orderStatus: orderRow?.status ?? null,
    order: orderRow ? {
      id: orderRow.id,
      scheduleId: orderRow.schedule_id,
      scheduleStartAt: orderRow.schedule_start_at ?? null,
      peopleCount: orderRow.people_count,
      contactName: orderRow.contact_name ?? null,
    } : null,
  };
}

function scheduleRowToTarget(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    capacity: row.capacity,
    bookedCount: row.booked_count,
  };
}

async function expireRescheduleRowBestEffort(supabase, row, now) {
  try {
    await supabase
      .from('reschedule_requests')
      .update({ status: 'expired', resolved_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', row.id)
      .eq('status', 'requested');
    await supabase
      .from('orders')
      .update({ status: row.prior_order_status, updated_at: now.toISOString() })
      .eq('id', row.order_id)
      .eq('status', 'reschedule_requested');
    await insertAuditLogDb(supabase, {
      orderId: row.order_id,
      actor: 'system',
      action: 'reschedule_expired',
      metadata: { rescheduleRequestId: row.id },
    });
    row.status = 'expired';
    row.resolved_at = now.toISOString();
  } catch { /* best-effort lazy expire */ }
}

export async function createRescheduleRequestDb(input = {}) {
  if (!hasSupabaseEnv()) return createRescheduleRequestInMemory(input);

  const orderId = String(input?.orderId || '').trim();
  const requestId = String(input?.requestId || '').trim();
  const toScheduleId = String(input?.toScheduleId || '').trim();
  const contactEmail = String(input?.contactEmail || '').trim();
  if (!orderId || !requestId || !toScheduleId) throw new Error('BAD_REQUEST: orderId/requestId/toScheduleId required');

  const supabase = await getSupabase();
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, contact_email, contact_name, schedule_id, people_count, activity_id')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError || !order) throw new Error('ORDER_NOT_FOUND: order not found');
  if (contactEmail && order.contact_email && order.contact_email !== contactEmail) {
    throw new Error('ORDER_NOT_FOUND: order not found');
  }

  const { data: existing } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('order_id', orderId)
    .eq('request_id', requestId)
    .maybeSingle();
  if (existing) return mapRescheduleRow(existing, order);

  const now = new Date();
  const { data: priorRows } = await supabase
    .from('reschedule_requests')
    .select('id, order_id, status, requested_at, prior_order_status')
    .eq('order_id', orderId);
  for (const row of priorRows ?? []) {
    if (row.status === 'requested' && isRescheduleRequestExpired(row.requested_at, now)) {
      await expireRescheduleRowBestEffort(supabase, row, now);
    }
  }

  const { data: fromSchedule } = await supabase
    .from('activity_schedules')
    .select('id, status, start_at, end_at, capacity, booked_count')
    .eq('id', order.schedule_id)
    .maybeSingle();

  const verdict = canRequestReschedule({
    orderStatus: order.status,
    scheduleStartAt: fromSchedule?.start_at,
    now,
    approvedCount: (priorRows ?? []).filter((r) => r.status === 'approved').length,
    hasPendingRequest: (priorRows ?? []).some((r) => r.status === 'requested'),
  });
  if (!verdict.ok) throw new Error(`${verdict.code}: ${verdict.message}`);

  const { data: targetRow } = await supabase
    .from('activity_schedules')
    .select('id, status, start_at, end_at, capacity, booked_count, activity_id')
    .eq('id', toScheduleId)
    .maybeSingle();
  if (targetRow && targetRow.activity_id !== order.activity_id) {
    throw new Error('SLOT_NOT_FOUND: target slot belongs to another activity');
  }
  const targetVerdict = isRescheduleTargetValid({
    fromScheduleId: order.schedule_id,
    target: scheduleRowToTarget(targetRow),
    peopleCount: order.people_count,
    now,
  });
  if (!targetVerdict.ok) throw new Error(`${targetVerdict.code}: ${targetVerdict.message}`);

  const { data: inserted, error: insertError } = await supabase
    .from('reschedule_requests')
    .insert({
      order_id: orderId,
      request_id: requestId,
      from_schedule_id: order.schedule_id,
      to_schedule_id: toScheduleId,
      from_start_at: fromSchedule?.start_at ?? null,
      to_start_at: targetRow?.start_at ?? null,
      status: 'requested',
      prior_order_status: order.status,
      requested_at: now.toISOString(),
    })
    .select('*')
    .single();
  if (insertError) {
    // unique (order_id, request_id) 競態 → 冪等回讀
    if (insertError.code === '23505') {
      const { data: raced } = await supabase
        .from('reschedule_requests')
        .select('*')
        .eq('order_id', orderId)
        .eq('request_id', requestId)
        .maybeSingle();
      if (raced) return mapRescheduleRow(raced, order);
    }
    throw new Error(insertError.message);
  }

  const { error: orderUpdateError } = await supabase
    .from('orders')
    .update({ status: 'reschedule_requested', updated_at: now.toISOString() })
    .eq('id', orderId)
    .eq('status', order.status);
  if (orderUpdateError) throw new Error(orderUpdateError.message);

  await insertAuditLogDb(supabase, {
    orderId,
    actor: 'user',
    action: 'reschedule_requested',
    metadata: { rescheduleRequestId: inserted.id, fromScheduleId: order.schedule_id, toScheduleId },
  });

  return mapRescheduleRow(inserted, { ...order, status: 'reschedule_requested' });
}

export async function listRescheduleOptionsDb(input = {}) {
  if (!hasSupabaseEnv()) return listRescheduleOptionsInMemory(input);

  const orderId = String(input?.orderId || '').trim();
  const contactEmail = String(input?.contactEmail || '').trim();
  const supabase = await getSupabase();

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, contact_email, schedule_id, people_count, activity_id')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !order) throw new Error('ORDER_NOT_FOUND: order not found');
  if (contactEmail && order.contact_email && order.contact_email !== contactEmail) {
    throw new Error('ORDER_NOT_FOUND: order not found');
  }

  const now = new Date();
  const { data: rows } = await supabase
    .from('activity_schedules')
    .select('id, status, start_at, end_at, capacity, booked_count')
    .eq('activity_id', order.activity_id)
    .eq('status', 'open')
    .gt('start_at', now.toISOString())
    .order('start_at', { ascending: true });

  return (rows ?? [])
    .filter((row) => isRescheduleTargetValid({
      fromScheduleId: order.schedule_id,
      target: scheduleRowToTarget(row),
      peopleCount: order.people_count,
      now,
    }).ok)
    .map((row) => ({
      id: row.id,
      startAt: row.start_at,
      endAt: row.end_at,
      capacityLeft: Number(row.capacity ?? 0) > 0 ? Number(row.capacity) - Number(row.booked_count ?? 0) : null,
    }));
}

export async function decideRescheduleRequestDb(input = {}) {
  if (!hasSupabaseEnv()) return decideRescheduleRequestInMemory(input);

  const requestId = String(input?.requestId || '').trim();
  const action = String(input?.action || '').trim();
  const resolver = String(input?.resolver || 'guide').trim();
  const note = String(input?.note || '').trim();
  if (!['approve', 'reject'].includes(action)) throw new Error('BAD_REQUEST: invalid action');

  const supabase = await getSupabase();
  const { data: row, error } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (error || !row) throw new Error('REQUEST_NOT_FOUND: reschedule request not found');

  const now = new Date();
  if (row.status === 'requested' && isRescheduleRequestExpired(row.requested_at, now)) {
    await expireRescheduleRowBestEffort(supabase, row, now);
  }
  if (row.status !== 'requested') throw new Error(`REQUEST_NOT_PENDING: request is ${row.status}`);

  if (action === 'reject') {
    const { error: updError } = await supabase
      .from('reschedule_requests')
      .update({ status: 'rejected', resolver, note: note || null, resolved_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', requestId)
      .eq('status', 'requested');
    if (updError) throw new Error(updError.message);
    await supabase
      .from('orders')
      .update({ status: row.prior_order_status, updated_at: now.toISOString() })
      .eq('id', row.order_id)
      .eq('status', 'reschedule_requested');
    await insertAuditLogDb(supabase, {
      orderId: row.order_id,
      action: 'reschedule_rejected',
      metadata: { rescheduleRequestId: row.id, note },
    });
    const { data: orderRow } = await supabase
      .from('orders')
      .select('id, status, schedule_id, people_count, contact_name')
      .eq('id', row.order_id)
      .maybeSingle();
    return mapRescheduleRow({ ...row, status: 'rejected', resolver, note, resolved_at: now.toISOString() }, orderRow);
  }

  // approve — 原子性交給 RPC（鎖定/容量檢查/雙場次轉移/狀態回復/audit 同一交易）
  const { error: rpcError } = await supabase.rpc('fn_reschedule_booking_atomic', {
    p_request_id: requestId,
    p_resolver: resolver,
  });
  if (rpcError) throw new Error(rpcError.message);

  const { data: updatedRow } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  const { data: orderRow } = await supabase
    .from('orders')
    .select('id, status, schedule_id, people_count, contact_name')
    .eq('id', row.order_id)
    .maybeSingle();
  return mapRescheduleRow(updatedRow ?? row, orderRow);
}

export async function withdrawRescheduleRequestDb(input = {}) {
  if (!hasSupabaseEnv()) return withdrawRescheduleRequestInMemory(input);

  const requestId = String(input?.requestId || '').trim();
  const contactEmail = String(input?.contactEmail || '').trim();
  const supabase = await getSupabase();

  const { data: row, error } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (error || !row) throw new Error('REQUEST_NOT_FOUND: reschedule request not found');

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, contact_email, schedule_id, people_count, contact_name')
    .eq('id', row.order_id)
    .maybeSingle();
  if (!order) throw new Error('ORDER_NOT_FOUND: order not found');
  if (contactEmail && order.contact_email && order.contact_email !== contactEmail) {
    throw new Error('REQUEST_NOT_FOUND: reschedule request not found');
  }

  const now = new Date();
  if (row.status === 'requested' && isRescheduleRequestExpired(row.requested_at, now)) {
    await expireRescheduleRowBestEffort(supabase, row, now);
  }
  if (row.status !== 'requested') throw new Error(`REQUEST_NOT_PENDING: request is ${row.status}`);

  const { error: updError } = await supabase
    .from('reschedule_requests')
    .update({ status: 'withdrawn', resolved_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', requestId)
    .eq('status', 'requested');
  if (updError) throw new Error(updError.message);
  await supabase
    .from('orders')
    .update({ status: row.prior_order_status, updated_at: now.toISOString() })
    .eq('id', row.order_id)
    .eq('status', 'reschedule_requested');
  await insertAuditLogDb(supabase, {
    orderId: row.order_id,
    actor: 'user',
    action: 'reschedule_withdrawn',
    metadata: { rescheduleRequestId: row.id },
  });
  return mapRescheduleRow({ ...row, status: 'withdrawn', resolved_at: now.toISOString() }, { ...order, status: row.prior_order_status });
}

export async function listGuideRescheduleRequestsDb(input = {}) {
  if (!hasSupabaseEnv()) return listGuideRescheduleRequestsInMemory(input);

  const guideId = String(input?.guideId || '').trim();
  const supabase = await getSupabase();
  const now = new Date();

  const { data: rows, error } = await supabase
    .from('reschedule_requests')
    .select('*, orders!inner(id, status, schedule_id, people_count, contact_name, activity_id, activities!inner(id, title, guide_id))')
    .order('requested_at', { ascending: false });
  if (error) throw new Error(error.message);

  const result = [];
  for (const row of rows ?? []) {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    const activity = order ? (Array.isArray(order.activities) ? order.activities[0] : order.activities) : null;
    if (guideId && activity?.guide_id !== guideId) continue;
    if (row.status === 'requested' && isRescheduleRequestExpired(row.requested_at, now)) {
      await expireRescheduleRowBestEffort(supabase, row, now);
      if (order) order.status = row.prior_order_status;
    }
    result.push({
      ...mapRescheduleRow(row, order),
      activityTitle: activity?.title ?? null,
    });
  }
  return result;
}
