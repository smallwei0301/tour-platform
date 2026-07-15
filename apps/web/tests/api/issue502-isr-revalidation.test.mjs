// #502 後續：詳情頁從緊急 force-dynamic 改回 on-demand ISR，admin 變更時以
// revalidatePath 即時失效快取。鎖住「頁面 ISR 設定」與「admin 路由有接線失效」，
// 避免日後有人不小心改回 force-dynamic（又變慢）或漏接 revalidate（內容不更新）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => readFile(path.join(WEB_ROOT, rel), 'utf8');

test('詳情頁走 on-demand ISR：移除 force-dynamic、保留 revalidate=60 + generateStaticParams', async () => {
  const src = await read('app/[locale]/activities/[region]/[slug]/page.tsx');
  assert.doesNotMatch(src, /dynamic\s*=\s*['"]force-dynamic['"]/, 'force-dynamic 會關掉 CDN 快取，不得再出現');
  assert.match(src, /export const revalidate = 60/);
  assert.match(src, /generateStaticParams\s*\(/, '需 generateStaticParams()→[] 才會啟用 on-demand ISR');
  // #502 安全護欄：不得用 force-static / unstable_cache（cold-path render lock 元兇）
  assert.doesNotMatch(src, /dynamic\s*=\s*['"]force-static['"]/);
  assert.doesNotMatch(src, /unstable_cache\(/);
});

test('helper revalidateActivityPaths 失效首頁＋列表＋region＋詳情路徑（用正規化 region slug、含各 locale）', async () => {
  const { activityRevalidationPaths } = await import('../../src/lib/region-slug.mjs');
  const { routing } = await import('../../src/i18n/routing.ts');
  // #1440 回歸：中文地區必須正規化成英文 slug，才會命中實際被快取的詳情頁路徑。
  // '/home'（#1713 搬遷後的經典首頁）：精選與自動行程清單來自已發布行程，上下架／
  // 編輯後一併失效。新 '/'（3D 世界頁）純靜態、無行程資料，毋須失效。
  const paths = activityRevalidationPaths({ region: '高雄市', slug: 'test-2' });
  // 無 locale 基準路徑（相容/保險）仍在。
  for (const p of ['/home', '/activities', '/activities/kaohsiung', '/activities/kaohsiung/test-2']) {
    assert.ok(paths.includes(p), `缺基準路徑 ${p}`);
  }
  // #1488：公開頁搬進 app/[locale]/，as-needed rewrite 後快取鍵帶 locale，故每個 locale
  // 版本都要失效，否則 admin 改完前台不會即時更新。
  for (const locale of routing.locales) {
    assert.ok(paths.includes(`/${locale}/home`), `缺 ${locale} 經典首頁失效路徑`);
    assert.ok(paths.includes(`/${locale}/activities`), `缺 ${locale} 列表失效路徑`);
    assert.ok(paths.includes(`/${locale}/activities/kaohsiung/test-2`), `缺 ${locale} 詳情頁失效路徑`);
  }
  // 不得再用 raw 中文地區直接拼路徑（會打不到快取）。
  const src = await read('src/lib/revalidate-activity.mjs');
  assert.doesNotMatch(src, /\/activities\/\$\{region\}/, '不得用未正規化的 raw region 拼路徑');
  // best-effort：失敗不得擋下 admin 操作
  assert.match(src, /try\s*\{[\s\S]*catch/);
});

test('admin 活動更新/刪除/上下架路由都呼叫 revalidateActivityPaths', async () => {
  for (const rel of [
    'app/api/admin/activities/[id]/route.ts',
    'app/api/admin/activities/[id]/status/route.ts',
  ]) {
    const src = await read(rel);
    assert.match(src, /import \{ revalidateActivityPaths \} from .*revalidate-activity\.mjs/, `${rel} 應 import helper`);
    assert.match(src, /revalidateActivityPaths\(/, `${rel} 應呼叫 revalidateActivityPaths`);
    // #1440：必須帶 regionSlug，否則 revalidate 會打到「raw 中文地區」路徑、對不上快取。
    assert.match(src, /revalidateActivityPaths\(\{[\s\S]*regionSlug:/, `${rel} 應把 regionSlug 一起傳給 revalidate`);
  }
});
