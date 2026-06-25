import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * Locale-aware 導覽 API（#multilingual Phase 0）。
 *
 * 用這裡匯出的 `Link` / `useRouter` / `usePathname` / `redirect` 取代
 * `next/link`、`next/navigation`，它們會依目前 locale 自動補/去 `/en` 等前綴
 * （`as-needed` 下 zh-Hant 不加前綴）。`usePathname()` 回傳的是**去前綴後**的
 * 內部 pathname，因此 Navbar 既有的 `pathname.startsWith(href)` active 判斷可沿用。
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
