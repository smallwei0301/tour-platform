import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '申請成為導遊 | Midao 祕島',
  description: '加入 Midao 祕島導遊社群，分享你的在地知識，讓旅客體驗最真實的台灣。提交申請表，我們將在 3–5 個工作天內完成審核。',
  openGraph: {
    title: '申請成為導遊 | Midao 祕島',
    description: '加入 Midao 祕島，成為認證在地導遊，創造難忘的旅遊體驗。',
    images: [{ url: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80', width: 1200, height: 630, alt: '成為 Midao 祕島導遊' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '申請成為導遊 | Midao 祕島',
    description: '加入 Midao 祕島，成為認證在地導遊，創造難忘的旅遊體驗。',
    images: ['https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80'],
  },
};

export default function GuideApplyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
