// 訂單詳情頁承載付款／退款／改期等交易資訊，沿用「古紙淺色面板」以維持可讀性。
// （父層 app/me/layout 已改為深綠透傳，故詳情頁在此自帶 .tp-light-page。）
export default function OrderDetailLayout({ children }: { children: React.ReactNode }) {
  return <div className="tp-light-page">{children}</div>;
}
