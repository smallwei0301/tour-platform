export function FaqSection() {
  const faqs = [
    { q: '什麼是私人導遊行程？', a: '私人導遊行程是由平台認證的在地導遊帶領的小團體驗，行程由導遊設計，旅客可以按照自己的節奏探索，不需要配合大團行程表。' },
    { q: '如何確保導遊品質與安全？', a: '所有導遊都經過實名認證（KYC），部分導遊另有急救認證、環境教育講師等專業資歷。平台也提供緊急熱線 30 分鐘回應服務。' },
    { q: '付款安全嗎？', a: '所有付款透過 ECPay 或 LINE Pay 加密處理，你的信用卡資料不會經過本站。' },
    { q: '可以取消預約嗎？', a: '可以。每個行程都有明確的退款政策，大部分行程在出團 168 小時前（含）以上可全額退款，出團前 超過 72 小時且少於 168 小時可退 70%。詳細規則請見各行程頁面。' },
    { q: '適合帶小孩參加嗎？', a: '依行程而定。每個行程頁面都有標註「適合對象」與「不太適合」的說明，選擇前請先確認。部分行程有親子友善標籤。' },
    { q: '如何成為導遊？', a: '點擊「成為導遊」填寫申請表，經過平台審核後即可上架行程。我們歡迎有在地特色、專業背景的導遊加入。' },
  ];

  return (
    <section className="tp-section tp-faq">
      <div className="tp-container">
        <div className="tp-section-head"><h2>常見問題</h2></div>
        <div className="tp-faq-list">
          {faqs.map((f, i) => (
            <details key={i}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
