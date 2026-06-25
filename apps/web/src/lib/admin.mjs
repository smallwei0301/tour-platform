import { orders, refundRequests, experiences, auditLogs, operationsTracking, kpiConfig, kpiConfigHistory, payments, paymentEvents, homepageFeatured } from './store.mjs';
import { appendAuditLog as appendSharedAuditLog } from './audit-log.mjs';
import { resolveAdminRefundTransition } from './refund-transition.mjs';

// #1385: audit log 單一實作於 audit-log.mjs；此 adapter 僅保留本檔歷史預設 actor='admin'
const appendAuditLog = (entry) => appendSharedAuditLog({ actor: 'admin', ...entry });

export function listAdminOrdersFallback(input = {}) {
  const status = String(input?.status || '').trim();
  const contactEmail = String(input?.contactEmail || '').trim();
  const sourceChannel = String(input?.sourceChannel || '').trim();

  return orders
    .filter((o) => (status ? o.status === status : true))
    .filter((o) => (contactEmail ? o.contactEmail === contactEmail : true))
    .filter((o) => (sourceChannel ? (o.sourceChannel || 'web') === sourceChannel : true))
    .map((o) => {
      const cfg = getKpiConfigFallback();
      const guidePayoutRate = Number(cfg.guidePayoutRate ?? 0.85);
      const costTwd = Math.round(o.totalTwd * guidePayoutRate);
      const exp = experiences.find((e) => e.id === o.experienceId);
      return {
        id: o.id,
        status: o.status,
        sourceChannel: o.sourceChannel || 'web',
        totalTwd: o.totalTwd,
        costTwd,
        marginTwd: o.totalTwd - costTwd,
        title: exp?.title || o.experienceSlug || null,
        experienceId: o.experienceId || null,
        experienceSlug: o.experienceSlug,
        peopleCount: o.peopleCount || 1,
        scheduleStartAt: o.scheduleStartAt || null,
        contactName: o.contactName || null,
        contactPhone: o.contactPhone || null,
        contactEmail: o.contactEmail || null,
        adminNote: o.adminNote || null,
        createdAt: o.createdAt || null,
        paymentStatus: o.paymentStatus || null,
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
  const adminNoteProvided = input?.adminNote != null;
  const adminNote = adminNoteProvided ? String(input?.adminNote).trim() : null;
  const actor = String(input?.actor || 'admin').trim() || 'admin';
  const sourceChannel = String(input?.sourceChannel || 'admin_pos').trim() || 'admin_pos';

  // Contact info fields
  const contactNameProvided = input?.contactName != null;
  const contactPhoneProvided = input?.contactPhone != null;
  const contactEmailProvided = input?.contactEmail != null;
  const newContactName = contactNameProvided ? String(input.contactName).trim() : null;
  const newContactPhone = contactPhoneProvided ? String(input.contactPhone).trim() : null;
  const newContactEmail = contactEmailProvided ? String(input.contactEmail).trim() : null;

  // Headcount field
  const peopleCountProvided = input?.peopleCount != null;
  const newPeopleCount = peopleCountProvided ? Number(input.peopleCount) : null;

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

  // AC5: locked statuses cannot be edited
  const lockedStatuses = ['refunded', 'refund_pending', 'completed', 'cancelled_by_user', 'cancelled_by_guide'];

  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('order not found');

  // AC5: reject edits on locked orders
  if (lockedStatuses.includes(order.status)) {
    throw new Error(`order_edit_locked:${order.status}`);
  }

  // 防呆：終端狀態只能由專用流程到達，不得由「狀態下拉」手動設定（與 db.mjs 對齊）。
  const MANUAL_BLOCKED_STATUSES = ['cancelled_by_user', 'cancelled_by_guide', 'refund_pending', 'refunded'];
  if (status && MANUAL_BLOCKED_STATUSES.includes(status)) {
    throw new Error(`manual_status_change_blocked:${status}`);
  }

  const previousStatus = order.status;
  const previousPaymentStatus = order.paymentStatus || null;
  const previousPaidAt = order.paidAt || null;
  const previousAdminNote = order.adminNote || null;
  const previousContactName = order.contactName || null;
  const previousContactPhone = order.contactPhone || null;
  const previousContactEmail = order.contactEmail || null;
  const previousPeopleCount = order.peopleCount || null;
  const previousTotalTwd = order.totalTwd || null;

  if (status) {
    if (!validStatuses.includes(status)) throw new Error('invalid order status');
    order.status = status;

    if (status === 'paid') {
      order.paymentStatus = 'paid';
      order.paidAt = new Date().toISOString();
    }
    if (status === 'pending_payment') {
      order.paymentStatus = 'pending';
      order.paidAt = null;
    }
  }

  if (adminNoteProvided) {
    order.adminNote = adminNote || null;
  }

  if (contactNameProvided) order.contactName = newContactName;
  if (contactPhoneProvided) order.contactPhone = newContactPhone;
  if (contactEmailProvided) order.contactEmail = newContactEmail;

  // AC1.1 / AC1.2 / AC1.3: headcount change
  let headcountChanged = false;
  if (peopleCountProvided && newPeopleCount !== order.peopleCount) {
    if (!Number.isInteger(newPeopleCount) || newPeopleCount < 1) {
      throw new Error('peopleCount must be a positive integer');
    }
    const delta = newPeopleCount - order.peopleCount;

    // Find schedule in in-memory experience data (experiences is imported from store.mjs at top)
    const expData = experiences.find((e) => e.id === order.experienceId);
    const schedule = expData?.schedules?.find((s) => s.id === order.scheduleId);

    if (schedule) {
      const newBooked = (schedule.bookedCount || 0) + delta;
      // AC1.1: capacity check
      if (newBooked > schedule.capacity) {
        throw new Error(`capacity insufficient: capacity=${schedule.capacity} booked=${schedule.bookedCount} delta=${delta}`);
      }
      // AC1.2: update booked_count
      schedule.bookedCount = newBooked;
      schedule.status = newBooked >= schedule.capacity ? 'full' : 'open';
    }

    order.peopleCount = newPeopleCount;
    // AC1.3: recompute total_twd
    if (previousPeopleCount > 0 && order.totalTwd != null) {
      const pricePerHead = Math.round(order.totalTwd / previousPeopleCount);
      order.totalTwd = pricePerHead * newPeopleCount;
    }
    headcountChanged = true;
  }

  order.updatedAt = new Date().toISOString();

  const statusChanged = !!status && previousStatus !== order.status;
  const noteChanged = adminNoteProvided && previousAdminNote !== (order.adminNote || null);
  const contactChanged = contactNameProvided || contactPhoneProvided || contactEmailProvided;

  if (statusChanged || noteChanged) {
    appendAuditLog({
      orderId: order.id,
      actor,
      action: statusChanged ? 'order_status_update' : 'order_admin_note_update',
      metadata: {
        actor,
        actorRole: 'admin',
        sourceChannel,
        targetOrderId: order.id,
        bookingId: null,
        paymentId: null,
        before: {
          status: previousStatus,
          paymentStatus: previousPaymentStatus,
          paidAt: previousPaidAt,
          adminNote: previousAdminNote
        },
        after: {
          status: order.status,
          paymentStatus: order.paymentStatus || null,
          paidAt: order.paidAt || null,
          adminNote: order.adminNote || null
        }
      }
    });
  }

  // AC1.4: audit log for admin edit (contact / headcount changes)
  if (contactChanged || headcountChanged) {
    appendAuditLog({
      orderId: order.id,
      actor,
      action: 'order_admin_edit',
      metadata: {
        actor,
        actorRole: 'admin',
        sourceChannel: 'admin_pos',
        targetOrderId: order.id,
        before: {
          contactName: previousContactName,
          contactPhone: previousContactPhone,
          contactEmail: previousContactEmail,
          peopleCount: previousPeopleCount,
          totalTwd: previousTotalTwd
        },
        after: {
          contactName: order.contactName || null,
          contactPhone: order.contactPhone || null,
          contactEmail: order.contactEmail || null,
          peopleCount: order.peopleCount || null,
          totalTwd: order.totalTwd || null
        }
      }
    });
  }

  return getAdminOrderDetailFallback({ orderId });
}

export function listOrderAuditLogsFallback(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  return auditLogs
    .filter((l) => (orderId ? l.orderId === orderId : true))
    .sort((a, b) => {
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return String(b.id).localeCompare(String(a.id));
    });
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

  const log = appendAuditLog({
    orderId: order.id,
    action,
    metadata: {
      targetScheduleId: input?.targetScheduleId || null,
      newCapacity: input?.newCapacity ?? null,
      adminNote
    },
  });

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
  const previousRefundStatus = req.status;

  // #1385: 狀態機集中於 refund-transition.mjs（與 db.mjs Supabase 分支共用）
  const transition = resolveAdminRefundTransition(action, { now, hasPaidAt: Boolean(order.paidAt) });
  req.status = transition.refundStatus;
  if (transition.refundPatch.approved_at) req.approvedAt = now;
  if (transition.refundPatch.refunded_at) req.refundedAt = now;
  order.status = transition.orderStatus;

  if (transition.completesPayment) {
    let payment = payments.find((p) => p.orderId === order.id);
    if (!payment) {
      payment = {
        id: `pay_${String(payments.length + 1).padStart(6, '0')}`,
        orderId: order.id,
        provider: 'ecpay',
        amountTwd: Number(order.totalTwd || 0),
        status: 'refunded',
        paidAt: order.paidAt || now,
        updatedAt: now,
      };
      payments.push(payment);
    } else {
      payment.status = 'refunded';
      payment.updatedAt = now;
    }

    const hasRefundedEvent = paymentEvents.some((e) => e.paymentId === payment.id && e.eventType === 'refunded');
    if (!hasRefundedEvent) {
      paymentEvents.push({
        id: `pe_${String(paymentEvents.length + 1).padStart(6, '0')}`,
        paymentId: payment.id,
        eventType: 'refunded',
        payload: {
          source: 'updateAdminRefundStatusFallback',
          refundRequestId: req.id,
          orderId: order.id,
          adminNote,
        },
        createdAt: now,
      });
    }

    // 退款完成 → 自動掛鉤 ops tracking，將退款金額寫入 refundAmountTwd
    const opsRow = findOrCreateOpsRow(order);
    const refundAmt = Number(req.totalTwd || order.totalTwd || 0);
    if (opsRow.refundAmountTwd !== refundAmt) {
      opsRow.refundAmountTwd = refundAmt;
      opsRow.updatedAt = now;
    }
  }

  req.adminNote = adminNote;
  req.updatedAt = now;

  appendAuditLog({
    orderId: req.orderId,
    actor: 'admin',
    action: `refund_${action}`,
    metadata: {
      refundRequestId: req.id,
      previousRefundStatus,
      refundStatus: req.status,
      orderStatus: order.status,
      adminNote: req.adminNote
    }
  });

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

export function getKpiConfigFallback() {
  return { ...kpiConfig };
}

export function updateKpiConfigFallback(input = {}) {
  const toNum = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const before = { ...kpiConfig };
  const actor = String(input.actor || 'admin');
  const note = String(input.note || '');
  const skipAuditLog = input?.skipAuditLog === true;

  if (input.commissionRate != null) kpiConfig.commissionRate = toNum(input.commissionRate, kpiConfig.commissionRate);
  if (input.paymentFeeRate != null) kpiConfig.paymentFeeRate = toNum(input.paymentFeeRate, kpiConfig.paymentFeeRate);
  if (input.guidePayoutRate != null) kpiConfig.guidePayoutRate = toNum(input.guidePayoutRate, kpiConfig.guidePayoutRate);
  if (input.healthyMinContributionTwd != null) kpiConfig.healthyMinContributionTwd = toNum(input.healthyMinContributionTwd, kpiConfig.healthyMinContributionTwd);
  if (input.healthyAllowException != null) kpiConfig.healthyAllowException = Boolean(input.healthyAllowException);

  if (kpiConfig.commissionRate < 0 || kpiConfig.commissionRate > 1) throw new Error('commissionRate must be between 0 and 1');
  if (kpiConfig.paymentFeeRate < 0 || kpiConfig.paymentFeeRate > 1) throw new Error('paymentFeeRate must be between 0 and 1');
  if (kpiConfig.guidePayoutRate < 0 || kpiConfig.guidePayoutRate > 1) throw new Error('guidePayoutRate must be between 0 and 1');

  kpiConfig.updatedAt = new Date().toISOString();

  kpiConfigHistory.push({
    versionId: `kpi_v_${String(kpiConfigHistory.length + 1).padStart(6, '0')}`,
    actor,
    action: 'update',
    note,
    before,
    config: { ...kpiConfig },
    createdAt: kpiConfig.updatedAt
  });

  if (!skipAuditLog) {
    appendAuditLog({
      actor,
      action: 'kpi_config_update',
      metadata: {
        note,
        before,
        after: { ...kpiConfig }
      }
    });
  }

  return { ...kpiConfig };
}

export function listKpiConfigHistoryFallback() {
  return [...kpiConfigHistory].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function revertKpiConfigFallback(input = {}) {
  const versionId = String(input?.versionId || '').trim();
  if (!versionId) throw new Error('versionId is required');

  const target = kpiConfigHistory.find((h) => h.versionId === versionId);
  if (!target) throw new Error('kpi config version not found');

  const actor = String(input.actor || 'admin');
  const cfg = target.config || {};

  const updated = updateKpiConfigFallback({
    commissionRate: cfg.commissionRate,
    paymentFeeRate: cfg.paymentFeeRate,
    guidePayoutRate: cfg.guidePayoutRate,
    healthyMinContributionTwd: cfg.healthyMinContributionTwd,
    healthyAllowException: cfg.healthyAllowException,
    actor,
    note: `revert to ${versionId}`,
    skipAuditLog: true
  });

  kpiConfigHistory.push({
    versionId: `kpi_v_${String(kpiConfigHistory.length + 1).padStart(6, '0')}`,
    actor,
    action: 'revert',
    note: `revert to ${versionId}`,
    before: null,
    config: { ...kpiConfig },
    sourceVersionId: versionId,
    createdAt: kpiConfig.updatedAt
  });

  appendAuditLog({
    actor,
    action: 'kpi_config_revert',
    metadata: {
      sourceVersionId: versionId,
      revertedConfig: { ...updated }
    }
  });

  return { ...updated };
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
      isDisputed: false,
      isSafetyCase: false,
      note: null,
      updatedAt: new Date().toISOString()
    };
    operationsTracking.push(row);
  }
  return row;
}

function buildOpsContribution(order, ops) {
  const cfg = getKpiConfigFallback();
  const gmv = Number(order.totalTwd || 0);
  const refundAmountTwd = Number(ops.refundAmountTwd || 0);
  // 有效 GMV：扣除退款金額後的實收金額
  const effectiveGmv = Math.max(0, gmv - refundAmountTwd);
  // 平台收入：只對有效 GMV 收抽成
  const commissionTwd = Math.round(effectiveGmv * cfg.commissionRate);
  // 金流費：依各支付商協議，通常不退；以原始 GMV 計算
  const paymentFeeTwd = Math.round(gmv * cfg.paymentFeeRate);
  const manualCostTwd = Number(ops.manualCostTwd || 0);
  const subsidyTwd = Number(ops.subsidyTwd || 0);
  // 最終貢獻 = 平台收入 - 不可回收成本
  const finalContributionTwd = commissionTwd - paymentFeeTwd - manualCostTwd - subsidyTwd;
  const hasException = Boolean(
    refundAmountTwd > 0 ||
    ops.isRescheduled ||
    ops.hasComplaint ||
    ops.hasGuideAdjustment ||
    ops.hasOversellIssue ||
    ops.isDisputed ||
    ops.isSafetyCase
  );
  const isHealthyOrder = cfg.healthyAllowException
    ? finalContributionTwd >= Number(cfg.healthyMinContributionTwd || 0)
    : finalContributionTwd >= Number(cfg.healthyMinContributionTwd || 0) && !hasException;

  return {
    gmv,
    effectiveGmv,
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
      // calc 最後展開，確保計算欄位不被 ops 的舊快取值覆蓋
      const { finalContributionTwd: _a, commissionTwd: _b, paymentFeeTwd: _c, effectiveGmv: _d, isHealthyOrder: _e, hasException: _f, gmv: _g, ...opsRest } = ops;
      return {
        orderId: o.id,
        orderDate: o.createdAt,
        guideName: exp?.guideSlug || null,
        activityName: exp?.title || o.experienceSlug,
        scheduleDate: o.scheduleStartAt || null,
        travelers: o.peopleCount || 1,
        status: o.status,
        ...opsRest,
        ...calc,
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
  if (input.isDisputed != null) ops.isDisputed = Boolean(input.isDisputed);
  if (input.isSafetyCase != null) ops.isSafetyCase = Boolean(input.isSafetyCase);
  if (input.note != null) ops.note = String(input.note || '').trim() || null;

  ops.updatedAt = new Date().toISOString();

  appendAuditLog({
    orderId: order.id,
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
      isDisputed: ops.isDisputed,
      isSafetyCase: ops.isSafetyCase,
      note: ops.note
    },
    createdAt: ops.updatedAt
  });

  return listOperationsTrackingFallback().find((r) => r.orderId === orderId);
}

export function operationsTrackingSummaryFallback() {
  const rows = listOperationsTrackingFallback();
  const cfg = getKpiConfigFallback();
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
    healthyOrderRate: Number(((rows.filter((r) => r.isHealthyOrder).length / n) * 100).toFixed(1)),
    kpiConfig: cfg
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

// ── 首頁精選設定（in-memory fallback，與 db.mjs Supabase 分支同 shape） ──

export function getHomepageFeaturedFallback() {
  return {
    editorPickSlug: homepageFeatured.editorPickSlug,
    moreFeaturedSlugs: [...homepageFeatured.moreFeaturedSlugs],
    editorPickCopy: { ...(homepageFeatured.editorPickCopy || {}) },
    moreFeaturedCopy: JSON.parse(JSON.stringify(homepageFeatured.moreFeaturedCopy || {})),
    updatedAt: homepageFeatured.updatedAt,
    updatedBy: homepageFeatured.updatedBy,
  };
}

export function setHomepageFeaturedFallback({ editorPickSlug = null, moreFeaturedSlugs = [], editorPickCopy = {}, moreFeaturedCopy = {}, actor = 'admin' } = {}) {
  const before = getHomepageFeaturedFallback();
  homepageFeatured.editorPickSlug = editorPickSlug;
  homepageFeatured.moreFeaturedSlugs = [...moreFeaturedSlugs];
  homepageFeatured.editorPickCopy = { ...(editorPickCopy || {}) };
  homepageFeatured.moreFeaturedCopy = JSON.parse(JSON.stringify(moreFeaturedCopy || {}));
  homepageFeatured.updatedAt = new Date().toISOString();
  homepageFeatured.updatedBy = actor;
  const after = getHomepageFeaturedFallback();
  appendAuditLog({
    actor,
    action: 'homepage_featured_update',
    metadata: { actorRole: 'admin', before, after },
  });
  return after;
}
