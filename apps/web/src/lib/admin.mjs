import { orders, refundRequests, experiences } from './store.mjs';

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
