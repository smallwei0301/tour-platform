// Maps an admin-set order status to the Telegram order-event kind to broadcast.
//
// Used by the admin POS order routes so that manual status changes / cancels /
// refunds fan out the same order-event notifications (admin group + guide +
// traveler) as the automated booking flow does. Returns null for statuses that
// have no meaningful customer-facing event (avoids sending a misleading
// "訂單狀態更新" with the wrong headline).
//
// Event kinds mirror src/lib/telegram-messages.ts OrderEventKind.

/**
 * @param {string|null|undefined} status
 * @returns {('payment_received'|'order_cancelled'|'refund_requested'|'refund_executed')|null}
 */
export function adminStatusToTelegramKind(status) {
  switch (String(status || '').trim()) {
    case 'paid':
      return 'payment_received';
    case 'cancelled_by_user':
    case 'cancelled_by_guide':
    case 'rejected':
      return 'order_cancelled';
    case 'refund_pending':
      return 'refund_requested';
    case 'refunded':
      return 'refund_executed';
    default:
      return null;
  }
}
