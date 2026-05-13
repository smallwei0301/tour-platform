export default function PrivacyPage() {
  return (
    <main className="tp-container tp-static-page tp-editorial-page midao-page">
      <div className="tp-breadcrumb tp-editorial-breadcrumb">首頁 &gt; 法律條款 &gt; 隱私政策</div>
      <section
        className="tp-editorial-hero"
        style={{
          backgroundImage:
            'linear-gradient(rgba(14, 26, 20, 0.42), rgba(14, 26, 20, 0.56)), url(/images/midao-style/about-hero.png)',
        }}
      >
        <h1>隱私政策</h1>
        <p>我們重視每一次預約與旅程資料的保護，以下內容說明資料蒐集、使用與刪除方式。</p>
      </section>
      <section className="tp-step-card">
        <p>我們僅在提供服務必要範圍內蒐集資料（訂單、聯絡方式、付款相關資訊）。</p>
        <p>所有個資處理依台灣相關法規辦理，並提供用戶查詢與刪除申請管道。</p>
      </section>
    </main>
  );
}
