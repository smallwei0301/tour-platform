'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main
      style={{ padding: '60px 24px', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>😵</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>頁面載入失敗</h1>
      <p style={{ color: '#666', marginBottom: 24, maxWidth: 360 }}>
        發生了一個錯誤，請稍後再試。
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => reset()}
          style={{ padding: '10px 24px', background: 'var(--tp-primary, #e85d9b)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
        >
          重試
        </button>
        <Link href="/" style={{ padding: '10px 24px', border: '1px solid #ddd', borderRadius: 8, color: 'inherit', textDecoration: 'none' }}>
          回首頁
        </Link>
      </div>
    </main>
  );
}
