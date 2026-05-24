import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '服務條款 | Midao 祕島',
  description: 'Midao 祕島平台服務條款，說明平台性質、預約流程與旅客權利義務。',
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
    { '@type': 'ListItem', position: 2, name: '服務條款', item: `${baseUrl}/legal/terms` },
  ],
};

export default function TermsPage() {
  return (
    <main className="tp-container tp-static-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">首頁</Link> &gt; 服務條款
      </div>
      <h1>服務條款（草案）</h1>
      <section className="tp-step-card">
        <p>平台提供在地導遊媒合與訂單管理服務，非旅行社包團服務。</p>
        <p>用戶預約前應確認行程內容、取消政策與風險揭露事項。</p>
      </section>
    </main>
  );
}
