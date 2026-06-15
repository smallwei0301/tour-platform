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
  const src = await read('app/activities/[region]/[slug]/page.tsx');
  assert.doesNotMatch(src, /dynamic\s*=\s*['"]force-dynamic['"]/, 'force-dynamic 會關掉 CDN 快取，不得再出現');
  assert.match(src, /export const revalidate = 60/);
  assert.match(src, /generateStaticParams\s*\(/, '需 generateStaticParams()→[] 才會啟用 on-demand ISR');
  // #502 安全護欄：不得用 force-static / unstable_cache（cold-path render lock 元兇）
  assert.doesNotMatch(src, /dynamic\s*=\s*['"]force-static['"]/);
  assert.doesNotMatch(src, /unstable_cache\(/);
});

test('helper revalidateActivityPaths 失效列表＋region＋詳情三個路徑', async () => {
  const src = await read('src/lib/revalidate-activity.mjs');
  assert.match(src, /revalidatePath\(['"]\/activities['"]\)/);
  assert.match(src, /revalidatePath\(`\/activities\/\$\{region\}`\)/);
  assert.match(src, /revalidatePath\(`\/activities\/\$\{region\}\/\$\{slug\}`\)/);
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
  }
});
