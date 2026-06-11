'use client';

import { useEffect, useState } from 'react';

/**
 * #1381 — 活動頁公開促銷碼提示。
 * 撈 /api/promo-codes/public（過期/用罄的碼後端已排除），無可用碼時不渲染。
 */
export function PublicPromoBanner() {
  const [promos, setPromos] = useState<Array<{ code: string; label: string }>>([]);

  useEffect(() => {
    fetch('/api/promo-codes/public')
      .then((r) => r.json())
      .then((j) => setPromos(Array.isArray(j?.data) ? j.data : []))
      .catch(() => {});
  }, []);

  if (promos.length === 0) return null;

  return (
    <div
      data-testid="public-promo-banner"
      style={{
        background: '#fdf2f8',
        border: '1px solid #f9a8d4',
        borderRadius: 12,
        padding: '10px 14px',
        margin: '12px 0',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: '#be185d' }}>🎁 限時優惠</span>
      {promos.map((p) => (
        <span key={p.code} style={{ fontSize: 13, color: '#9d174d' }}>
          {p.label}（結帳輸入 <strong>{p.code}</strong>）
        </span>
      ))}
    </div>
  );
}
