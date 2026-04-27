import type { Metadata } from 'next';
import { HomeMobileLanding } from '../src/components/home/HomeMobileLanding';

export const metadata: Metadata = {
  title: 'Tour Platform｜台灣在地導遊預約平台',
  description: '找到懂路的人，帶你走進台灣最有故事的地方。柴山探洞、大稻埕老街、花蓮溯溪⋯⋯ 預約實名認證在地導遊，安全透明。',
  openGraph: {
    title: 'Tour Platform｜台灣在地導遊預約平台',
    description: '找到懂路的人，帶你走進台灣最有故事的地方。',
    images: [{ url: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80' }],
  },
};

export default function HomePage() {
  return <HomeMobileLanding />;
}
