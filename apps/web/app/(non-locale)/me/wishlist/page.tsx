'use client';
import Image from 'next/image';
import Link from 'next/link';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../../src/lib/csrf-client';
import { MemberTabs } from '../../../../src/components/me/MemberTabs';
import { useMeResource } from '../../../../src/lib/use-me-resource';
import { buildActivityHref } from '../../../../src/lib/activity-url';

type WishlistItem = {
  id: string;
  activityId: string;
  addedAt: string;
  title: string;
  slug: string;
  priceTwd: number;
  coverImageUrl: string | null;
  region: string | null;
  regionSlug: string | null;
};

const pageStyle: React.CSSProperties = {
  paddingTop: 32,
  paddingBottom: 56,
  minHeight: '70vh',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--tp-serif)',
  fontSize: 'clamp(22px, 5vw, 28px)',
  fontWeight: 700,
  color: 'var(--tp-text)',
  margin: '0 0 4px',
  letterSpacing: '0.02em',
};

const subtitleStyle: React.CSSProperties = {
  color: 'var(--tp-muted)',
  fontSize: 13,
  margin: '0 0 20px',
};

export default function WishlistPage() {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  // stale-while-revalidate：切回本分頁時用快取瞬開，背景更新。401 才導登入。
  const { data, loading, error, setData } = useMeResource<WishlistItem[]>('/api/me/wishlist', {
    onUnauthorized: () => router.push(`/login?next=${encodeURIComponent('/me/wishlist')}`),
  });
  const items = data ?? [];

  async function handleRemove(activityId: string) {
    setRemovingId(activityId);
    try {
      const res = await fetch(`/api/me/wishlist/${activityId}`, { method: 'DELETE', headers: csrfHeaders() });
      if (res.ok) {
        // 同步更新快取，切回分頁不會看到已移除的項目又冒出來。
        setData(items.filter((item) => item.activityId !== activityId));
      }
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <main className="tp-container" style={pageStyle}>
      <h1 style={titleStyle} data-testid="my-wishlist-title">我的最愛</h1>
      <p style={subtitleStyle}>你收藏的行程都在這裡，隨時回來預約。</p>
      <MemberTabs />

      {loading && (
        <p style={{ color: 'var(--tp-muted)', textAlign: 'center', padding: '40px 0' }}>載入收藏中…</p>
      )}

      {!loading && error && (
        <p style={{ color: 'var(--tp-accent)', textAlign: 'center', padding: '40px 0' }}>{error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--tp-muted)' }} data-testid="wishlist-empty">
          <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.85 }}>♡</div>
          <p style={{ fontSize: 14, margin: '0 0 18px' }}>目前還沒有收藏的行程</p>
          <Link href="/activities" className="tp-btn tp-btn-primary" style={{ fontSize: 14 }}>
            探索行程
          </Link>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <li
              key={item.id}
              className="tp-card"
              data-testid="wishlist-item"
              style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 12 }}
            >
              <Link
                href={buildActivityHref({ slug: item.slug, region: item.region ?? undefined, regionSlug: item.regionSlug ?? undefined })}
                aria-label={item.title}
                style={{ flex: '0 0 auto', lineHeight: 0 }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: 104,
                    height: 72,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'var(--tp-tint)',
                  }}
                >
                  {item.coverImageUrl && (
                    <Image
                      src={item.coverImageUrl}
                      alt={item.title}
                      fill
                      sizes="104px"
                      style={{ objectFit: 'cover' }}
                    />
                  )}
                </div>
              </Link>

              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={buildActivityHref({ slug: item.slug, region: item.region ?? undefined, regionSlug: item.regionSlug ?? undefined })}
                  style={{
                    color: 'var(--tp-text)',
                    fontWeight: 700,
                    fontSize: 15,
                    lineHeight: 1.4,
                    textDecoration: 'none',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {item.title}
                </Link>
                <p style={{ margin: '6px 0 0', color: 'var(--tp-gold-strong)', fontWeight: 700, fontSize: 14 }}>
                  NT$ {item.priceTwd.toLocaleString()} 起
                </p>
              </div>

              <button
                onClick={() => handleRemove(item.activityId)}
                disabled={removingId === item.activityId}
                aria-label={`移除 ${item.title} 收藏`}
                style={{
                  flex: '0 0 auto',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--tp-muted)',
                  background: 'transparent',
                  border: '1px solid var(--tp-border)',
                  borderRadius: 999,
                  padding: '7px 14px',
                  cursor: removingId === item.activityId ? 'default' : 'pointer',
                  opacity: removingId === item.activityId ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {removingId === item.activityId ? '移除中…' : '移除'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
