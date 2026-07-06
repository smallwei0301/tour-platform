'use client';

/**
 * Issue #1591 — checkout 加購選購器。
 * 讀 GET /api/v2/activities/[id]/addons，讓旅客選數量；把選擇與（顯示用）小計回報上層。
 * 金額僅作前端顯示——下單時 server 以 DB 快照重算（persistOrderAddonsDb），不信任此值。
 *
 * 視覺（BRAND_BOOK「內容延伸組合」苔綠/雲霧/米紙，柔和不搶戲）：
 * 每個加購項為米紙卡片，選取時以苔綠邊框＋淺苔綠底標示；數量器為苔綠描邊圓鈕。
 * 顏色一律用明確 brand hex（不依賴外層主題），確保在白/古紙卡上都清楚。
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

// Midao 八色系統（BRAND_BOOK §03）— 內容延伸組合
const INK = '#2a2422';        // 礦石：主要文字
const MUTED = '#6e6557';      // 次要文字
const MOSS = '#5e7a4f';       // 苔綠：選取/強調
const MOSS_DEEP = '#42583a';  // 苔綠深：數量器文字
const MOSS_TINT = '#eef3ea';  // 苔綠淺底：選取態
const PAPER = '#fbf7ec';      // 米紙卡底
const LINE = '#e6dcc4';       // 米紙描邊

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
    <div style={{ marginTop: 18 }} data-testid="checkout-addons">
      <SectionLabel glyph="＋" title="加購項目" hint="依需求選配，非必選" />
      <div style={{ display: 'grid', gap: 10 }}>
        {addons.map((a) => {
          const q = qty[a.id] || 0;
          const selected = q > 0;
          const unitLabel = a.unit === 'per_group' ? '每團' : '每人';
          const soldOut = a.stock != null && a.stock <= 0;
          return (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 12,
                border: `1px solid ${selected ? MOSS : LINE}`,
                background: selected ? MOSS_TINT : PAPER,
                opacity: soldOut ? 0.55 : 1,
                transition: 'border-color .15s, background .15s',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: INK, lineHeight: 1.35 }}>{a.name}</div>
                <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
                  <span style={{ fontWeight: 600, color: selected ? MOSS_DEEP : MUTED }}>NT${a.priceTwd.toLocaleString()}</span>
                  <span> / {unitLabel}</span>
                  {a.stock != null && !soldOut ? <span style={{ marginLeft: 6, color: '#a2895a' }}>剩 {a.stock}</span> : ''}
                  {soldOut ? <span style={{ marginLeft: 6, color: '#b4553a' }}>已售完</span> : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label={`減少 ${a.name}`}
                  disabled={q <= 0}
                  onClick={() => setQ(a.id, q - 1, a.stock)}
                  style={stepBtn(q <= 0)}
                >
                  −
                </button>
                <span
                  style={{ minWidth: 22, textAlign: 'center', fontSize: 15, fontWeight: 700, color: selected ? MOSS_DEEP : INK }}
                  data-testid={`addon-qty-${a.id}`}
                >
                  {q}
                </span>
                <button
                  type="button"
                  aria-label={`增加 ${a.name}`}
                  disabled={soldOut || (a.stock != null && q >= a.stock)}
                  onClick={() => setQ(a.id, q + 1, a.stock)}
                  style={stepBtn(soldOut || (a.stock != null && q >= a.stock))}
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

/** 段落標題：小圓形字符徽章＋標題＋提示，與站台 checkout 段落語彙一致。 */
export function SectionLabel({ glyph, title, hint }: { glyph: string; title: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 10px' }}>
      <span
        aria-hidden
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, borderRadius: 6, background: '#e7efe1', color: '#42583a',
          fontSize: 13, fontWeight: 700, transform: 'translateY(3px)',
        }}
      >
        {glyph}
      </span>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#1a2e1f' }}>{title}</span>
      {hint ? <span style={{ fontSize: 12, color: '#8a8172' }}>{hint}</span> : null}
    </div>
  );
}

function stepBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 9,
    border: `1px solid ${disabled ? '#d8ccae' : '#5e7a4f'}`,
    background: disabled ? 'transparent' : '#fff',
    color: disabled ? '#b6ac93' : '#42583a',
    fontSize: 17,
    lineHeight: 1,
    cursor: disabled ? 'default' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}
