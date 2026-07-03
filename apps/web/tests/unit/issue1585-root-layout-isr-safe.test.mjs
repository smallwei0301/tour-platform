/**
 * Issue #1585 — Production 全部 ISR 頁面 500（root layout getLocale()）。
 *
 * Root cause: #1576（closes #1569）把 root layout 改成 `await getLocale()`
 * （next-intl/server）。getLocale() 在無 setRequestLocale cache 時讀 headers()，
 * 而 root layout 是 ISR 頁（導遊詳情/商店、活動詳情）的共同祖先——headers()
 * 在 ISR 靜態生成（prerender-legacy）丟 DynamicServerError → 整個 render 失敗
 * → 所有 ISR 路由 500（連 notFound() 都到不了）。
 *
 * Fix: root layout 回退為同步 component、lang="zh-Hant" 硬編；en 頁的 lang
 * 由 [locale] layout 內的 HtmlLangSync（client）在 hydration 後補正。
 *
 * 本檔為 source-contract 鎖定（防回歸）：
 *  - root layout 禁止 import next-intl/server 與 next/headers（dynamic API）。
 *  - root layout 為同步 function 並硬編 lang="zh-Hant"。
 *  - [locale] layout 掛 HtmlLangSync；HtmlLangSync 為 client component 且
 *    reuse routing.ts 的 HTML_LANG/isAppLocale。
 *
 * Runtime 行為由 CI 的 production ISR smoke（scripts/isr-smoke.sh）實測——
 * dev server 全 dynamic 渲染，Playwright/dev 測不到 ISR 靜態生成的失敗。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_LAYOUT = join(__dirname, '../../app/layout.tsx');
const LOCALE_LAYOUT = join(__dirname, '../../app/[locale]/layout.tsx');
const HTML_LANG_SYNC = join(__dirname, '../../src/components/i18n/HtmlLangSync.tsx');

const rootLayoutSrc = readFileSync(ROOT_LAYOUT, 'utf8');
const localeLayoutSrc = readFileSync(LOCALE_LAYOUT, 'utf8');
const htmlLangSyncSrc = readFileSync(HTML_LANG_SYNC, 'utf8');

test('#1585 root layout 不得 import next-intl/server（getLocale 會讀 headers()，ISR 500）', () => {
  assert.ok(
    !/from\s+['"]next-intl\/server['"]/.test(rootLayoutSrc),
    'app/layout.tsx 不可 import next-intl/server —— getLocale()/getTranslations() 在 ISR 靜態生成會 DYNAMIC_SERVER_USAGE 500（#1585）'
  );
});

test('#1585 root layout 不得 import next/headers（headers()/cookies() 皆 dynamic API）', () => {
  assert.ok(
    !/from\s+['"]next\/headers['"]/.test(rootLayoutSrc),
    'app/layout.tsx 不可 import next/headers —— ISR 頁的共同祖先禁用 dynamic API（#1585）'
  );
});

test('#1585 root layout 為同步 component 且硬編 lang="zh-Hant"', () => {
  assert.ok(
    /export\s+default\s+function\s+RootLayout/.test(rootLayoutSrc),
    'RootLayout 應為同步 function（async 是 #1576 引入 await getLocale() 的載體）'
  );
  assert.ok(
    /<html\s+lang="zh-Hant">/.test(rootLayoutSrc),
    'SSR 的 <html lang> 應硬編 zh-Hant，locale 修正交給 HtmlLangSync'
  );
});

test('#1585 [locale] layout 掛載 HtmlLangSync（保留 #1569 的 lang 修正）', () => {
  assert.ok(
    /import\s+\{\s*HtmlLangSync\s*\}\s+from/.test(localeLayoutSrc),
    '[locale]/layout.tsx 應 import HtmlLangSync'
  );
  assert.ok(
    /<HtmlLangSync\s*\/>/.test(localeLayoutSrc),
    '[locale]/layout.tsx 應在 NextIntlClientProvider 內渲染 <HtmlLangSync />'
  );
  assert.ok(
    localeLayoutSrc.indexOf('<NextIntlClientProvider') < localeLayoutSrc.indexOf('<HtmlLangSync'),
    'HtmlLangSync 依賴 useLocale()，必須在 NextIntlClientProvider 內'
  );
});

test('#1585 HtmlLangSync 為 client component 且 reuse routing 的 HTML_LANG/isAppLocale', () => {
  assert.ok(
    /^'use client';/.test(htmlLangSyncSrc),
    'HtmlLangSync.tsx 必須是 client component（server 端呼叫 useLocale 無效）'
  );
  assert.ok(
    /useLocale/.test(htmlLangSyncSrc),
    '應使用 next-intl 的 useLocale() 取得當前 locale'
  );
  assert.ok(
    /HTML_LANG/.test(htmlLangSyncSrc) && /isAppLocale/.test(htmlLangSyncSrc),
    '應 reuse src/i18n/routing.ts 的 HTML_LANG 與 isAppLocale（單一真相來源）'
  );
  assert.ok(
    /document\.documentElement\.lang/.test(htmlLangSyncSrc),
    '應設定 document.documentElement.lang'
  );
});
