// #1735：route-scoped CSS（拆自 globals.css）掛在 passthrough layout——
// 不掛在 page.tsx 是因為 node --test 會直接 import page 模組，CSS import 會炸。
import '../../../../../src/styles/activity-detail.css';
import type { ReactNode } from 'react';

export default function ActivityDetailLayout({ children }: { children: ReactNode }) {
  return children;
}
