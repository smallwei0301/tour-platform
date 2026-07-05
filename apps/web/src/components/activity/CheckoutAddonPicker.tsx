'use client';

/**
 * Issue #1591 — checkout 加購選購器。
 * 讀 GET /api/v2/activities/[id]/addons，讓旅客選數量；把選擇與（顯示用）小計回報上層。
 * 金額僅作前端顯示——下單時 server 以 DB 快照重算（persistOrderAddonsDb），不信任此值。
 */

import { useEffect, useMemo, useState } from 'react';
import { addonLineSubtotal } from '../../lib/addon-pricing.mjs';

export type AddonSelection = { addonId: string; quantity: number };
type AddonDef = {
  id: string;
  name: string;
  priceTwd: number;
  unit: 'per_person' | 'per_group';
  stock: number | null;
  isActive?: boolean;
};

export function CheckoutAddonPicker({
  activityId,
  peopleCount,
  onChange,
}: {
  activityId: string;
  peopleCount: number;
  onChange: (selections: AddonSelection[], addonTotal: number) => void;
}) {
  const [addons, setAddons] = useState<AddonDef[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/v2/activities/${activityId}/addons`, { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (alive) setAddons((j?.data?.items ?? []) as AddonDef[]);
      } catch {
        /* best-effort：加購載入失敗不影響下單 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [activityId]);

  const { selections, addonTotal } = useMemo(() => {
    const sels: AddonSelection[] = [];
    let total = 0;
    for (const a of addons) {
      const q = qty[a.id] || 0;
      if (q > 0) {
        sels.push({ addonId: a.id, quantity: q });
        total += addonLineSubtotal(
          { id: a.id, priceTwd: a.priceTwd, unit: a.unit, stock: a.stock, isActive: a.isActive },
          q,
          peopleCount,
        );
      }
    }
    return { selections: sels, addonTotal: total };
  }, [addons, qty, peopleCount]);

  useEffect(() => {
    onChange(selections, addonTotal);
    // onChange identity 由父層 useCallback 穩定；只在選擇/小計變動時回報。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, addonTotal]);

  if (addons.length === 0) return null;

  function setQ(id: string, next: number, max: number | null) {
    const capped = Math.max(0, Math.min(max == null ? 99 : max, next));
    setQty((prev) => ({ ...prev, [id]: capped }));
  }

  return (
    <div style={{ borderTop: '1px solid var(--tp-border)', paddingTop: 14, marginTop: 14 }} data-testid="checkout-addons">
      <h4 style={{ margin: '0 0 10px' }}>加購項目</h4>
      <div style={{ display: 'grid', gap: 10 }}>
        {addons.map((a) => {
          const q = qty[a.id] || 0;
          const unitLabel = a.unit === 'per_group' ? '每團' : '每人';
          const soldOut = a.stock != null && a.stock <= 0;
          return (
            <div
              key={a.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, opacity: soldOut ? 0.5 : 1 }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: 'var(--tp-muted)' }}>
                  NT${a.priceTwd.toLocaleString()} / {unitLabel}
                  {a.stock != null && !soldOut ? `（剩 ${a.stock}）` : ''}
                  {soldOut ? '（已售完）' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label={`減少 ${a.name}`}
                  disabled={q <= 0}
                  onClick={() => setQ(a.id, q - 1, a.stock)}
                  style={qtyBtnStyle(q <= 0)}
                >
                  −
                </button>
                <span style={{ minWidth: 20, textAlign: 'center', fontSize: 14 }} data-testid={`addon-qty-${a.id}`}>{q}</span>
                <button
                  type="button"
                  aria-label={`增加 ${a.name}`}
                  disabled={soldOut || (a.stock != null && q >= a.stock)}
                  onClick={() => setQ(a.id, q + 1, a.stock)}
                  style={qtyBtnStyle(soldOut || (a.stock != null && q >= a.stock))}
                >
                  ＋
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function qtyBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: '1px solid var(--tp-border)',
    background: 'transparent',
    color: disabled ? 'var(--tp-muted)' : 'var(--tp-text)',
    fontSize: 16,
    lineHeight: 1,
    cursor: disabled ? 'default' : 'pointer',
  };
}
