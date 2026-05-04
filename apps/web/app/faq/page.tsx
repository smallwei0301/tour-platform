import Link from 'next/link';

const faqs = [
  {
    category: '預訂與付款',
    items: [
      ['如何預約導遊行程？', '選定行程後直接下單，填寫聯絡資料並完成付款即可。'],
      ['付款後多久收到確認？', '付款成功後會建立訂單，導遊或平台會依流程確認後續細節。'],
      ['可以先卡位再付款嗎？', '目前仍以完成付款作為保留席位的依據。'],
    ],
  },
  {
    category: '退款與取消',
    items: [
      ['退款政策怎麼算？', '活動 48 小時前取消可全額退款；24-48 小時為 50%；24 小時內原則上不退款。'],
      ['如果導遊取消呢？', '若因導遊或平台因素取消，將協助全額退款或改安排替代方案。'],
      ['惡劣天氣可以取消嗎？', '以安全為前提，必要時導遊可取消並走退款流程。'],
    ],
  },
  {
    category: '導遊與平台',
    items: [
      ['導遊有審核嗎？', '有，平台會做實名與資格審核，並持續優化導遊端流程。'],
      ['可以指定語言嗎？', '每位導遊頁面會標示可服務語言，預約前可先確認。'],
      ['想成為導遊怎麼做？', '可前往導遊申請頁填寫資料，通過審核後即可進入後續流程。'],
    ],
  },
];

export default function FaqPage() {
  return (
    <main className="tp-container tp-editorial-page">
      <section className="tp-editorial-hero">
        <p className="tp-editorial-kicker">faq</p>
        <h1>把你最常問的事，整理成可以快速找到答案的 field notes。</h1>
        <p className="tp-editorial-lead">
          我把原本 FAQ 內容保留下來，只重做層次與版型，讓預訂、付款、退款、導遊審核這些問題更容易掃讀。
        </p>
      </section>

      <section className="tp-editorial-section tp-editorial-grid">
        {faqs.map((section) => (
          <article key={section.category} className="tp-editorial-card-soft">
            <h2>{section.category}</h2>
            <div className="tp-editorial-grid">
              {section.items.map(([q, a]) => (
                <div key={q} className="tp-editorial-card">
                  <h3>{q}</h3>
                  <p>{a}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="tp-editorial-section tp-editorial-card">
        <h2>還是沒找到答案？</h2>
        <p>如果你的問題跟訂單、退款、活動當天狀況有關，直接聯絡我們會更快。</p>
        <div className="tp-member-actions-row" style={{ marginTop: 12 }}>
          <Link href="/contact" className="tp-btn tp-btn-primary">聯絡我們</Link>
        </div>
      </section>
    </main>
  );
}
