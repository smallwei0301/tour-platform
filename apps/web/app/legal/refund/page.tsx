const policies = [
  '活動開始 48 小時前取消：全額退款。',
  '活動開始 24-48 小時前取消：退款 50%。',
  '活動開始 24 小時內取消：原則上不退款，特殊狀況由客服與平台判定。',
  '若因導遊或平台因素取消，將優先協助全額退款或替代方案安排。',
];

export default function RefundPage() {
  return (
    <main className="tp-container tp-editorial-page">
      <section className="tp-editorial-hero">
        <p className="tp-editorial-kicker">refund policy</p>
        <h1>退款政策</h1>
        <p className="tp-editorial-lead">把取消時點與退款比例講清楚，才是對旅客與導遊都公平的流程。</p>
      </section>

      <section className="tp-editorial-section tp-legal-card">
        <h2>退款規則</h2>
        <ul className="tp-legal-list">
          {policies.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </main>
  );
}
