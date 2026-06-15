// 個人資料頁沿用「古紙淺色面板」（表單可讀性）。父層 app/me/layout 已改為深綠透傳。
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <div className="tp-light-page">{children}</div>;
}
