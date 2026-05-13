import Link from 'next/link';

const faqs = [
  {
    category: '預訂與付款',
    items: [
      { q: '如何預約導遊行程？', a: '選擇行程後點擊「立即預約」，填寫聯絡資訊並完成付款即可。我們支援信用卡與 LINE Pay。' },
      { q: '付款後多久會收到確認？', a: '付款成功後系統會立即發送確認信到您的 Email。導遊通常會在 24 小時內聯繫您確認細節。' },
      { q: '可以先預留行程、之後再付款嗎？', a: '目前需完成付款才算確認預約。建議您在確定出發時間後再完成訂單，避免因名額已滿而無法預約。' },
    ],
  },
  {
    category: '退款與取消',
    items: [
      { q: '退款政策是什麼？', a: '活動開始前 48 小時以上取消，全額退款。活動前 24–48 小時取消，退款 50%。活動前 24 小時內取消，不予退款（特殊情況除外）。' },
      { q: '如果導遊取消行程怎麼辦？', a: '若因導遊或平台原因取消，將全額退款，並協助您重新安排或推薦替代行程。' },
      { q: '遇到惡劣天氣可以取消嗎？', a: '若天氣條件危及安全，導遊有權取消並全額退款。請在出發前與導遊確認天氣狀況。' },
    ],
  },
  {
    category: '關於導遊',
    items: [
      { q: '導遊都有認證嗎？', a: '所有導遊都需通過實名 KYC 身份認證與平台審核，確認其導覽資格與背景。' },
      { q: '可以指定導遊語言嗎？', a: '每位導遊的頁面上都會標示服務語言。目前多數導遊提供中文（繁體）服務，部分導遊可提供英文服務。' },
      { q: '如何評價導遊？', a: '活動結束後您會收到評價邀請。我們鼓勵旅客分享真實體驗，幫助其他旅客做出更好的選擇。' },
    ],
  },
  {
    category: '其他',
    items: [
      { q: '可以包場（企業、家族包團）嗎？', a: '可以！請透過「聯絡我們」頁面或直接聯繫導遊，我們可以為您量身規劃包場行程。' },
      { q: '行程中發生意外怎麼辦？', a: '活動當天如有緊急狀況，請直接聯繫導遊。平台緊急熱線也會在 30 分鐘內回應。' },
      { q: '想成為導遊怎麼申請？', a: '請前往「成為導遊」頁面填寫申請表，審核通過後即可上架行程。' },
    ],
  },
];

export default function FaqPage() {
  return (
    <main className="tp-container tp-editorial-page midao-page" style={{ paddingBottom: 56 }}>
      <div className="tp-breadcrumb tp-editorial-breadcrumb">
        <Link href="/">首頁</Link> &gt; 常見問題
      </div>

      <section
        className="tp-editorial-hero"
        style={{
          backgroundImage:
            'linear-gradient(rgba(14, 26, 20, 0.38), rgba(14, 26, 20, 0.52)), url(/images/midao-style/about-hero.png)',
        }}
      >
        <h1>常見問題</h1>
        <p>把預約、付款、取消與安全相關的問題整理成一份可快速查找的現場手冊。</p>
      </section>

      <p style={{ color: 'var(--tp-muted)', marginBottom: 4, fontSize: 16 }}>找不到答案？歡迎<Link href="/contact" style={{ color: 'var(--tp-primary)' }}>聯絡我們</Link>。</p>

      <div style={{ display: 'grid', gap: 36 }}>
        {faqs.map((section) => (
          <section key={section.category}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tp-primary)', marginBottom: 14, paddingBottom: 8, borderBottom: '2px solid var(--tp-primary)' }}>
              {section.category}
            </h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {section.items.map((item, i) => (
                <div key={i} className="midao-card" style={{ padding: '16px 18px' }}>
                  <p style={{ fontWeight: 700, margin: '0 0 6px', fontSize: 15 }}>Q：{item.q}</p>
                  <p style={{ color: 'var(--tp-muted)', margin: 0, lineHeight: 1.8, fontSize: 14 }}>A：{item.a}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="midao-card" style={{ marginTop: 40, textAlign: 'center', padding: '28px 20px' }}>
        <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 8px' }}>還有其他問題？</p>
        <p style={{ color: 'var(--tp-muted)', margin: '0 0 14px', fontSize: 14 }}>我們的客服團隊在 1–2 個工作天內回覆</p>
        <Link href="/contact" className="tp-btn tp-btn-primary" style={{ padding: '10px 28px' }}>聯絡我們</Link>
      </div>
    </main>
  );
}
