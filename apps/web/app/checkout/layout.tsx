import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  // 交易／會員頁 inline 深灰文字設計，深色 LP 主題下以古紙淺色面板呈現
  // （.tp-light-page 同時把 --tp-* 變數覆寫回淺色值）
  return <div className="tp-light-page">{children}</div>;
}
