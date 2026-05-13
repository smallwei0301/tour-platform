import { csrfHeaders } from './csrf-client';

export async function fetchExperiences() {
  const res = await fetch('/api/experiences', { cache: 'no-store' });
  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'failed to load experiences');
  return json.data;
}

export async function createOrder(payload: {
  experienceSlug: string;
  scheduleId: string;
  planId?: string;
  peopleCount: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  promoCode?: string;
}) {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'failed to create order');
  return json.data;
}

export async function fetchMyOrders(contactEmail = '') {
  const q = contactEmail ? `?contactEmail=${encodeURIComponent(contactEmail)}` : '';
  const res = await fetch(`/api/me/orders${q}`, { cache: 'no-store' });
  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'failed to load my orders');
  return json.data;
}

export async function fetchMyOrderDetail(orderId: string, contactEmail = '') {
  const q = contactEmail ? `?contactEmail=${encodeURIComponent(contactEmail)}` : '';
  const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}${q}`, { cache: 'no-store' });
  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'failed to load order detail');
  return json.data;
}

export async function fetchRefundRequests(orderId: string) {
  const res = await fetch(`/api/me/orders/${encodeURIComponent(orderId)}/refund-requests`, { cache: 'no-store' });
  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'failed to load refund requests');
  return json.data;
}

export async function createRefundRequest(payload: { orderId: string; requestId: string; reason?: string; note?: string; contactEmail?: string }) {
  const res = await fetch(`/api/me/orders/${encodeURIComponent(payload.orderId)}/refund-requests`, {
    method: 'POST',
    headers: csrfHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ requestId: payload.requestId, reason: payload.reason, note: payload.note, contactEmail: payload.contactEmail })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'failed to create refund request');
  return json.data;
}

export async function submitEcpayCallback(payload: { orderId: string; tradeNo?: string }) {
  const form = new URLSearchParams();
  form.set('orderId', payload.orderId);
  if (payload.tradeNo) form.set('tradeNo', payload.tradeNo);

  const res = await fetch('/api/payments/ecpay/callback', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });

  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'failed to process payment callback');
  return json.data;
}

export async function fetchActivityBySlug(slug: string) {
  const res = await fetch(`/api/activities/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'activity not found');
  return json.data;
}
