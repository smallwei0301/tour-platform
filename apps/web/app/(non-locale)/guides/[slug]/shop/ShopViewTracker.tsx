'use client';

import { useEffect } from 'react';
import { track } from '../../../../../src/lib/track';

// 商店首頁瀏覽事件。首頁本體是可快取的 server component（ISR），
// 事件改由這個不渲染任何內容的 client 子元件在瀏覽器端發射
// （同 ShopMemberButton 的「client 小元件保快取」手法）。
export function ShopViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    track({ event_name: 'shop_view', properties: { guide_slug: slug } });
  }, [slug]);

  return null;
}
