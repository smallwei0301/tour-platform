'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '../../../../src/lib/supabase/client';
import { PersonIcon } from './sib-icons';

// 商店首頁右上角會員入口：
//  - 未登入 → 「會員登入」（導向 /login，登入後回商店訂單區）
//  - 已登入 → 「會員專區」（導向商店的「我的訂單」）
// 在 client 端判斷 supabase session，故商店首頁本身仍可被 CDN/ISR 快取。
export function ShopMemberButton({ slug }: { slug: string }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const ordersHref = `/guides/${slug}/shop/orders`;

  useEffect(() => {
    let mounted = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => { if (mounted) setAuthed(Boolean(data?.user)); })
      .catch(() => { if (mounted) setAuthed(false); });
    return () => { mounted = false; };
  }, []);

  // 確認為已登入才顯示「會員專區」；其餘（載入中／未登入）顯示「會員登入」。
  const isMember = authed === true;
  const href = isMember ? ordersHref : `/login?next=${encodeURIComponent(ordersHref)}`;

  return (
    <Link href={href} data-testid="shop-member-button" className="sib-member-pill">
      <PersonIcon size={17} />
      {isMember ? '會員專區' : '會員登入'}
    </Link>
  );
}
