'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createOrder } from '../../src/lib/client-api';

export default function CheckoutPage() {
  const params = useSearchParams();
  const router = useRouter();
  const slug = params.get('slug') || 'kaohsiung-chaishan-cave-experience';
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    setLoading(true);
    setErr(null);
    try {
      const order = await createOrder({
        experienceSlug: slug,
        scheduleId: slug === 'dadadaocheng-walk' ? 'sch_dadaocheng_0402' : 'sch_chaishan_0410',
        peopleCount: 1,
        contactName: 'Guest',
        contactPhone: '0912345678',
        contactEmail: 'guest@example.com'
      });
      router.push(`/order/success?orderId=${order.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '建立訂單失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>Checkout</h1>
      <p>行程：{slug}</p>
      <button onClick={onSubmit} disabled={loading}>
        {loading ? '建立中...' : '建立訂單'}
      </button>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
    </main>
  );
}
