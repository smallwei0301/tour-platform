// #1615 第一批：guide／admin availability god-page 拆解時抽出的共用常數、
// 型別與樣式工廠。此檔為「純結構搬移」——所有內容與原頁面逐字相同，
// 僅集中到單一位置供兩頁與其子元件共用，禁止在此檔擅改文案或樣式值。

import type React from 'react';

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
export const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

// guide_availability_rules.start_time_local / end_time_local are Postgres
// `time` columns that round-trip with seconds ("09:00:00"). A native
// <input type="time"> (and the rule card) expect HH:MM, so defensively trim
// seconds before binding/displaying — the API normalizes too, but legacy
// rows or cached state can still carry the seconds.
export const toHhMm = (value: string | null | undefined): string => {
  if (!value) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
};

// 兩頁完全相同的 blackout（休假）資料形狀。
export type BlackoutDate = {
  id: string;
  guide_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  source: 'manual' | 'system';
};

// 季節／預覽提示框的三種語氣配色（原本兩頁各自 inline 一份，值完全相同）。
export const toneStyles = {
  success: { border: '#bbf7d0', background: '#f0fdf4', color: '#166534' },
  info: { border: '#bfdbfe', background: '#eff6ff', color: '#1d4ed8' },
  warning: { border: '#fcd34d', background: '#fffbeb', color: '#92400e' },
} as const;

export type ToneKey = keyof typeof toneStyles;

// 方案人數上下限的統一顯示文案（例：最少 2｜最多 8）。
// guide 版原本參數為必填、admin 版為可選；undefined 與 null 的 `??` 行為相同，
// 故統一為可選簽名，兩頁呼叫點與輸出不變。
export const formatParticipants = (
  minParticipants?: number | null,
  maxParticipants?: number | null,
) => {
  const minText = minParticipants ?? '-';
  const maxText = maxParticipants ?? '-';
  return `最少 ${minText}｜最多 ${maxText}`;
};

// 按鈕樣式工廠（兩頁逐字相同）。
export const btn = (bg: string, color: string, border = 'none') =>
  ({
    padding: '8px 16px',
    borderRadius: 8,
    border,
    background: bg,
    color,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  }) as React.CSSProperties;

export const smallBtn = (bg: string, color: string) =>
  ({
    padding: '4px 10px',
    borderRadius: 6,
    border: 'none',
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  }) as React.CSSProperties;

// guide 頁三張卡片與載入中區塊共用的卡片外框。
export const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #e5e7eb',
  overflow: 'hidden',
};
