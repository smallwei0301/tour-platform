// 行程編輯表單共用樣式（#1615 第二批）：自 app/admin/activities/[id]/edit/page.tsx
// 原樣拆出，供頁面與拆出的子元件共用，零行為變更。
import type { CSSProperties } from 'react';

export const fieldStyle: CSSProperties = {
  display: 'block', width: '100%', padding: '10px 12px',
  border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginTop: 4,
};
export const labelStyle: CSSProperties = {
  display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 16,
};
export const sectionTitle: CSSProperties = {
  fontSize: 16, fontWeight: 700, margin: '24px 0 16px',
  paddingBottom: 8, borderBottom: '1px solid #f0f0f0',
};
