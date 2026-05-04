const sections = [
  '我們只在提供預約、聯繫、付款與售後服務的必要範圍內蒐集資料。',
  '你提供的姓名、聯絡方式、訂單與付款相關資訊，僅會用於完成行程服務、客服處理與法規要求。',
  '若你需要查詢、更正或刪除資料，可透過聯絡頁提出申請，我們會依適用規範處理。',
];

export default function PrivacyPage() {
  return (
    <main className="tp-container tp-editorial-page">
      <section className="tp-editorial-hero">
        <p className="tp-editorial-kicker">privacy policy</p>
        <h1>隱私政策</h1>
        <p className="tp-editorial-lead">把資料蒐集用途、保存範圍與聯絡方式說清楚，這是旅遊平台最基本的信任底線。</p>
      </section>

      <section className="tp-editorial-section tp-legal-card">
        <h2>資料使用原則</h2>
        <ul className="tp-legal-list">
          {sections.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </main>
  );
}
