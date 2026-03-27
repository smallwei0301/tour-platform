import Link from 'next/link';

const upcoming = [
  {
    id: 'TW2026040100123',
    title: '大稻埕百年老街深度漫步',
    date: '2026/04/01（三）09:00',
    guide: '陳建志',
    amount: 'NT$3,800',
    status: '即將出發'
  }
];

const completed = [
  {
    id: 'TW2026031500051',
    title: '九份平溪天燈全日私人包車',
    date: '2026/03/15（日）',
    amount: 'NT$5,500',
    status: '已完成'
  }
];

export default function OrdersPage() {
  return (
    <main className="tp-container tp-orders-page">
      <h1>我的訂單</h1>

      <div className="tp-order-tabs">
        <button className="active">全部</button>
        <button>即將出發</button>
        <button>已完成</button>
        <button>已取消</button>
      </div>

      <section className="tp-order-section">
        {upcoming.map((o) => (
          <article key={o.id} className="tp-order-card">
            <div className="tp-order-cover" />
            <div className="tp-order-body">
              <h3>{o.title}</h3>
              <p>{o.date} · 導遊：{o.guide}</p>
              <p>訂單編號：#{o.id}</p>
              <strong>{o.amount}</strong>
            </div>
            <div className="tp-order-side">
              <span className="tp-status tp-status-upcoming">{o.status}</span>
              <div className="tp-order-actions">
                <Link className="tp-btn tp-btn-ghost" href={`/orders/${o.id}`}>查看訂單</Link>
                <button className="tp-btn tp-btn-ghost">聯繫導遊</button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <h2>已完成行程</h2>
      <section className="tp-order-section">
        {completed.map((o) => (
          <article key={o.id} className="tp-order-card">
            <div className="tp-order-cover" />
            <div className="tp-order-body">
              <h3>{o.title}</h3>
              <p>{o.date}</p>
              <p>訂單編號：#{o.id}</p>
              <strong>{o.amount}</strong>
            </div>
            <div className="tp-order-side">
              <span className="tp-status tp-status-completed">{o.status}</span>
              <div className="tp-order-actions">
                <Link className="tp-btn tp-btn-ghost" href={`/orders/${o.id}`}>查看訂單</Link>
                <button className="tp-btn tp-btn-primary">撰寫評價</button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
