import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隱私政策 | Midao 祕島',
  description: 'Midao 祕島平台的個人資料保護政策，說明資料蒐集範圍、使用方式與用戶權利。',
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
    { '@type': 'ListItem', position: 2, name: '隱私政策', item: `${baseUrl}/legal/privacy` },
  ],
};

export default function PrivacyPage() {
  return (
    <main className="tp-container tp-static-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">首頁</Link> &gt; 隱私政策
      </div>
      <h1>隱私政策（草案）</h1>
      <section className="tp-step-card">
        <p>我們僅在提供服務必要範圍內蒐集資料（訂單、聯絡方式、付款相關資訊）。</p>
        <p>所有個資處理依台灣相關法規辦理，並提供用戶查詢與刪除申請管道。</p>
      </section>
    </main>
  );
}
