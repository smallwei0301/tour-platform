import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '登入 | Midao 祕島',
  description: '登入你的 Midao 祕島帳戶以管理訂單和預約。',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
