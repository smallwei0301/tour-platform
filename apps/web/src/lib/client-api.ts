export async function fetchExperiences() {
  const res = await fetch('/api/experiences', { cache: 'no-store' });
  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'failed to load experiences');
  return json.data;
}

export async function createOrder(payload: {
  experienceSlug: string;
  scheduleId: string;
  peopleCount: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
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
