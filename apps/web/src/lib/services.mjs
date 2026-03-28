import { experiences, orders, payments, refundRequests } from './store.mjs';

function normalizeSlug(slug) {
  return String(slug || '').trim();
}

function findExperienceBySlug(slug) {
  const target = normalizeSlug(slug);
  return experiences.find(
    (e) => e.slug === target || (Array.isArray(e.aliases) && e.aliases.includes(target))
  );
}

function ensureScheduleOpen(schedule) {
  if (!schedule) throw new Error('schedule not found');
  if (schedule.status === 'full') throw new Error('schedule is full');
  if (schedule.status !== 'open') throw new Error('schedule is not open');
}

export function listExperiences() {
  return experiences.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    priceTwd: e.priceTwd,
    guideSlug: e.guideSlug,
    nextAvailableSchedule: e.schedules.find((s) => s.status === 'open') || null,
    schedules: e.schedules
  }));
}

export function createOrder(input) {
  const experienceSlug = normalizeSlug(input?.experienceSlug);
  const scheduleId = normalizeSlug(input?.scheduleId);
  const peopleCount = Number(input?.peopleCount || 0);

  if (!experienceSlug) throw new Error('experienceSlug is required');
  if (!scheduleId) throw new Error('scheduleId is required');
  if (!Number.isInteger(peopleCount) || peopleCount < 1) {
    throw new Error('peopleCount must be a positive integer');
  }

  const contactName = normalizeSlug(input?.contactName);
  const contactPhone = normalizeSlug(input?.contactPhone);
  const contactEmail = normalizeSlug(input?.contactEmail);

  if (!contactName) throw new Error('contactName is required');
  if (!contactPhone) throw new Error('contactPhone is required');
  if (!contactEmail) throw new Error('contactEmail is required');

  const exp = findExperienceBySlug(experienceSlug);
  if (!exp) throw new Error('experience not found');

  const schedule = exp.schedules.find((s) => s.id === scheduleId);
  ensureScheduleOpen(schedule);

  const remaining = schedule.capacity - schedule.bookedCount;
  if (peopleCount > remaining) {
    throw new Error('not enough seats');
  }

  const order = {
    id: `ord_${String(orders.length + 1).padStart(6, '0')}`,
    experienceId: exp.id,
    experienceSlug: exp.slug,
    scheduleId: schedule.id,
    scheduleStartAt: schedule.startAt,
    scheduleEndAt: schedule.endAt,
    peopleCount,
    status: 'pending_payment',
    totalTwd: exp.priceTwd * peopleCount,
    contactName,
    contactPhone,
    contactEmail,
    createdAt: new Date().toISOString(),
    paidAt: null
  };

  orders.push(order);
  return order;
}

export function listMyOrders(input = {}) {
  const contactEmail = String(input?.contactEmail || '').trim();

  const rows = orders
    .filter((o) => (contactEmail ? o.contactEmail === contactEmail : true))
    .map((o) => {
      const exp = experiences.find((e) => e.id === o.experienceId);
      const schedule = exp?.schedules?.find((s) => s.id === o.scheduleId);
      const refund = refundRequests
        .filter((r) => r.orderId === o.id)
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())[0] || null;
      return {
        ...o,
        title: exp?.title || o.experienceSlug,
        guideSlug: exp?.guideSlug || null,
        schedule: schedule || null,
        refund
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return rows;
}

export function getMyOrderDetail(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  const rows = listMyOrders({ contactEmail: input?.contactEmail || '' });
  const target = rows.find((o) => o.id === orderId);
  if (!target) throw new Error('order not found');
  return target;
}

export function createRefundRequest(input = {}) {
  const orderId = normalizeSlug(input?.orderId);
  const reason = normalizeSlug(input?.reason) || 'user_request';
  const note = normalizeSlug(input?.note) || '';
  const contactEmail = normalizeSlug(input?.contactEmail) || '';

  if (!orderId) throw new Error('orderId is required');

  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('order not found');

  if (contactEmail && order.contactEmail && order.contactEmail !== contactEmail) {
    throw new Error('order not found');
  }

  if (['cancelled_by_user', 'cancelled_by_guide', 'refunded'].includes(order.status)) {
    throw new Error('order cannot request refund in current status');
  }

  const existing = refundRequests.find((r) => r.orderId === orderId && !['rejected', 'refunded'].includes(r.status));
  if (existing) throw new Error('refund already requested');

  const request = {
    id: `ref_${String(refundRequests.length + 1).padStart(6, '0')}`,
    orderId,
    reason,
    note,
    status: 'requested',
    requestedAt: new Date().toISOString(),
    approvedAt: null,
    refundedAt: null
  };

  refundRequests.push(request);
  order.status = 'refund_pending';

  return {
    ...request,
    orderStatus: order.status
  };
}

export function listRefundRequests(input = {}) {
  const orderId = normalizeSlug(input?.orderId);
  return refundRequests
    .filter((r) => (orderId ? r.orderId === orderId : true))
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

export function processPaymentCallback(input) {
  const orderId = normalizeSlug(input?.orderId);
  if (!orderId) throw new Error('orderId is required');

  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('order not found');

  // idempotent: if already paid, return without double seat booking
  if (order.status === 'paid' || order.status === 'confirmed' || order.status === 'completed') {
    return { order, scheduleUpdated: false };
  }

  const exp = experiences.find((e) => e.id === order.experienceId);
  if (!exp) throw new Error('experience not found for order');
  const schedule = exp.schedules.find((s) => s.id === order.scheduleId);
  if (!schedule) throw new Error('schedule not found for order');

  const remaining = schedule.capacity - schedule.bookedCount;
  if (order.peopleCount > remaining) {
    throw new Error('schedule seats exhausted before payment confirmation');
  }

  schedule.bookedCount += order.peopleCount;
  if (schedule.bookedCount >= schedule.capacity) {
    schedule.status = 'full';
  }

  order.status = 'paid';
  order.paidAt = new Date().toISOString();

  payments.push({
    id: `pay_${String(payments.length + 1).padStart(6, '0')}`,
    orderId: order.id,
    provider: 'ecpay',
    tradeNo: normalizeSlug(input?.tradeNo) || null,
    amountTwd: order.totalTwd,
    status: 'paid',
    paidAt: order.paidAt,
    raw: input || null
  });

  return { order, scheduleUpdated: true, schedule };
}
