'use client';

/**
 * Issue #1594 — 會員點數餘額晶片。
 * 讀 GET /api/me/points；有餘額才顯示（避免冷啟動空狀態噪音）。
 */

import { useEffect, useState } from 'react';
import { useTravelerAuth } from '../../lib/use-traveler-auth';

export function PointsBalanceChip() {
  const [balance, setBalance] = useState<number | null>(null);
  const { authed } = useTravelerAuth();

  useEffect(() => {
    if (authed !== true) {
      setBalance(null);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/me/points', { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (alive) setBalance(Number(j?.data?.balance) || 0);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      alive = false;
    };
  }, [authed]);

  if (balance === null || balance <= 0) return null;

  return (
    <span
      data-testid="points-balance-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--tp-tint)',
        border: '1px solid var(--tp-border)',
        borderRadius: 999,
        padding: '5px 14px',
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--tp-gold-strong)',
      }}
    >
      <span aria-hidden>✦</span>
      {balance.toLocaleString()} 點可折抵
    </span>
  );
}
