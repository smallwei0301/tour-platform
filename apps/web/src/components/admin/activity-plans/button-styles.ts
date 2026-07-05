// 方案管理頁按鈕樣式 helper（#1615 第二批）：自 plans page 原樣拆出，
// 供頁面、方案表單 Modal 與開放季節面板共用，零行為變更。
import type React from 'react';

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
    padding: '5px 12px',
    borderRadius: 6,
    border: 'none',
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  }) as React.CSSProperties;
