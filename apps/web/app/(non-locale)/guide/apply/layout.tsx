import '../../../../src/styles/lp-apply.css'; // #1735 route-scoped（拆自 globals.css）
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '申請成為嚮導',
  description: '在地嚮導招募中！加入 Midao 祕島嚮導社群，分享你的在地知識，讓旅客體驗最真實的台灣。一頁填完申請表，我們將在 3–5 個工作天內與你聯繫。',
  openGraph: {
    title: '在地嚮導招募中！| Midao 祕島',
    description: '你熟悉一個地方，知道一般旅客找不到的風景、故事、美食或文化嗎？加入 Midao 祕島，成為在地嚮導。',
    images: [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: '成為 Midao 祕島嚮導' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '在地嚮導招募中！| Midao 祕島',
    description: '你熟悉一個地方，知道一般旅客找不到的風景、故事、美食或文化嗎？加入 Midao 祕島，成為在地嚮導。',
    images: ['/images/og-default.png'],
  },
};

export default function GuideApplyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
