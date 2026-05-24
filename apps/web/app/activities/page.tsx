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

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#666' }}>載入中⋯</div>}>
      <ActivitiesContent />
    </Suspense>
  );
}
