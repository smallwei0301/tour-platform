import Link from 'next/link';

export default function WhyChooseUsPage() {
  return (
    <main className="tp-container tp-static-page">
      <h1>為什麼選擇私人在地導遊？</h1>
      <div className="tp-feature-3col">
        <article>✅ 實名認證</article>
        <article>💰 退款 3 天</article>
        <article>📞 緊急熱線</article>
      </div>

      <section className="tp-step-card">
        <h2>平台 vs 一般跟團</h2>
        <div className="tp-compare-table">
          <div>同行人數</div><div>只有你</div><div>10~40 人</div>
          <div>行程彈性</div><div>完全客製</div><div>固定路線</div>
          <div>退款保障</div><div>3天到帳</div><div>不確定</div>
          <div>導遊實名</div><div>✅</div><div>不一定</div>
        </div>
      </section>

      <section className="tp-step-card">
        <h2>我們的承諾</h2>
        <p>每位導遊皆完成 KYC；每筆訂單可追蹤；遇到問題有 30 分鐘緊急回應機制。</p>
        <Link className="tp-btn tp-btn-primary" href="/activities">立即尋找導遊</Link>
      </section>
    </main>
  );
}
