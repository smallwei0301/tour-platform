const faqs = [
  ['私人導遊和一般跟團有什麼不同？', '私人導遊行程裡沒有陌生人，步調、主題、停留時間都由你決定。'],
  ['行程可以客製嗎？', '可以，預訂後可直接與導遊確認需求、體力、飲食限制。'],
  ['退款多久到帳？', '送出申請後 3 個工作天內完成退款，並可在訂單頁追蹤進度。']
];

export function FaqSection() {
  return (
    <section className="tp-section tp-faq">
      <div className="tp-container">
        <h2>常見問題</h2>
        <div className="tp-faq-list">
          {faqs.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
