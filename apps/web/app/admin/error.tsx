'use client';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>頁面載入發生錯誤</h1>
      <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>
        管理員頁面暫時無法載入。請重試或聯繫系統管理員。
      </p>
      <button
        onClick={reset}
        style={{
          background: 'var(--tp-primary, #7c3aed)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '10px 24px',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        重試
      </button>
    </div>
  );
}
