export default function ContactPage() {
  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>首頁 &gt; 聯絡我們</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 32, marginTop: 20 }}
        className="contact-grid">
        <style>{`
          @media (min-width: 640px) {
            .contact-grid { grid-template-columns: 1fr 1fr !important; }
          }
        `}</style>
        <div>
          <h1>聯絡我們</h1>
          <p style={{ color: 'var(--tp-muted)', lineHeight: 1.8, marginBottom: 24 }}>
            有任何問題、合作提案或回饋？歡迎透過以下表單與我們聯繫。我們會在 1-2 個工作天內回覆。
          </p>

          <form style={{ display: 'grid', gap: 14 }}>
            <label style={{ display: 'block' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>姓名 *</span>
              <input type="text" placeholder="您的姓名" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>電子信箱 *</span>
              <input type="email" placeholder="you@example.com" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>主題</span>
              <select style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }}>
                <option>一般詢問</option>
                <option>訂單問題</option>
                <option>導遊合作</option>
                <option>企業包團</option>
                <option>媒體合作</option>
                <option>其他</option>
              </select>
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>訊息 *</span>
              <textarea rows={5} placeholder="請輸入您的訊息⋯"
                style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4, resize: 'vertical' }} />
            </label>
            <button type="submit" className="tp-btn tp-btn-primary" style={{ padding: '12px 0', fontSize: 16 }}>送出訊息</button>
          </form>
        </div>

        <div style={{ paddingTop: 0 }}>
          <div style={{ background: 'var(--tp-bg-soft)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>📧 Email</h3>
            <p style={{ color: 'var(--tp-muted)' }}>hello@tourplatform.tw</p>
          </div>
          <div style={{ background: 'var(--tp-bg-soft)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>📞 客服熱線</h3>
            <p style={{ color: 'var(--tp-muted)' }}>0800-XXX-XXX（平日 9:00-18:00）</p>
          </div>
          <div style={{ background: 'var(--tp-bg-soft)', borderRadius: 12, padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>⏰ 回覆時間</h3>
            <p style={{ color: 'var(--tp-muted)' }}>一般詢問：1-2 個工作天<br />緊急問題（活動當天）：30 分鐘內</p>
          </div>
        </div>
      </div>
    </main>
  );
}
