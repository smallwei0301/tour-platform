import { experiences, orders, payments, refundRequests, guideApplications, auditLogs } from './store.mjs';

function appendAuditLog({ orderId = null, actor = 'system', action, metadata = {} }) {
  if (!action) return;
  auditLogs.push({
    id: `aud_${String(auditLogs.length + 1).padStart(6, '0')}`,
    orderId: orderId || null,
    actor,
    action,
    metadata,
    createdAt: new Date().toISOString(),
  });
}

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
    paidAt: null,
    adminNote: null,
    updatedAt: null
  };

  orders.push(order);

  appendAuditLog({
    orderId: order.id,
    actor: 'user',
    action: 'order_created',
    metadata: {
      experienceSlug: order.experienceSlug,
      scheduleId: order.scheduleId,
      peopleCount: order.peopleCount,
      status: order.status,
    },
  });

  return order;
}

export function cancelOrder(input = {}) {
  const orderId = normalizeSlug(input?.orderId);
  const contactEmail = normalizeSlug(input?.contactEmail);

  if (!orderId) throw new Error('orderId is required');
  if (!contactEmail) throw new Error('contactEmail is required');

  const order = orders.find((o) => o.id === orderId && o.contactEmail === contactEmail);
  if (!order) throw new Error('order not found');
  if (order.status !== 'pending_payment') throw new Error('only pending_payment orders can be cancelled by user');

  order.status = 'cancelled_by_user';
  order.updatedAt = new Date().toISOString();

  appendAuditLog({
    orderId: order.id,
    actor: 'user',
    action: 'order_cancelled_by_user',
    metadata: {
      previousStatus: 'pending_payment',
      status: order.status,
    },
  });

  return { id: order.id, status: order.status };
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
  const requestId = normalizeSlug(input?.requestId);

  if (!orderId) throw new Error('orderId is required');
  if (!requestId) throw new Error('requestId is required');

  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('order not found');

  if (contactEmail && order.contactEmail && order.contactEmail !== contactEmail) {
    throw new Error('order not found');
  }

  if (['cancelled_by_user', 'cancelled_by_guide', 'refunded'].includes(order.status)) {
    throw new Error('order cannot request refund in current status');
  }

  const existingByRequest = refundRequests.find((r) => r.orderId === orderId && r.requestId === requestId);
  if (existingByRequest) {
    return {
      ...existingByRequest,
      orderStatus: order.status,
      idempotentReplay: true,
    };
  }

  const existing = refundRequests.find((r) => r.orderId === orderId && !['rejected', 'refunded'].includes(r.status));
  if (existing) throw new Error('refund already requested');

  const request = {
    id: `ref_${String(refundRequests.length + 1).padStart(6, '0')}`,
    orderId,
    reason,
    note,
    requestId,
    status: 'requested',
    requestedAt: new Date().toISOString(),
    approvedAt: null,
    refundedAt: null
  };

  refundRequests.push(request);
  order.status = 'refund_pending';

  appendAuditLog({
    orderId: order.id,
    actor: 'user',
    action: 'refund_requested',
    metadata: {
      refundRequestId: request.id,
      requestId,
      reason,
      previousOrderStatus: 'pending_payment',
      orderStatus: order.status,
    },
  });

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

export function createGuideApplication(input = {}) {
  const fullName = normalizeSlug(input?.fullName);
  const phone = normalizeSlug(input?.phone);
  const email = normalizeSlug(input?.email);
  const city = normalizeSlug(input?.city);
  const bio = normalizeSlug(input?.bio);

  if (!fullName) throw new Error('fullName is required');
  if (!phone) throw new Error('phone is required');
  if (!email) throw new Error('email is required');
  if (!city) throw new Error('city is required');
  if (!bio) throw new Error('bio is required');

  const existing = guideApplications.find((a) => a.email === email && ['pending', 'approved'].includes(a.status));
  if (existing) throw new Error('application already exists');

  const row = {
    id: `ga_${String(guideApplications.length + 1).padStart(6, '0')}`,
    fullName,
    phone,
    email,
    city,
    bio,
    status: 'pending',
    adminNote: null,
    createdAt: new Date().toISOString(),
    updatedAt: null
  };

  guideApplications.push(row);
  return row;
}

export function listGuideApplications(input = {}) {
  const status = normalizeSlug(input?.status);
  return guideApplications
    .filter((a) => (status ? a.status === status : true))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function updateGuideApplicationStatus(input = {}) {
  const applicationId = normalizeSlug(input?.applicationId);
  const action = normalizeSlug(input?.action);
  const adminNote = normalizeSlug(input?.adminNote) || null;

  if (!applicationId) throw new Error('applicationId is required');
  if (!['approve', 'reject', 'suspend'].includes(action)) throw new Error('invalid guide action');

  const row = guideApplications.find((a) => a.id === applicationId);
  if (!row) throw new Error('application not found');

  if (action === 'approve') row.status = 'approved';
  if (action === 'reject') row.status = 'rejected';
  if (action === 'suspend') row.status = 'suspended';

  row.adminNote = adminNote;
  row.updatedAt = new Date().toISOString();
  return row;
}

export function processPaymentCallback(input) {
  const orderId = normalizeSlug(input?.orderId);
  if (!orderId) throw new Error('orderId is required');

  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('order not found');

  const simulatePaid = String(input?.SimulatePaid ?? input?.simulatePaid ?? '').trim() === '1';
  if (simulatePaid) {
    appendAuditLog({
      orderId: order.id,
      actor: 'system',
      action: 'payment_callback_simulate_paid_noop',
      metadata: {
        event_type: 'payment_callback_simulate_paid_noop',
        source: 'payment/ecpay_callback',
        provider: 'ecpay',
        order_id: order.id,
        trade_no: normalizeSlug(input?.tradeNo || input?.TradeNo) || null,
        order_status: order.status,
        callback_received_at: new Date().toISOString(),
      },
    });

    return { order, scheduleUpdated: false, simulated: true };
  }

  const ownerEmail = normalizeSlug(input?.ownerEmail).toLowerCase();
  const contactEmail = normalizeSlug(order.contactEmail).toLowerCase();
  if (ownerEmail && contactEmail && ownerEmail !== contactEmail) {
    throw new Error('order ownership validation failed');
  }

  // idempotent: if already paid, return without double seat booking
  if (order.status === 'paid' || order.status === 'confirmed' || order.status === 'completed') {
    appendAuditLog({
      orderId: order.id,
      actor: 'system',
      action: 'payment_callback_replay_noop',
      metadata: {
        event_type: 'payment_callback_replay_noop',
        source: 'payment/ecpay_callback',
        provider: 'ecpay',
        order_id: order.id,
        trade_no: normalizeSlug(input?.tradeNo) || null,
        order_status: order.status,
        callback_received_at: new Date().toISOString(),
      },
    });

    return { order, scheduleUpdated: false };
  }

  // legal one-way transition guard for callback path
  if (order.status !== 'pending_payment') {
    throw new Error(`illegal order status transition in callback: ${order.status} -> paid`);
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

  const tradeNo = normalizeSlug(input?.tradeNo) || null;
  payments.push({
    id: `pay_${String(payments.length + 1).padStart(6, '0')}`,
    orderId: order.id,
    provider: 'ecpay',
    tradeNo,
    amountTwd: order.totalTwd,
    status: 'paid',
    paidAt: order.paidAt,
    raw: input || null
  });

  appendAuditLog({
    orderId: order.id,
    actor: 'system',
    action: 'payment_callback_succeeded',
    metadata: {
      event_type: 'payment_callback_succeeded',
      source: 'payment/ecpay_callback',
      provider: 'ecpay',
      order_id: order.id,
      trade_no: tradeNo,
      order_status_before: 'pending_payment',
      order_status_after: 'paid',
      callback_received_at: order.paidAt,
    },
  });

  return { order, scheduleUpdated: true, schedule };
}
