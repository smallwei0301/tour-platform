import '../../../src/styles/login.css'; // #1735 route-scoped（拆自 globals.css）
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '登入',
  description: '登入你的 Midao 祕島帳戶以管理訂單和預約。',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
