import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '退款政策 | Midao 祕島',
  description: 'Midao 祕島退款政策說明：出團前 168 小時全額退款、72 小時以上退 70%，不可抗力免費改期。',
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
    { '@type': 'ListItem', position: 2, name: '退款政策', item: `${baseUrl}/legal/refund` },
  ],
};

export default function RefundPage() {
  return (
    <main className="tp-container tp-static-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">首頁</Link> &gt; 退款政策
      </div>
      <h1>退款政策</h1>
      <section className="tp-step-card">
        <p>出團 168 小時前（含）取消：100% 退款。</p>
        <p>出團前 超過 72 小時且少於 168 小時取消：70% 退款。</p>
        <p>出團前 72 小時內（含）取消：原則上不予退款。</p>
        <p>不可抗力或主辦方取消：旅客可選擇 100% 退款，或 1 次免費改期。</p>
        <p>手續費：退款時平台不另向旅客扣除手續費，相關費用由平台吸收。</p>
      </section>
    </main>
  );
}
