import { orders, refundRequests, experiences, auditLogs, operationsTracking } from './store.mjs';

export function listAdminOrdersFallback(input = {}) {
  const status = String(input?.status || '').trim();
  const contactEmail = String(input?.contactEmail || '').trim();

  return orders
    .filter((o) => (status ? o.status === status : true))
    .filter((o) => (contactEmail ? o.contactEmail === contactEmail : true))
    .map((o) => {
      const costTwd = Math.round(o.totalTwd * 0.65);
      const exp = experiences.find((e) => e.id === o.experienceId);
      return {
        id: o.id,
        status: o.status,
        totalTwd: o.totalTwd,
        costTwd,
        marginTwd: o.totalTwd - costTwd,
        title: exp?.title || o.experienceSlug || null,
        experienceSlug: o.experienceSlug,
        peopleCount: o.peopleCount || 1,
        scheduleStartAt: o.scheduleStartAt || null,
        contactName: o.contactName || null,
        contactPhone: o.contactPhone || null,
        contactEmail: o.contactEmail || null,
        adminNote: o.adminNote || null,
        createdAt: o.createdAt || null,
        paidAt: o.paidAt || null,
        updatedAt: o.updatedAt || null
      };
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

export function getAdminOrderDetailFallback(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  const row = listAdminOrdersFallback().find((o) => o.id === orderId);
  if (!row) throw new Error('order not found');
  return row;
}

export function updateAdminOrderFallback(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  const status = String(input?.status || '').trim();
  const adminNote = String(input?.adminNote || '').trim();

  if (!orderId) throw new Error('orderId is required');

  const validStatuses = [
    'pending_payment',
    'paid',
    'confirmed',
    'rejected',
    'cancelled_by_user',
    'cancelled_by_guide',
    'completed',
    'refund_pending',
    'refunded'
  ];

  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('order not found');

  if (status) {
    if (!validStatuses.includes(status)) throw new Error('invalid order status');
    order.status = status;
  }

  if (adminNote || adminNote === '') {
    order.adminNote = adminNote || null;
  }

  order.updatedAt = new Date().toISOString();
  return getAdminOrderDetailFallback({ orderId });
}

export function listOrderAuditLogsFallback(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  return auditLogs
    .filter((l) => (orderId ? l.orderId === orderId : true))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function applyAdminOrderExceptionFallback(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  const action = String(input?.action || '').trim();
  const adminNote = String(input?.adminNote || '').trim() || null;

  if (!orderId) throw new Error('orderId is required');
  if (!['reschedule', 'adjust_capacity', 'oversell_fix'].includes(action)) {
    throw new Error('invalid exception action');
  }

  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('order not found');

  const exp = experiences.find((e) => e.id === order.experienceId);
  if (!exp) throw new Error('experience not found');

  const currentSchedule = exp.schedules.find((s) => s.id === order.scheduleId);
  const now = new Date().toISOString();

  if (action === 'reschedule') {
    const targetScheduleId = String(input?.targetScheduleId || '').trim();
    const target = exp.schedules.find((s) => s.id === targetScheduleId);
    if (!target) throw new Error('target schedule not found');

    if (currentSchedule && currentSchedule.id !== target.id && currentSchedule.bookedCount >= order.peopleCount) {
      currentSchedule.bookedCount -= order.peopleCount;
      if (currentSchedule.status === 'full' && currentSchedule.bookedCount < currentSchedule.capacity) {
        currentSchedule.status = 'open';
      }
    }

    const remaining = target.capacity - target.bookedCount;
    if (remaining < order.peopleCount) throw new Error('target schedule not enough seats');

    target.bookedCount += order.peopleCount;
    if (target.bookedCount >= target.capacity) target.status = 'full';

    order.scheduleId = target.id;
    order.scheduleStartAt = target.startAt;
    order.scheduleEndAt = target.endAt;
    order.updatedAt = now;
  }

  if (action === 'adjust_capacity') {
    const targetScheduleId = String(input?.targetScheduleId || '').trim() || order.scheduleId;
    const newCapacity = Number(input?.newCapacity || 0);
    if (!Number.isInteger(newCapacity) || newCapacity < 1) throw new Error('newCapacity must be positive integer');

    const target = exp.schedules.find((s) => s.id === targetScheduleId);
    if (!target) throw new Error('target schedule not found');

    if (newCapacity < target.bookedCount) throw new Error('newCapacity cannot be less than bookedCount');
    target.capacity = newCapacity;
    target.status = target.bookedCount >= target.capacity ? 'full' : 'open';
    order.updatedAt = now;
  }

  if (action === 'oversell_fix') {
    const targetScheduleId = String(input?.targetScheduleId || '').trim() || order.scheduleId;
    const target = exp.schedules.find((s) => s.id === targetScheduleId);
    if (!target) throw new Error('target schedule not found');

    if (target.bookedCount > target.capacity) {
      target.bookedCount = target.capacity;
      target.status = 'full';
    }
    order.updatedAt = now;
  }

  const log = {
    id: `aud_${String(auditLogs.length + 1).padStart(6, '0')}`,
    orderId: order.id,
    actor: 'admin',
    action,
    metadata: {
      targetScheduleId: input?.targetScheduleId || null,
      newCapacity: input?.newCapacity ?? null,
      adminNote
    },
    createdAt: now
  };
  auditLogs.push(log);

  if (adminNote) order.adminNote = adminNote;

  return {
    orderId: order.id,
    action,
    orderStatus: order.status,
    scheduleId: order.scheduleId,
    adminNote,
    auditLogId: log.id
  };
}

export function listAdminRefundRequestsFallback() {
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  return refundRequests
    .map((r) => {
      const order = orderMap.get(r.orderId);
      return {
        id: r.id,
        orderId: r.orderId,
        reason: r.reason,
        note: r.note,
        status: r.status,
        requestedAt: r.requestedAt,
        approvedAt: r.approvedAt,
        refundedAt: r.refundedAt,
        orderStatus: order?.status || null,
        totalTwd: order?.totalTwd || 0,
        contactName: order?.contactName || null,
        contactEmail: order?.contactEmail || null
      };
    })
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

export function updateAdminRefundStatusFallback(input = {}) {
  const refundRequestId = String(input?.refundRequestId || '').trim();
  const action = String(input?.action || '').trim();
  const adminNote = String(input?.adminNote || '').trim() || null;

  if (!refundRequestId) throw new Error('refundRequestId is required');
  if (!['approve', 'reject', 'process', 'complete'].includes(action)) {
    throw new Error('invalid refund action');
  }

  const req = refundRequests.find((r) => r.id === refundRequestId);
  if (!req) throw new Error('refund request not found');

  const order = orders.find((o) => o.id === req.orderId);
  if (!order) throw new Error('order not found');

  const now = new Date().toISOString();

  if (action === 'approve') {
    req.status = 'approved';
    req.approvedAt = now;
    order.status = 'refund_pending';
  } else if (action === 'reject') {
    req.status = 'rejected';
    order.status = order.paidAt ? 'paid' : 'pending_payment';
  } else if (action === 'process') {
    req.status = 'processing';
    order.status = 'refund_pending';
  } else if (action === 'complete') {
    req.status = 'refunded';
    req.refundedAt = now;
    order.status = 'refunded';
  }

  req.adminNote = adminNote;
  req.updatedAt = now;

  return {
    id: req.id,
    orderId: req.orderId,
    status: req.status,
    approvedAt: req.approvedAt,
    refundedAt: req.refundedAt,
    orderStatus: order.status,
    adminNote: req.adminNote
  };
}

function findOrCreateOpsRow(order) {
  let row = operationsTracking.find((r) => r.orderId === order.id);
  if (!row) {
    row = {
      id: `ops_${String(operationsTracking.length + 1).padStart(6, '0')}`,
      orderId: order.id,
      manualMinutes: 0,
      manualCostTwd: 0,
      refundAmountTwd: 0,
      subsidyTwd: 0,
      isRescheduled: false,
      hasComplaint: false,
      hasGuideAdjustment: false,
      hasOversellIssue: false,
      note: null,
      updatedAt: new Date().toISOString()
    };
    operationsTracking.push(row);
  }
  return row;
}

function buildOpsContribution(order, ops) {
  const gmv = Number(order.totalTwd || 0);
  const commissionTwd = Math.round(gmv * 0.15);
  const paymentFeeTwd = Math.round(gmv * 0.035);
  const manualCostTwd = Number(ops.manualCostTwd || 0);
  const refundAmountTwd = Number(ops.refundAmountTwd || 0);
  const subsidyTwd = Number(ops.subsidyTwd || 0);
  const finalContributionTwd = commissionTwd - paymentFeeTwd - manualCostTwd - refundAmountTwd - subsidyTwd;
  const hasException = Boolean(
    refundAmountTwd > 0 ||
    ops.isRescheduled ||
    ops.hasComplaint ||
    ops.hasGuideAdjustment ||
    ops.hasOversellIssue
  );
  const isHealthyOrder = finalContributionTwd > 0 && !hasException;

  return {
    gmv,
    commissionTwd,
    paymentFeeTwd,
    manualMinutes: Number(ops.manualMinutes || 0),
    manualCostTwd,
    refundAmountTwd,
    subsidyTwd,
    hasException,
    finalContributionTwd,
    isHealthyOrder
  };
}

export function listOperationsTrackingFallback() {
  return orders
    .map((o) => {
      const exp = experiences.find((e) => e.id === o.experienceId);
      const ops = findOrCreateOpsRow(o);
      const calc = buildOpsContribution(o, ops);
      return {
        orderId: o.id,
        orderDate: o.createdAt,
        guideName: exp?.guideSlug || null,
        activityName: exp?.title || o.experienceSlug,
        scheduleDate: o.scheduleStartAt || null,
        travelers: o.peopleCount || 1,
        status: o.status,
        ...calc,
        ...ops
      };
    })
    .sort((a, b) => new Date(b.orderDate || 0).getTime() - new Date(a.orderDate || 0).getTime());
}

export function updateOperationsTrackingFallback(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required');

  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('order not found');

  const ops = findOrCreateOpsRow(order);

  const assignNumber = (k) => {
    if (input[k] != null && input[k] !== '') ops[k] = Number(input[k]);
  };
  assignNumber('manualMinutes');
  assignNumber('manualCostTwd');
  assignNumber('refundAmountTwd');
  assignNumber('subsidyTwd');

  if (input.isRescheduled != null) ops.isRescheduled = Boolean(input.isRescheduled);
  if (input.hasComplaint != null) ops.hasComplaint = Boolean(input.hasComplaint);
  if (input.hasGuideAdjustment != null) ops.hasGuideAdjustment = Boolean(input.hasGuideAdjustment);
  if (input.hasOversellIssue != null) ops.hasOversellIssue = Boolean(input.hasOversellIssue);
  if (input.note != null) ops.note = String(input.note || '').trim() || null;

  ops.updatedAt = new Date().toISOString();

  const log = {
    id: `aud_${String(auditLogs.length + 1).padStart(6, '0')}`,
    orderId: order.id,
    actor: 'admin',
    action: 'operations_tracking_update',
    metadata: {
      manualMinutes: ops.manualMinutes,
      manualCostTwd: ops.manualCostTwd,
      refundAmountTwd: ops.refundAmountTwd,
      subsidyTwd: ops.subsidyTwd,
      isRescheduled: ops.isRescheduled,
      hasComplaint: ops.hasComplaint,
      hasGuideAdjustment: ops.hasGuideAdjustment,
      hasOversellIssue: ops.hasOversellIssue,
      note: ops.note
    },
    createdAt: ops.updatedAt
  };
  auditLogs.push(log);

  return listOperationsTrackingFallback().find((r) => r.orderId === orderId);
}

export function operationsTrackingSummaryFallback() {
  const rows = listOperationsTrackingFallback();
  const n = rows.length || 1;

  const sum = (k) => rows.reduce((acc, r) => acc + Number(r[k] || 0), 0);

  return {
    totalOrders: rows.length,
    totalGmv: sum('gmv'),
    totalCommissionTwd: sum('commissionTwd'),
    avgCommissionTwd: Math.round(sum('commissionTwd') / n),
    avgManualMinutes: Number((sum('manualMinutes') / n).toFixed(1)),
    avgManualCostTwd: Math.round(sum('manualCostTwd') / n),
    refundRate: Number(((rows.filter((r) => r.refundAmountTwd > 0).length / n) * 100).toFixed(1)),
    exceptionRate: Number(((rows.filter((r) => r.hasException).length / n) * 100).toFixed(1)),
    avgFinalContributionTwd: Math.round(sum('finalContributionTwd') / n),
    healthyOrderRate: Number(((rows.filter((r) => r.isHealthyOrder).length / n) * 100).toFixed(1))
  };
}

export function operationsTrackingCsvFallback() {
  const rows = listOperationsTrackingFallback();
  const header = [
    'orderId','orderDate','guideName','activityName','scheduleDate','travelers','status','gmv','commissionTwd','paymentFeeTwd','manualMinutes','manualCostTwd','refundAmountTwd','subsidyTwd','hasException','finalContributionTwd','isHealthyOrder','note'
  ];

  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = rows.map((r) => header.map((h) => esc(r[h])).join(','));
  return [header.join(','), ...lines].join('\n');
}
