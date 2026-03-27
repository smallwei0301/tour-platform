export async function fetchExperiences() {
  const res = await fetch('/api/experiences', { cache: 'no-store' });
  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'failed to load experiences');
  return json.data;
}

export async function createOrder(experienceSlug: string) {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ experienceSlug })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'failed to create order');
  return json.data;
}
