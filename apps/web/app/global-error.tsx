'use client';
/**
 * Global Error Boundary
 * Phase 10-3 — Tour Platform
 * Catches unhandled errors at root layout level and reports to Sentry
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="zh-TW">
      <body style={{ fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: '#e85d9b' }}>系統發生錯誤</h2>
        <p style={{ color: '#666' }}>我們已記錄此問題，請稍後再試。</p>
        <button
          onClick={reset}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1.5rem',
            background: '#e85d9b',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          重試
        </button>
      </body>
    </html>
  );
}
