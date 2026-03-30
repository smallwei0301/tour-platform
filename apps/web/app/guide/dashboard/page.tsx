'use client';

export default function GuideDashboardPage() {
  return (
    <main className="tp-container" style={{ padding: '32px 16px 60px' }}>
      <div className="tp-guide-shell">
        <aside className="tp-guide-sidebar">
          <h2 style={{ marginBottom: 16 }}>導遊後台</h2>
          <nav style={{ display: 'grid', gap: 10 }}>
            {['總覽', '行程管理', '訂單紀錄', '收益結算', '評價回饋', '設定'].map((label) => (
              <button key={label} className="tp-btn" style={{ justifyContent: 'flex-start' }}>{label}</button>
            ))}
          </nav>
          <div style={{ marginTop: 24, padding: 16, borderRadius: 16, background: '#f8fafc' }}>
            <p style={{ fontWeight: 700, marginBottom: 6 }}>今日提醒</p>
            <p style={{ fontSize: 14, color: '#475569' }}>3 筆待回覆詢問、1 筆待確認訂單</p>
          </div>
        </aside>

        <section className="tp-guide-main">
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <p style={{ color: '#64748b', marginBottom: 6 }}>Hi, Tracy Guide 👋</p>
              <h1 style={{ fontSize: 28, margin: 0 }}>導遊營運總覽</h1>
            </div>
            <button className="tp-btn tp-btn-primary">建立新行程</button>
          </header>

          <div className="tp-guide-stats">
            {[
              { label: '本月完成訂單', value: '18 筆', note: '較上月 +12%' },
              { label: '平均評分', value: '4.9 / 5', note: '近 30 天' },
              { label: '本月收入', value: 'NT$ 86,200', note: '含已結算' },
              { label: '待回覆詢問', value: '3 筆', note: '24 小時內' },
            ].map((item) => (
              <div key={item.label} className="tp-guide-card">
                <p style={{ color: '#64748b', marginBottom: 8 }}>{item.label}</p>
                <h3 style={{ margin: 0, fontSize: 22 }}>{item.value}</h3>
                <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>{item.note}</p>
              </div>
            ))}
          </div>

          <div className="tp-guide-grid">
            <div className="tp-guide-card" style={{ minHeight: 220 }}>
              <h3 style={{ marginTop: 0 }}>行程表現</h3>
              <ul style={{ display: 'grid', gap: 8, paddingLeft: 18, color: '#475569' }}>
                <li>城市漫遊（台北）— 8 筆訂單</li>
                <li>在地夜市導覽 — 6 筆訂單</li>
                <li>山林健行（新竹）— 4 筆訂單</li>
              </ul>
            </div>
            <div className="tp-guide-card" style={{ minHeight: 220 }}>
              <h3 style={{ marginTop: 0 }}>近期任務</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {[
                  { title: '回覆 3 筆詢問', meta: '今天 18:00 前' },
                  { title: '更新 2 則行程封面', meta: '本週內' },
                  { title: '查看收益結算明細', meta: '本週五' },
                ].map((task) => (
                  <div key={task.title} style={{ padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{task.title}</p>
                    <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>{task.meta}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .tp-guide-shell {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 24px;
          align-items: start;
        }
        .tp-guide-sidebar {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 20px;
          position: sticky;
          top: 20px;
        }
        .tp-guide-main {
          display: grid;
          gap: 24px;
        }
        .tp-guide-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }
        .tp-guide-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 18px;
        }
        .tp-guide-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        @media (max-width: 1024px) {
          .tp-guide-shell { grid-template-columns: 1fr; }
          .tp-guide-sidebar { position: static; }
          .tp-guide-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .tp-guide-stats { grid-template-columns: 1fr; }
          .tp-guide-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
