'use client';

/**
 * Issue #1594 — checkout 點數折抵。
 * 讀 GET /api/me/points 取餘額；可折抵上限 = min(餘額, 訂單金額×30%)（points-calc）。
 * 1 點折 1 元。金額僅前端顯示——下單時 server 以 redeemPointsForOrderDb 夾限重算為準。
 * 未登入或無餘額時整塊不顯示。
 *
 * 視覺（BRAND_BOOK「精品/會員組合」黃銅＋礦石，讓使用者感受到會員專屬）：
 * 黃銅描邊卡片＋淡黃銅底，硬幣徽章，餘額與可折抵金額以黃銅金強調。
 * 顏色用明確 brand hex，確保在白/古紙卡上都清楚。
 */

import { useEffect, useMemo, useState } from 'react';
import { maxRedeemable } from '../../lib/points-calc.mjs';

// Midao 八色系統（BRAND_BOOK §03）— 精品/會員組合
const INK = '#2a2422';         // 礦石：主要文字
const MUTED = '#6e6557';       // 次要文字
const BRASS = '#9c7c30';       // 黃銅（文字級加深，白底可讀）
const BRASS_BG = '#faf3e1';    // 淡黃銅底
const BRASS_LINE = '#e2cf9c';  // 黃銅描邊

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
    <div
      style={{
        marginTop: 16,
        borderRadius: 12,
        border: `1px solid ${use ? BRASS : BRASS_LINE}`,
        background: BRASS_BG,
        padding: '12px 14px',
        transition: 'border-color .15s',
      }}
      data-testid="checkout-points"
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
        <span
          aria-hidden
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #d9bd6f 0%, #b08d3e 70%)',
            color: '#fff', fontSize: 15, fontWeight: 700, boxShadow: '0 1px 2px rgba(120,90,30,0.35)',
          }}
        >
          ◆
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: INK }}>
            使用會員點數折抵{' '}
            <span style={{ color: BRASS }}>{cap.toLocaleString()}</span> 元
          </span>
          <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 1 }}>
            餘額 {balance.toLocaleString()} 點 · 本單最高折抵 30%
          </span>
        </span>
        <input
          type="checkbox"
          checked={use}
          onChange={(e) => setUse(e.target.checked)}
          data-testid="points-redeem-toggle"
          style={{ width: 20, height: 20, accentColor: BRASS, cursor: 'pointer', flexShrink: 0 }}
        />
      </label>
    </div>
  );
}
