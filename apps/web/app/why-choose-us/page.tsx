import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '為什麼選擇我們 | Midao 祕島',
  description: '私人在地導遊 vs 一般跟團：行程彈性、導遊認證、退款保障、深度體驗一次比較清楚。',
  openGraph: {
    title: '為什麼選擇私人在地導遊？ | Midao 祕島',
    description: '不跟團、不趕路。找到懂路的人，用你的節奏認識台灣。',
  },
};

export default function WhyChooseUsPage() {
  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <link rel="preload" as="image" href="https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1400&q=80" fetchPriority="high" />
      {/* Hero */}
      <section style={{
        backgroundImage: 'linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.5)), url(https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1400&q=80)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        borderRadius: 14, padding: '60px 40px', marginTop: 18, color: '#fff',
      }}>
        <h1 style={{ fontSize: 36, marginBottom: 12 }}>為什麼選擇私人在地導遊？</h1>
        <p style={{ fontSize: 18, maxWidth: 600, lineHeight: 1.7, opacity: 0.95 }}>
          跟團趕行程，還是找一個真正懂路的人帶你慢慢走？
        </p>
      </section>

      {/* 4 Promises */}
      <section style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}
        className="why-promises">
        <style>{`@media (min-width: 640px) { .why-promises { grid-template-columns: repeat(4, 1fr) !important; } }`}</style>
        {[
          { icon: '✅', title: '實名認證', desc: '每位導遊都經過 KYC 身分驗證與審核' },
          { icon: '💰', title: '退款保障', desc: '明確退款政策，依規定時間內全額退款' },
          { icon: '📞', title: '緊急熱線', desc: '活動當天有問題，30 分鐘內回應' },
          { icon: '🗺️', title: '客製行程', desc: '可依需求客製化，包團、親子、企業都行' },
        ].map((p, i) => (
          <div key={i} style={{ textAlign: 'center', padding: 20, border: '1px solid var(--tp-border)', borderRadius: 12 }}>
            <p style={{ fontSize: 36, margin: '0 0 8px' }}>{p.icon}</p>
            <h4 style={{ margin: '0 0 6px' }}>{p.title}</h4>
            <p style={{ color: 'var(--tp-muted)', fontSize: 14, margin: 0 }}>{p.desc}</p>
          </div>
        ))}
      </section>

      {/* Comparison table */}
      <section style={{ marginTop: 40 }}>
        <h2 style={{ marginBottom: 16 }}>我們的平台 vs 一般跟團</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--tp-primary)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}></th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--tp-primary)', fontWeight: 700 }}>🌿 我們的平台</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--tp-muted)' }}>🚌 一般跟團</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['同行人數', '只有你（或你的小團）', '10~40 人'],
                ['行程彈性', '完全客製', '固定路線'],
                ['導遊注意力', '全程專注你', '分散給全團'],
                ['退款保障', '明確政策，48hr 前全退', '不一定'],
                ['導遊實名認證', '✅ 全員認證', '不一定'],
                ['緊急聯繫', '30 分鐘回應', '不提供'],
                ['深度體驗', '在地秘境 + 故事', '觀光景點打卡'],
              ].map(([label, us, them], i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--tp-border)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{label}</td>
                  <td style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--tp-primary)' }}>{us}</td>
                  <td style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--tp-muted)' }}>{them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ marginTop: 40 }}>
        <h2 style={{ marginBottom: 16 }}>旅客怎麼說</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 16 }}
          className="why-testimonials">
          <style>{`@media (min-width: 640px) { .why-testimonials { grid-template-columns: repeat(3, 1fr) !important; } }`}</style>
          {[
            { author: '小美（台北）', text: '大人小人都開心😍 Andy 很有耐心，路線比想像中刺激但又很安全！', activity: '柴山探洞' },
            { author: 'Vivian C.（台北）', text: '本來以為只是一般古蹟導覽，沒想到建志帶我們走進了老屋廚房。比任何旅遊書都精彩！', activity: '大稻埕老街' },
            { author: '小琪（新竹）', text: '人生清單打勾！阿明超專業，全程很安心。花蓮最棒的體驗沒有之一！', activity: '花蓮溯溪' },
          ].map((t, i) => (
            <div key={i} style={{ background: 'var(--tp-bg-soft)', border: '1px solid var(--tp-border)', borderRadius: 12, padding: 18 }}>
              <p style={{ color: '#f5a623', margin: '0 0 8px' }}>★★★★★</p>
              <p style={{ lineHeight: 1.7, margin: '0 0 10px' }}>「{t.text}」</p>
              <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: 0 }}>— {t.author} · {t.activity}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ marginTop: 40, textAlign: 'center', padding: '40px 0' }}>
        <h2>準備好了嗎？</h2>
        <p style={{ color: 'var(--tp-muted)', marginBottom: 16 }}>找到懂路的人，用你的節奏認識台灣。</p>
        <Link href="/activities" className="tp-btn tp-btn-primary" style={{ padding: '14px 32px', fontSize: 16 }}>立即探索行程</Link>
      </section>
    </main>
  );
}
