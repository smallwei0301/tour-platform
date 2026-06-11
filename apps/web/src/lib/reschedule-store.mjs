/**
 * Issue #1383 — 改期流程的 in-memory fallback 實作（單執行緒語意）。
 * 規則一律來自 reschedule.mjs 純函式；Supabase 分支見 db.mjs（原子性由 RPC 保證）。
 */
import { orders, experiences, rescheduleRequests } from './store.mjs';
import { appendAuditLog } from './audit-log.mjs';
import {
  canRequestReschedule,
  isRescheduleTargetValid,
  isRescheduleRequestExpired,
} from './reschedule.mjs';

function err(code, message) {
  return new Error(`${code}: ${message}`);
}

function findOrderOwned(orderId, contactEmail) {
  const order = orders.find((o) => o.id === String(orderId || '').trim());
  if (!order) throw err('ORDER_NOT_FOUND', 'order not found');
  if (contactEmail && order.contactEmail && order.contactEmail !== contactEmail) {
    throw err('ORDER_NOT_FOUND', 'order not found');
  }
  return order;
}

function findExperienceForOrder(order) {
  const exp = experiences.find((e) => e.id === order.experienceId || e.slug === order.experienceSlug);
  if (!exp) throw err('ACTIVITY_NOT_FOUND', 'activity not found');
  return exp;
}

function mapRequest(r, order) {
  return {
    id: r.id,
    orderId: r.orderId,
    status: r.status,
    fromScheduleId: r.fromScheduleId,
    toScheduleId: r.toScheduleId,
    fromStartAt: r.fromStartAt ?? null,
    toStartAt: r.toStartAt ?? null,
    requestedAt: r.requestedAt,
    resolvedAt: r.resolvedAt ?? null,
    resolver: r.resolver ?? null,
    note: r.note ?? '',
    priorOrderStatus: r.priorOrderStatus,
    orderStatus: order.status,
    order: {
      id: order.id,
      scheduleId: order.scheduleId,
      scheduleStartAt: order.scheduleStartAt,
      peopleCount: order.peopleCount,
      contactName: order.contactName,
      experienceSlug: order.experienceSlug,
    },
  };
}

/** guide 72h 未處理 → lazy expire（讀取/決策時觸發，訂單回原狀態）。 */
function lazyExpire(r, order, now) {
  if (r.status !== 'requested') return;
  if (!isRescheduleRequestExpired(r.requestedAt, now)) return;
  r.status = 'expired';
  r.resolvedAt = new Date(now).toISOString();
  order.status = r.priorOrderStatus;
  appendAuditLog({
    orderId: order.id,
    action: 'reschedule_expired',
    metadata: { rescheduleRequestId: r.id, fromScheduleId: r.fromScheduleId, toScheduleId: r.toScheduleId },
  });
}

export function createRescheduleRequestInMemory({ orderId, requestId, toScheduleId, contactEmail } = {}) {
  const reqId = String(requestId || '').trim();
  if (!reqId) throw err('BAD_REQUEST', 'requestId is required');
  const order = findOrderOwned(orderId, contactEmail);
  const now = new Date();

  const existing = rescheduleRequests.find((r) => r.orderId === order.id && r.requestId === reqId);
  if (existing) return mapRequest(existing, order);

  for (const r of rescheduleRequests.filter((x) => x.orderId === order.id)) lazyExpire(r, order, now);

  const verdictInput = {
    orderStatus: order.status,
    now,
    approvedCount: rescheduleRequests.filter((r) => r.orderId === order.id && r.status === 'approved').length,
    hasPendingRequest: rescheduleRequests.some((r) => r.orderId === order.id && r.status === 'requested'),
  };
  const exp = findExperienceForOrder(order);
  const fromSchedule = (exp.schedules || []).find((s) => s.id === order.scheduleId);
  const verdict = canRequestReschedule({ ...verdictInput, scheduleStartAt: fromSchedule?.startAt });
  if (!verdict.ok) throw err(verdict.code, verdict.message);

  const target = (exp.schedules || []).find((s) => s.id === String(toScheduleId || '').trim()) || null;
  const targetVerdict = isRescheduleTargetValid({
    fromScheduleId: order.scheduleId,
    target,
    peopleCount: order.peopleCount,
    now,
  });
  if (!targetVerdict.ok) throw err(targetVerdict.code, targetVerdict.message);

  const request = {
    id: `res_${String(rescheduleRequests.length + 1).padStart(6, '0')}`,
    orderId: order.id,
    requestId: reqId,
    fromScheduleId: order.scheduleId,
    toScheduleId: target.id,
    fromStartAt: fromSchedule?.startAt ?? null,
    toStartAt: target.startAt ?? null,
    status: 'requested',
    requestedAt: now.toISOString(),
    resolvedAt: null,
    resolver: null,
    note: '',
    priorOrderStatus: order.status,
    amountDeltaTwd: 0,
  };
  rescheduleRequests.push(request);
  order.status = 'reschedule_requested';
  order.updatedAt = now.toISOString();

  appendAuditLog({
    orderId: order.id,
    actor: 'user',
    action: 'reschedule_requested',
    metadata: { rescheduleRequestId: request.id, fromScheduleId: request.fromScheduleId, toScheduleId: request.toScheduleId },
  });

  return mapRequest(request, order);
}

export function listRescheduleOptionsInMemory({ orderId, contactEmail } = {}) {
  const order = findOrderOwned(orderId, contactEmail);
  const exp = findExperienceForOrder(order);
  const now = new Date();
  return (exp.schedules || [])
    .filter((s) => isRescheduleTargetValid({
      fromScheduleId: order.scheduleId,
      target: s,
      peopleCount: order.peopleCount,
      now,
    }).ok)
    .map((s) => ({
      id: s.id,
      startAt: s.startAt,
      endAt: s.endAt,
      capacityLeft: Number(s.capacity ?? 0) > 0 ? Number(s.capacity) - Number(s.bookedCount ?? 0) : null,
    }));
}

export function decideRescheduleRequestInMemory({ requestId, action, resolver = 'guide', note = '' } = {}) {
  const r = rescheduleRequests.find((x) => x.id === String(requestId || '').trim());
  if (!r) throw err('REQUEST_NOT_FOUND', 'reschedule request not found');
  const order = findOrderOwned(r.orderId);
  const now = new Date();

  lazyExpire(r, order, now);
  if (r.status !== 'requested') throw err('REQUEST_NOT_PENDING', `request is ${r.status}`);
  if (!['approve', 'reject'].includes(action)) throw err('BAD_REQUEST', 'invalid action');

  if (action === 'reject') {
    r.status = 'rejected';
    r.resolvedAt = now.toISOString();
    r.resolver = resolver;
    r.note = note || '';
    order.status = r.priorOrderStatus;
    order.updatedAt = now.toISOString();
    appendAuditLog({
      orderId: order.id,
      action: 'reschedule_rejected',
      metadata: { rescheduleRequestId: r.id, note: r.note },
    });
    return mapRequest(r, order);
  }

  // approve：先驗證再轉移（單執行緒下即原子；任何失敗點之前無任何變更）
  const exp = findExperienceForOrder(order);
  const from = (exp.schedules || []).find((s) => s.id === r.fromScheduleId);
  const to = (exp.schedules || []).find((s) => s.id === r.toScheduleId) || null;
  const targetVerdict = isRescheduleTargetValid({
    fromScheduleId: r.fromScheduleId,
    target: to,
    peopleCount: order.peopleCount,
    now,
  });
  if (!targetVerdict.ok) throw err(targetVerdict.code, targetVerdict.message);

  const people = Number(order.peopleCount || 0);
  to.bookedCount = Number(to.bookedCount ?? 0) + people;
  if (Number(to.capacity ?? 0) > 0 && to.bookedCount >= to.capacity) to.status = 'full';
  if (from) {
    from.bookedCount = Math.max(0, Number(from.bookedCount ?? 0) - people);
    if (from.status === 'full' && Number(from.capacity ?? 0) > 0 && from.bookedCount < from.capacity) {
      from.status = 'open';
    }
  }

  order.scheduleId = to.id;
  order.scheduleStartAt = to.startAt;
  order.scheduleEndAt = to.endAt;
  order.status = r.priorOrderStatus;
  order.updatedAt = now.toISOString();

  r.status = 'approved';
  r.resolvedAt = now.toISOString();
  r.resolver = resolver;
  r.note = note || '';

  appendAuditLog({
    orderId: order.id,
    action: 'reschedule_approved',
    metadata: {
      rescheduleRequestId: r.id,
      fromScheduleId: r.fromScheduleId,
      toScheduleId: r.toScheduleId,
      fromStartAt: r.fromStartAt,
      toStartAt: r.toStartAt,
    },
  });

  return mapRequest(r, order);
}

export function withdrawRescheduleRequestInMemory({ requestId, contactEmail } = {}) {
  const r = rescheduleRequests.find((x) => x.id === String(requestId || '').trim());
  if (!r) throw err('REQUEST_NOT_FOUND', 'reschedule request not found');
  const order = findOrderOwned(r.orderId, contactEmail);
  const now = new Date();

  lazyExpire(r, order, now);
  if (r.status !== 'requested') throw err('REQUEST_NOT_PENDING', `request is ${r.status}`);

  r.status = 'withdrawn';
  r.resolvedAt = now.toISOString();
  order.status = r.priorOrderStatus;
  order.updatedAt = now.toISOString();
  appendAuditLog({
    orderId: order.id,
    actor: 'user',
    action: 'reschedule_withdrawn',
    metadata: { rescheduleRequestId: r.id },
  });
  return mapRequest(r, order);
}

export function listGuideRescheduleRequestsInMemory({ guideSlug } = {}) {
  const now = new Date();
  const guideExperiences = new Set(
    experiences.filter((e) => !guideSlug || e.guideSlug === guideSlug).map((e) => e.id)
  );
  return rescheduleRequests
    .filter((r) => {
      const order = orders.find((o) => o.id === r.orderId);
      return order && guideExperiences.has(order.experienceId);
    })
    .map((r) => {
      const order = orders.find((o) => o.id === r.orderId);
      lazyExpire(r, order, now);
      return mapRequest(r, order);
    })
    .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
}
