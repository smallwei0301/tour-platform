import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActivityBySlugDb } from '../../../../src/lib/db.mjs';

export const revalidate = 60;

export async function generateMetadata(
  { params }: { params: Promise<{ region: string; slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} | Tour Platform`,
    description: '探索台灣在地導遊行程',
  };
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ region: string; slug: string }> }) {
  const { slug } = await params;
  const activity = await getActivityBySlugDb(slug).catch(() => null);
  if (!activity) return notFound();

  return (
    <main className="tp-container" style={{ padding: '24px 0 80px' }}>
      <div className="tp-breadcrumb" style={{ marginBottom: 12 }}>
        <Link href="/">首頁</Link> &gt; <Link href="/activities">全部行程</Link> &gt; {activity.region} &gt; {activity.title}
      </div>

      <h1 style={{ margin: '8px 0 6px' }}>{activity.title}</h1>
      {activity.tagline && <p style={{ color: 'var(--tp-muted)', marginBottom: 12 }}>{activity.tagline}</p>}

      <p style={{ marginBottom: 12 }}>
        📍 {activity.region} · 🕐 {activity.durationDisplay || '依行程安排'} · 👥 {activity.minParticipants}~{activity.maxParticipants} 人
      </p>

      <p style={{ marginBottom: 20 }}>
        <strong style={{ color: 'var(--tp-primary)' }}>NT${activity.priceTwd?.toLocaleString()} / 人</strong>
      </p>

      {activity.shortDescription && (
        <p style={{ lineHeight: 1.8, marginBottom: 20 }}>{activity.shortDescription}</p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link
          href={`/checkout?slug=${activity.slug}`}
          className="tp-btn tp-btn-primary"
          data-testid="begin-checkout-btn"
        >
          立即預約
        </Link>
        <Link href="/activities" className="tp-btn tp-btn-ghost">返回全部行程</Link>
      </div>
    </main>
  );
}
