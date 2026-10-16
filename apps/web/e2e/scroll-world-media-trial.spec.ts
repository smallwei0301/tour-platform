/**
 * Blob 試驗的獨立 public-home browser gate；不動既有 frozen specs／auth／DB。
 * 預設驗原 local build；核准 Preview 使用 TOUR_WORLD_E2E_MEDIA_MODE=blob-trial。
 * 此 spec 不上傳、不下載全14檔；遠端 SHA／Range 與 deployment rollback 另須實驗證據。
 */
import type { Page } from '@playwright/test';
import { test, expect } from './helpers';

const sceneIds = ['intro', 'mountain', 'river', 'cave', 'culture', 'ecology', 'finale'];
const blobOrigin = 'https://pekgelfm9z6nkvfj.public.blob.vercel-storage.com';
const mediaMode = process.env.TOUR_WORLD_E2E_MEDIA_MODE || 'local';
if (!['local', 'blob-trial'].includes(mediaMode)) throw new Error('WORLD_MEDIA_E2E_MODE_INVALID');

function sourceScene(source: string, pageOrigin: string): string {
  const url = new URL(source, pageOrigin);
  expect(url.search).toBe('');
  expect(url.hash).toBe('');
  if (mediaMode === 'blob-trial') {
    expect(url.origin).toBe(blobOrigin);
    const match = /^\/world-media\/v1\/([a-z]+)\/[a-f0-9]{64}\.(mp4|webm)$/.exec(url.pathname);
    expect(match).not.toBeNull();
    return match![1];
  }
  expect(url.origin).toBe(pageOrigin);
  const match = /^\/videos\/world\/([a-z]+)\.(mp4|webm)$/.exec(url.pathname);
  expect(match).not.toBeNull();
  return match![1];
}

async function mediaState(page: Page) {
  return page.locator('.sw-root video').evaluateAll((videos) => videos.map((element) => {
    const video = element as HTMLVideoElement;
    return {
      source: video.src, paused: video.paused, autoplay: video.autoplay,
      muted: video.muted, inline: video.playsInline, preload: video.preload,
      poster: video.getAttribute('poster'), currentTime: video.currentTime,
      duration: video.duration, ready: video.readyState,
    };
  }));
}

async function scrollProgress(page: Page, progress: number) {
  await page.locator('.sw-root > div').first().evaluate((root, value) => {
    const rectangle = root.getBoundingClientRect();
    const scrollable = rectangle.height - window.innerHeight;
    window.scrollTo({ top: window.scrollY + rectangle.top + value * scrollable, behavior: 'instant' });
  }, progress);
}

test.describe('祕島世界媒體可逆試驗', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'no-preference' }); });

  test('單一 codec、paused scrub 與 active±1 媒體掛載', async ({ page }) => {
    await page.goto('/');
    const videos = page.locator('.sw-root video');
    const rail = page.locator('.sw-root nav button');
    await expect(rail).toHaveCount(sceneIds.length);
    await expect(videos).toHaveCount(2);
    const initial = await mediaState(page);
    const pageOrigin = new URL(page.url()).origin;
    expect(initial.map((video) => sourceScene(video.source, pageOrigin))).toEqual(sceneIds.slice(0, 2));
    const codecs = new Set(initial.map((video) => new URL(video.source).pathname.split('.').at(-1)));
    expect(codecs.size).toBe(1);
    for (const video of initial) {
      expect(video.paused).toBe(true);
      expect(video.autoplay).toBe(false);
      expect(video.muted).toBe(true);
      expect(video.inline).toBe(true);
      expect(video.preload).toBe('metadata');
      expect(video.poster).toMatch(/^\/images\/world\/[a-z]+\.webp$/);
    }
    await expect.poll(async () => (await mediaState(page))[0].ready, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    await scrollProgress(page, 0.06);
    // Intro 章節進度：(0.06 * (7*0.45+6) - 0.3) / (0.95-0.3)。
    await expect.poll(async () => {
      const video = (await mediaState(page))[0];
      return video.currentTime / video.duration;
    }, { timeout: 30_000 }).toBeCloseTo(0.383, 1);
    expect((await mediaState(page))[0].paused).toBe(true);

    await rail.nth(3).click();
    await expect(rail.nth(3)).toHaveAttribute('aria-current', 'true');
    await expect(videos).toHaveCount(3);
    const middle = await mediaState(page);
    expect(middle.map((video) => sourceScene(video.source, pageOrigin))).toEqual(sceneIds.slice(2, 5));
    expect(new Set(middle.map((video) => new URL(video.source).pathname.split('.').at(-1)))).toEqual(codecs);
    expect(middle.every((video) => video.paused && !video.autoplay)).toBe(true);
  });

  test('reduced-motion 只保留完整海報與 CTA，不掛影片', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.sw-root section')).toHaveCount(sceneIds.length);
    await expect(page.locator('.sw-root video')).toHaveCount(0);
    await expect(page.locator('.sw-root section a')).toHaveCount(sceneIds.length);
    const images = page.locator('.sw-root section img');
    await expect(images).toHaveCount(sceneIds.length);
    await expect.poll(() => images.evaluateAll((elements) => elements.every((element) => {
      const image = element as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    })), { timeout: 30_000 }).toBe(true);
  });

  test('影片讀取失敗時保留已載入海報、文案與導軌', async ({ page }) => {
    let rejectedMedia = 0;
    await page.route(/\.(mp4|webm)(?:\?.*)?$/, async (route) => {
      rejectedMedia += 1;
      await route.abort('failed');
    });
    await page.goto('/');
    await expect(page.locator('.sw-root video')).toHaveCount(2);
    await expect.poll(() => rejectedMedia).toBeGreaterThan(0);
    await expect.poll(() => page.locator('.sw-root video').first().evaluate((element) => Boolean((element as HTMLVideoElement).error))).toBe(true);
    await expect(page.locator('.sw-root h1')).toBeVisible();
    const rail = page.locator('.sw-root nav button');
    await expect(rail).toHaveCount(sceneIds.length);
    await rail.nth(3).click();
    await expect(rail.nth(3)).toHaveAttribute('aria-current', 'true');
    for (const video of await mediaState(page)) {
      expect(video.paused).toBe(true);
      expect(video.poster).toMatch(/^\/images\/world\/[a-z]+\.webp$/);
    }
    await expect.poll(() => page.locator('.sw-root img').evaluateAll((elements) => elements.every((element) => {
      const image = element as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    })), { timeout: 30_000 }).toBe(true);
  });
});
