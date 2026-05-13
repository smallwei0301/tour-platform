export default function RefundPage() {
  return (
    <main className="tp-container tp-static-page tp-editorial-page midao-page">
      <div className="tp-breadcrumb tp-editorial-breadcrumb">首頁 &gt; 法律條款 &gt; 退款政策</div>
      <section
        className="tp-editorial-hero"
        style={{
          backgroundImage:
            'linear-gradient(rgba(12, 24, 18, 0.42), rgba(12, 24, 18, 0.54)), url(/images/midao-style/why-hero.png)',
        }}
      >
        <h1>退款政策</h1>
        <p>我們以清楚透明為原則，依行程時程與安全狀況提供對應的取消與退款機制。</p>
      </section>
      <section className="tp-step-card">
        <p>活動 48 小時前取消：全額退款。</p>
        <p>活動 24-48 小時前取消：退款 50%。</p>
        <p>活動 24 小時內取消：不退款（特殊情況依客服判定）。</p>
      </section>
    </main>
  );
}
