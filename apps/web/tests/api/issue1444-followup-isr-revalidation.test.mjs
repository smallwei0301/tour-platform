// #1444 後續（擴大檢查 ISR 同類 bug）：mutation 後若不主動失效 ISR 快取，前台就
// 看不到變更。本檔鎖住兩條先前漏接的路由：
//   1. 評論審核（approve/reject）後，必須失效該行程詳情頁（force-cache，不會自癒）。
//   2. 首頁精選大卡／輪播相片更新後，必須失效首頁 `/`（revalidate=60 ISR）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => readFile(path.join(WEB_ROOT, rel), 'utf8');

test('評論審核路由：approve/reject 後以 revalidateActivityPaths 失效該行程詳情頁（帶 regionSlug）', async () => {
  const src = await read('app/api/admin/reviews/[id]/route.ts');
  assert.match(
    src,
    /import \{ revalidateActivityPaths \} from .*revalidate-activity\.mjs/,
    '應 import revalidateActivityPaths helper',
  );
  assert.match(src, /revalidateActivityPaths\(/, '審核後應呼叫 revalidateActivityPaths');
  // 必須帶正規化用的 regionSlug，否則 revalidate 會打到 raw 中文地區、對不上快取。
  assert.match(src, /revalidateActivityPaths\(\{[\s\S]*regionSlug:/, '應把 regionSlug 一起傳給 revalidate');
  // 必須以 review 的 activity_slug 為 key（審核對象就是該行程）。
  assert.match(src, /slug:\s*review\.activity_slug/, '應以 review.activity_slug 失效對應行程');
});

test('首頁精選路由：PUT 成功後失效首頁 ISR（含各 locale，#1488）', async () => {
  const src = await read('app/api/admin/homepage-featured/route.ts');
  assert.match(src, /import \{ revalidatePath \} from ['"]next\/cache['"]/, '應 import revalidatePath');
  // #1488：首頁在 app/[locale]/，需以 localizeRevalidationPaths 展開各 locale 前綴才命中快取。
  assert.match(src, /localizeRevalidationPaths/, '應 import/使用 localizeRevalidationPaths');
  assert.match(src, /localizeRevalidationPaths\(\s*\[\s*['"]\/home['"]\s*\]\s*\)/, '經典首頁應以 localizeRevalidationPaths(["/home"]) 展開（#1713 搬遷）');
  assert.match(src, /revalidatePath\(p\)/, '應對每個 locale 版本 revalidatePath');
  // best-effort：失敗不得擋下 admin 操作
  assert.match(src, /try\s*\{[\s\S]*localizeRevalidationPaths[\s\S]*catch/, 'revalidate 應包在 try/catch');
});
