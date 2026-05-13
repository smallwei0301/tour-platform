export default function TermsPage() {
  return (
    <main className="tp-container tp-static-page tp-editorial-page midao-page">
      <div className="tp-breadcrumb tp-editorial-breadcrumb">首頁 &gt; 法律條款 &gt; 服務條款</div>
      <section
        className="tp-editorial-hero"
        style={{
          backgroundImage:
            'linear-gradient(rgba(12, 24, 18, 0.42), rgba(12, 24, 18, 0.56)), url(/images/midao-style/about-hero.png)',
        }}
      >
        <h1>服務條款</h1>
        <p>為維持旅客、導遊與平台三方權益，請在預約前先閱讀本服務條款。</p>
      </section>
      <section className="tp-step-card">
        <p>平台提供在地導遊媒合與訂單管理服務，非旅行社包團服務。</p>
        <p>用戶預約前應確認行程內容、取消政策與風險揭露事項。</p>
      </section>
    </main>
  );
}
