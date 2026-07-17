// #1735：sib-* 祕島小舖樣式 route-scoped 化（拆自 globals.css）——
// passthrough layout 讓 shop/**（首頁、book、orders）共用同一份 CSS chunk。
import '../../../../../src/styles/shop.css';
import type { ReactNode } from 'react';

export default function ShopLayout({ children }: { children: ReactNode }) {
  return children;
}
