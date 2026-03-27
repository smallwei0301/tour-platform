import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="tp-container tp-static-page">
      <h1>關於我們</h1>
      <section className="tp-step-card">
        <p>
          我們相信旅遊不該只剩打卡，應該是一場和地方建立連結的體驗。
          Tour Platform 讓旅客直接預約在地導遊，讓導遊用專業與故事創造可持續收入。
        </p>
      </section>

      <section className="tp-step-card">
        <h2>我們重視的 4 件事</h2>
        <ul>
          <li>網站可靠上線、可監控、可回滾</li>
          <li>交易流程清楚、付款安全、退款透明</li>
          <li>導遊品質可驗證、可追蹤、可改善</li>
          <li>用戶體驗簡單直接，減少摩擦</li>
        </ul>
      </section>

      <section className="tp-step-card">
        <h2>下一步</h2>
        <p>我們正從單導遊 MVP 擴展到多主題、多城市，逐步驗證供需與單位經濟。</p>
        <div className="tp-step-actions">
          <Link className="tp-btn tp-btn-ghost" href="/guide/apply">成為導遊</Link>
          <Link className="tp-btn tp-btn-primary" href="/activities">探索行程</Link>
        </div>
      </section>
    </main>
  );
}
