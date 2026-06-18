'use client';

import { usePathname } from 'next/navigation';
import { Footer } from './Footer';

// 商店頁（/guides/[slug]/shop**）是 app 化的預約流程，不顯示全站 footer。
const HIDE_FOOTER_PATTERNS = [/^\/guides\/[^/]+\/shop(\/|$)/];

export function FooterGate() {
  const pathname = usePathname() || '';
  if (HIDE_FOOTER_PATTERNS.some((re) => re.test(pathname))) return null;
  return <Footer />;
}
