import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '投稿新行程 | Midao 祕島',
  description: '導遊填寫最少資訊，我們會用 AI 幫你把行程內容整理成完整、吸引旅客的版本，再由團隊上架。',
  robots: { index: false, follow: false },
};

export default function GuideNewActivityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
