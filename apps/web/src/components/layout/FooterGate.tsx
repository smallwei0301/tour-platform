'use client';

import { usePathname } from 'next/navigation';
import { Footer } from './Footer';

// 商店頁（/guides/[slug]/shop**）是 app 化的預約流程，不顯示全站 footer。
// midao2 後台與公開接案頁（/g/[slug]）同為 app 化介面，亦不顯示。
const HIDE_FOOTER_PATTERNS = [
  /^\/guides\/[^/]+\/shop(\/|$)/,
  /^\/midao2(\/|$)/,
  /^\/g\/[^/]+(\/|$)/,
];

export function FooterGate() {
  const pathname = usePathname() || '';
  if (HIDE_FOOTER_PATTERNS.some((re) => re.test(pathname))) return null;
  return <Footer />;
}
