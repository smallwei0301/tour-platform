import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隱私政策 | Midao 祕島',
  description: 'Midao 祕島平台的個人資料保護政策，說明資料蒐集範圍、使用方式與用戶權利。',
};

export default function PrivacyPage() {
  return (
    <main className="tp-container tp-static-page">
      <h1>隱私政策（草案）</h1>
      <section className="tp-step-card">
        <p>我們僅在提供服務必要範圍內蒐集資料（訂單、聯絡方式、付款相關資訊）。</p>
        <p>所有個資處理依台灣相關法規辦理，並提供用戶查詢與刪除申請管道。</p>
      </section>
    </main>
  );
}
