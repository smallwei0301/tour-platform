import { orders } from './store.mjs';

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
