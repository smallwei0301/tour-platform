import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '找不到頁面 | Midao 祕島',
  description: '你要找的頁面不存在。',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main
      className="tp-container"
      style={{ paddingBottom: 60, paddingTop: 40, textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ fontSize: 72, marginBottom: 16 }}>🗺️</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>找不到這個頁面</h1>
      <p style={{ color: 'var(--tp-muted)', fontSize: 16, marginBottom: 28, maxWidth: 400 }}>
        這個頁面不存在，或是已經移動到其他地方了。你可以從這裡重新出發：
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/" className="tp-btn tp-btn-primary" style={{ padding: '10px 24px' }}>
          回首頁
        </Link>
        <Link href="/activities" className="tp-btn" style={{ padding: '10px 24px', border: '1px solid var(--tp-border)' }}>
          探索行程
        </Link>
      </div>
    </main>
  );
}
