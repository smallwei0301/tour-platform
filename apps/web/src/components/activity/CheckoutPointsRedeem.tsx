'use client';

/**
 * Issue #1594 — checkout 點數折抵。
 * 讀 GET /api/me/points 取餘額；可折抵上限 = min(餘額, 訂單金額×30%)（points-calc）。
 * 1 點折 1 元。金額僅前端顯示——下單時 server 以 redeemPointsForOrderDb 夾限重算為準。
 * 未登入或無餘額時整塊不顯示。
 */

import { useEffect, useMemo, useState } from 'react';
import { maxRedeemable } from '../../lib/points-calc.mjs';

export function CheckoutPointsRedeem({
  orderTwd,
  onChange,
}: {
  orderTwd: number;
  onChange: (redeemPoints: number, discount: number) => void;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [use, setUse] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/me/points', { cache: 'no-store' });
        if (!res.ok) return; // 401（未登入）→ 不顯示
        const j = await res.json();
        if (alive) setBalance(Number(j?.data?.balance) || 0);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const cap = useMemo(() => maxRedeemable(balance || 0, orderTwd), [balance, orderTwd]);
  const redeem = use ? cap : 0;

  useEffect(() => {
    onChange(redeem, redeem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redeem]);

  if (balance === null || balance <= 0 || cap <= 0) return null;

  return (
    <div style={{ borderTop: '1px solid var(--tp-border)', paddingTop: 14, marginTop: 14 }} data-testid="checkout-points">
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={use}
          onChange={(e) => setUse(e.target.checked)}
          data-testid="points-redeem-toggle"
          style={{ width: 18, height: 18 }}
        />
        <span style={{ fontSize: 14 }}>
          使用點數折抵 <span style={{ color: 'var(--tp-gold-strong)', fontWeight: 700 }}>{cap.toLocaleString()}</span> 點
          <span style={{ color: 'var(--tp-muted)', fontSize: 12 }}>（餘額 {(balance).toLocaleString()} 點，本單上限 30%）</span>
        </span>
      </label>
    </div>
  );
}
