import { Suspense } from 'react';
import ActivitiesContent from './ActivitiesContent';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '探索行程 | Midao 祕島',
  description: '瀏覽台灣全島私人導遊行程。柴山探洞、大稻埕老街、花蓮溯溪等在地體驗，依地區、主題自由篩選。',
  openGraph: {
    title: '探索行程 | Midao 祕島',
    description: '台灣私人導遊行程，實名認證、透明定價、安全付款。',
  },
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
const activitiesJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: '探索行程 | Midao 祕島',
  description: '瀏覽台灣全島私人導遊行程。',
  url: `${baseUrl}/activities`,
  publisher: { '@type': 'Organization', name: 'Midao 祕島', url: baseUrl },
};

export default function ActivitiesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(activitiesJsonLd) }} />
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#666' }}>載入中⋯</div>}>
        <ActivitiesContent />
      </Suspense>
    </>
  );
}
