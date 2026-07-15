import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '服務維護中',
  description: '服務暫停維護中，請稍後再試。',
  robots: { index: false },
};

export default function MaintenancePage() {
  return (
    <main
      className="tp-container"
      style={{
        paddingBottom: 60,
        paddingTop: 40,
        textAlign: 'center',
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Wrench SVG icon in brand accent color (朝霞 #C2542E) */}
      <div style={{ marginBottom: 20 }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="72"
          height="72"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#C2542E"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </div>

      {/* Brand name in primary deep color (山墨 #1A2E1F) */}
      <p
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: '#5E7A4F', /* 苔綠 Moss */
          marginBottom: 12,
        }}
      >
        MIDAO · 祕島
      </p>

      <h1
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: '#1A2E1F', /* 山墨 Mountain Ink */
          marginBottom: 12,
          lineHeight: 1.4,
        }}
      >
        服務暫停維護中
      </h1>

      <p
        style={{
          color: 'var(--tp-muted)',
          fontSize: 16,
          marginBottom: 8,
          maxWidth: 380,
          lineHeight: 1.7,
        }}
      >
        請稍後再試。我們正在進行系統維護，感謝您的耐心等候。
      </p>

      <p
        style={{
          color: 'var(--tp-muted)',
          fontSize: 14,
          marginBottom: 32,
          maxWidth: 380,
        }}
      >
        We&apos;ll be back soon — thanks for your patience.
      </p>

      <Link
        href="/"
        className="tp-btn tp-btn-primary"
        style={{ padding: '10px 28px' }}
      >
        回首頁
      </Link>
    </main>
  );
}
