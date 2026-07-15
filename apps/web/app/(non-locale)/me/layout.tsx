import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MeLayout({ children }: { children: React.ReactNode }) {
  // 會員中心列表頁（我的訂單／我的最愛）改為與主站一致的深綠主題（全站預設）。
  // 訂單詳情頁與個人資料頁仍以「古紙淺色面板」承載交易資訊（各自包 .tp-light-page），
  // 故此 layout 不再強制 light，改為透傳。
  return <>{children}</>;
}
