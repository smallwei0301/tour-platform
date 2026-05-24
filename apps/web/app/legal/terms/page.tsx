import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '服務條款 | Midao 祕島',
  description: 'Midao 祕島平台服務條款，說明平台性質、預約流程與旅客權利義務。',
};

export default function TermsPage() {
  return (
    <main className="tp-container tp-static-page">
      <h1>服務條款（草案）</h1>
      <section className="tp-step-card">
        <p>平台提供在地導遊媒合與訂單管理服務，非旅行社包團服務。</p>
        <p>用戶預約前應確認行程內容、取消政策與風險揭露事項。</p>
      </section>
    </main>
  );
}
