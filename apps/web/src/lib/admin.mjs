import { orders, refundRequests } from './store.mjs';

export function listAdminOrdersFallback() {
  return orders.map((o) => {
    const costTwd = Math.round(o.totalTwd * 0.65);
    return {
      id: o.id,
      status: o.status,
      totalTwd: o.totalTwd,
      costTwd,
      marginTwd: o.totalTwd - costTwd
    };
  });
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
