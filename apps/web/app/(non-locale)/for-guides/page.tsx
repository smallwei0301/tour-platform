import Link from 'next/link';
import type { Metadata } from 'next';

// Midao for Guides — 導遊開店 landing（非 localized root 路徑，靜態可快取）。
// 對導遊的第一階段主張：一條連結＝個人預約頁＋線上收款＋訂單管理。
// 申請入口沿用既有 /guide/apply 表單頁，本頁只負責說清楚「你會得到什麼」。

export const metadata: Metadata = {
  title: '導遊開店 — 你的線上預約頁 | Midao 祕島',
  description:
    '把你熟的路，變成你的預約頁。祕島替導遊處理預約、收款、訂單管理——一條連結，放進 IG bio、LINE 群組、名片。Beta 期間月費 NT$0，成交才收 15% 服務費。',
};

const BENEFITS = [
  {
    title: '你的專屬預約頁',
    desc: '行程、方案、可預約時段都在同一頁。旅客不用註冊就能看行程、選日期。',
  },
  {
    title: '線上收款',
    desc: '信用卡經 ECPay 直接付款，錢進得清楚，不用再對帳到半夜。',
  },
  {
    title: '訂單自己進來',
    desc: '你設定開放時段，旅客自己選、自己下單。每筆訂單狀態後台都看得到，還能綁 LINE 接通知。',
  },
];

const STEPS = [
  { num: '01', title: '送出導遊申請', desc: '填一次基本資料與專長，審核通過就能開店。' },
  { num: '02', title: '上架行程與方案', desc: '定價、時長、人數上限自己定；設定可預約時段，不用再來回問空檔。' },
  { num: '03', title: '分享你的預約頁', desc: '複製連結或 QR code，放進 IG bio、LINE 群組、名片，開始收單。' },
];

const FAQS = [
  {
    q: '需要什麼資格才能開店？',
    a: '通過祕島的導遊審核即可。送出申請時附上你的專長、熟悉區域與相關證照（如急救、領隊導遊證），審核通過後就能上架行程。',
  },
  {
    q: '錢什麼時候入帳？',
    a: '旅客線上付款後由平台代收，行程完成後依結算週期出款到你的帳戶，後台可以看到每一筆的預計入帳與出款日。',
  },
  {
    q: '旅客臨時取消怎麼辦？',
    a: '每個行程都掛有明確的取消與退款規則，旅客預約時就看得到；取消發生時依規則自動計算退款比例，不用你出面協商。',
  },
  {
    q: '可以同時經營自己的 IG 或 LINE 嗎？',
    a: '可以，而且我們鼓勵你這麼做。預約頁就是為了讓你放進 IG bio、LINE 群組與名片——粉絲點進來直接下單，你不用再手動排時間、記帳。',
  },
];

export default function ForGuidesPage() {
  return (
    <main className="lp-apply">
      {/* Hero */}
      <header className="lp-apply-hero">
        <p className="lp-apply-eyebrow">MIDAO FOR GUIDES · 導遊開店</p>
        <h1 className="lp-apply-title">把你熟的路，變成你的預約頁</h1>
        <p className="lp-apply-lead">
          你帶路，祕島替你處理預約、收款、訂單。
          一條連結，放進 IG bio、LINE 群組、名片，旅客就能直接預約你。
        </p>
        <div className="lp-fg-hero-cta">
          <Link href="/guide/apply" className="lp-fg-btn-primary">免費開通我的預約頁</Link>
          <Link href="/guide/login" className="lp-fg-btn-ghost">登入導遊後台</Link>
        </div>
      </header>

      <div className="lp-apply-body">
        {/* 三個核心利益 */}
        <section className="lp-fg-section" aria-label="核心功能">
          <div className="lp-apply-perks">
            {BENEFITS.map((b) => (
              <div key={b.title} className="lp-apply-perk lp-fg-benefit">
                <strong>{b.title}</strong>
                <span>{b.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 三步驟 */}
        <section className="lp-fg-section">
          <h2 className="lp-fg-heading">三步開店</h2>
          <ol className="lp-fg-steps">
            {STEPS.map((s) => (
              <li key={s.num}>
                <span className="lp-fg-step-num">{s.num}</span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 定價 */}
        <section className="lp-fg-section" data-testid="fg-pricing">
          <h2 className="lp-fg-heading">怎麼收費</h2>
          <div className="lp-fg-pricing">
            <p className="lp-fg-price"><strong>Beta 期間月費 NT$0</strong></p>
            <p>每筆成交收 <strong>15% 平台服務費</strong>，含金流手續費與客服支援。</p>
            <p className="lp-fg-price-note">沒有成交，不收一毛錢。</p>
          </div>
        </section>

        {/* 預約頁長什麼樣（靜態示意，不連真實商店） */}
        <section className="lp-fg-section" aria-label="預約頁示意">
          <h2 className="lp-fg-heading">你的預約頁長這樣</h2>
          <div className="lp-fg-preview" aria-hidden="true">
            <div className="lp-fg-preview-header">
              <span className="lp-fg-preview-avatar">嚮</span>
              <div>
                <p className="lp-fg-preview-name">阿明 的祕島預約頁</p>
                <p className="lp-fg-preview-sub">✓ 祕島審核導遊 · ★ 4.9（87 則評論）</p>
              </div>
            </div>
            <div className="lp-fg-preview-card">
              <p className="lp-fg-preview-title">柴山半日探洞</p>
              <p className="lp-fg-preview-meta">約 4 小時 · 4–12 人</p>
              <p className="lp-fg-preview-price">NT$2,000 / 人</p>
            </div>
            <div className="lp-fg-preview-cta">開始預約</div>
          </div>
          <p className="lp-fg-preview-caption">
            旅客免登入就能看方案、選日期；付款前才需要登入，下單不卡關。
          </p>
        </section>

        {/* FAQ */}
        <section className="lp-fg-section" data-testid="fg-faq">
          <h2 className="lp-fg-heading">常見問題</h2>
          <div className="lp-fg-faq">
            {FAQS.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 底部 CTA（BRAND_BOOK 05-04） */}
        <section className="lp-fg-section lp-fg-closing">
          <h2 className="lp-fg-closing-title">把你熟的路分享出來</h2>
          <p>你在山裡、海邊、老街走了那麼多年——該有一頁是你自己的。</p>
          <Link href="/guide/apply" className="lp-fg-btn-primary">免費開通我的預約頁</Link>
        </section>
      </div>
    </main>
  );
}
