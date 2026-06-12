'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { buildActivityHref } from '../../lib/activity-url';
import {
  pushRecentlyViewed,
  pickRecommendations,
  RECENTLY_VIEWED_STORAGE_KEY,
} from '../../lib/recently-viewed.mjs';

/**
 * #1382 — 活動頁底部推薦（同地區／同類型）＋最近瀏覽。
 *
 * 全部 client-side、掛在頁面底部：fetch 於 mount 後才發生，不阻塞主內容
 * LCP（見 docs/04-tech/04-tech-architecture/11-frontend-perf-pitfalls.md）。
 * localStorage 一律 try/catch — 無痕模式或停用 storage 時靜默降級。
 */

type ActivityCard = {
  slug: string;
  title: string;
  region?: string;
  regionSlug?: string;
  category?: string;
  priceTwd?: number;
  coverImageUrl?: string | null;
};

function readRecent(): ActivityCard[] {
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecent(list: ActivityCard[]) {
  try {
    window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 無痕模式 / storage 滿 — 靜默略過
  }
}

function CardRow({ heading, items, testId }: { heading: string; items: ActivityCard[]; testId: string }) {
  if (items.length === 0) return null;
  return (
    <section data-testid={testId} style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{heading}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {items.map((a) => (
          <Link
            key={a.slug}
            href={buildActivityHref({ slug: a.slug, region: a.region, regionSlug: a.regionSlug })}
            style={{
              // 與行程列表卡同視覺：深綠卡底＋奶油字（深色 LP 主題）
              display: 'block', border: '1px solid var(--tp-border, #e5e7eb)', borderRadius: 12,
              overflow: 'hidden', textDecoration: 'none', color: 'var(--tp-text)',
              background: 'var(--tp-card-bg, #1f2a1f)',
            }}
          >
            {a.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 推薦小卡，lazy 原生即可
              <img src={a.coverImageUrl} alt={a.title} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', aspectRatio: '4 / 3', background: '#232e21' }} />
            )}
            <div style={{ padding: '8px 10px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</p>
              {a.priceTwd != null && (
                <p style={{ fontSize: 12, color: 'var(--tp-muted, #6b7280)', margin: '4px 0 0' }}>NT${Number(a.priceTwd).toLocaleString()} 起</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ActivityRecommendations({ current }: { current: ActivityCard }) {
  const [sameRegion, setSameRegion] = useState<ActivityCard[]>([]);
  const [sameCategory, setSameCategory] = useState<ActivityCard[]>([]);
  const [recent, setRecent] = useState<ActivityCard[]>([]);

  // 記錄本次瀏覽 + 讀出先前的最近瀏覽（排除當前活動）
  useEffect(() => {
    const prior = readRecent();
    setRecent(prior.filter((a) => a.slug !== current.slug).slice(0, 4));
    writeRecent(pushRecentlyViewed(prior, {
      slug: current.slug,
      title: current.title,
      region: current.region,
      regionSlug: current.regionSlug,
      priceTwd: current.priceTwd,
      coverImageUrl: current.coverImageUrl ?? null,
    }) as ActivityCard[]);
  }, [current.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/activities')
      .then((r) => r.json())
      .then((j) => {
        const all: ActivityCard[] = Array.isArray(j?.data) ? j.data : [];
        const picked = pickRecommendations(all, {
          currentSlug: current.slug,
          region: current.region,
          category: current.category,
          limit: 4,
        });
        setSameRegion(picked.sameRegion as ActivityCard[]);
        setSameCategory(picked.sameCategory as ActivityCard[]);
      })
      .catch(() => {});
  }, [current.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sameRegion.length === 0 && sameCategory.length === 0 && recent.length === 0) return null;

  return (
    <div className="tp-container" style={{ paddingBottom: 24 }}>
      <CardRow heading={`${current.region || ''} 的其他行程`} items={sameRegion} testId="recs-same-region" />
      <CardRow heading="你可能也喜歡" items={sameCategory} testId="recs-same-category" />
      <CardRow heading="最近瀏覽" items={recent} testId="recs-recently-viewed" />
    </div>
  );
}
