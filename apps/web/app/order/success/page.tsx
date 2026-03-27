'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function OrderSuccessPage() {
  const params = useSearchParams();
  const orderId = params.get('orderId') || 'N/A';

  return (
    <main style={{ padding: 24 }}>
      <h1>Order Success</h1>
      <p>訂單成立：{orderId}</p>
      <p>下一步可呼叫付款 callback 模擬入帳。</p>
      <Link href="/admin/ops/orders">前往營運追蹤後台</Link>
    </main>
  );
}
