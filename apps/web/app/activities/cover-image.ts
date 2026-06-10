/**
 * Issue #1344 — 活動卡片 cover 圖的共用常數與 helper。
 *
 * 同時被三處使用，三處必須一致，否則 SSR preload 的 URL 跟
 * next/image 實際 render 的 srcset 對不上 → preload 白做（double
 * download）：
 *
 *   1. `ActivitiesContent.tsx` 的 <Image>（src fallback + sizes）
 *   2. `/activities/page.tsx` 的 <link rel="preload">（imagesrcset）
 *   3. `/activities/[region]/page.tsx` 同上
 *
 * `CARD_IMAGE_WIDTHS` 鏡射 Next.js 預設 deviceSizes ∪ 本卡片會用到的
 * imageSizes（實測 production srcset：384–3840、q=60）。若未來
 * next.config 自訂 deviceSizes 或 quality，這裡要同步改。
 */

export const FALLBACK_COVER_URL =
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80';

/** 跟 `.tp-card-grid-activities`（2 欄 / ≤768px 1 欄）一致的 sizes。 */
export const CARD_IMAGE_SIZES = '(max-width: 768px) 100vw, 50vw';

/** 實測 production next/image srcset 的 w 序列（q=60，對應 next.config images.quality）。 */
export const CARD_IMAGE_WIDTHS = [384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

export function resolveCoverSrc(coverImageUrl?: string | null): string {
  return coverImageUrl || FALLBACK_COVER_URL;
}

/**
 * 產生跟 next/image 完全一致的 `/_next/image` srcset 字串，讓
 * `<link rel="preload" imagesrcset>` 預載的 URL 跟 `<img srcset>`
 * 後續挑中的 URL cache-hit。
 */
export function buildCardImageSrcSet(src: string): string {
  return CARD_IMAGE_WIDTHS
    .map((w) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=60 ${w}w`)
    .join(', ');
}
