const sections = [
  '平台提供在地導遊媒合、行程展示、訂單管理與必要客服協助，並非傳統旅行社包團產品。',
  '用戶在下單前應確認行程內容、人數、取消與退款政策，以及活動風險說明。',
  '平台保留依實際營運需求更新服務條款與流程說明的權利。',
];

export default function TermsPage() {
  return (
    <main className="tp-container tp-editorial-page">
      <section className="tp-editorial-hero">
        <p className="tp-editorial-kicker">terms of service</p>
        <h1>服務條款</h1>
        <p className="tp-editorial-lead">這頁維持草案性質，但版型與語氣已與全站一致，避免 legal 頁掉回舊系統外觀。</p>
      </section>

      <section className="tp-editorial-section tp-legal-card">
        <h2>基本條款</h2>
        <ul className="tp-legal-list">
          {sections.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </main>
  );
}
