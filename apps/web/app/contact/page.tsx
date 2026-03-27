export default function ContactPage() {
  return (
    <main className="tp-container tp-static-page">
      <h1>聯絡我們</h1>
      <section className="tp-step-card">
        <p>客服信箱：support@tour-platform.tw</p>
        <p>緊急熱線：0800-000-000（活動當天 30 分鐘內回應）</p>
      </section>
      <section className="tp-step-card">
        <label>姓名<input /></label>
        <label>Email<input type="email" /></label>
        <label>問題內容<textarea rows={5} /></label>
        <button className="tp-btn tp-btn-primary">送出</button>
      </section>
    </main>
  );
}
