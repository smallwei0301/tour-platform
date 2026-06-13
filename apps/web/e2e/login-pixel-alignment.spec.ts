import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 旅客登入頁 · 像素級對齊回歸測試
 *
 * 對照設計稿 `e2e/fixtures/login-target.png`（山墨×古紙×黃銅 品牌登入頁，
 * 行動裝置直式 426×922）。以 pixelmatch 比對渲染結果，相似度需 ≥ 95%。
 *
 * 比對門檻採用 threshold 0.2（Playwright `toHaveScreenshot` 的預設值，
 * 業界視覺回歸標準）——殘差主要是設計稿（AI 產製）與真實瀏覽器字體
 * 邊緣抗鋸齒差異，並非版面位移。版面（羅盤、字標、卡片、按鈕、結語）
 * 皆已逐元素對齊。
 *
 * 註：本 spec 對字體渲染環境敏感，不納入 e2e-smoke / ci 主線，
 * 以 `npm run test:e2e -w @tour/web -- e2e/login-pixel-alignment.spec.ts` 手動執行。
 */

const W = 426;
const H = 922;
const MIN_SIMILARITY = 0.95;

test.use({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
});

test('旅客登入頁與設計稿像素對齊 ≥ 95%', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' });
  // 隱藏 Next.js dev 疊層指示器，避免污染左下角比對
  await page.addStyleTag({
    content: 'nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}',
  });
  // 等待背景圖與襯線字體載入穩定
  await page.waitForTimeout(800);

  const shotBuf = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
  const shot = PNG.sync.read(shotBuf);

  const fixturesDir = path.join(process.cwd(), 'e2e', 'fixtures');
  const targetPath = path.join(fixturesDir, 'login-target.png');
  const target = PNG.sync.read(fs.readFileSync(targetPath));

  expect(shot.width).toBe(target.width);
  expect(shot.height).toBe(target.height);

  const diff = new PNG({ width: W, height: H });
  const numDiff = pixelmatch(target.data, shot.data, diff.data, W, H, { threshold: 0.2 });
  const total = W * H;
  const similarity = (total - numDiff) / total;

  // 比對失敗時輸出 diff，方便排查
  if (similarity < MIN_SIMILARITY) {
    fs.writeFileSync(path.join(fixturesDir, 'login-diff.png'), PNG.sync.write(diff));
  }

  // eslint-disable-next-line no-console
  console.log(`login pixel similarity: ${(similarity * 100).toFixed(2)}% (diff ${numDiff}/${total})`);
  expect(similarity).toBeGreaterThanOrEqual(MIN_SIMILARITY);
});
