/**
 * /world 3D 滾動首頁的場景註冊表（scroll-world 的 sections config 等價物）。
 *
 * 每景欄位：
 * - id：場景鍵，同時是 i18n `home3d.scenes.<id>` 的 key（eyebrow/title/body/tags/cta）。
 * - still：場景主圖（AI 生成的黏土微景觀，深色底可直接飄浮在舞台上）。
 * - clip：可選的「飛入」影片（Higgsfield 生成）；有 clip 時相機接近該景會播影片
 *   scrub，still 當 poster／reduced-motion fallback；無 clip 則以 still 當 billboard。
 * - accent：本景強調色，一律取 BRAND_BOOK Section 03 八色系統。
 * - href：本景 CTA 目的地（主題頁或行程目錄）。
 *
 * 順序即飛行順序：品牌開場 → 五大主題 → 結尾 CTA。
 */
/**
 * 開場序章（cold open）：載入先看到島嶼全景靜圖，滾動時向燈籠（origin）
 * 拉近（至 zoom 倍）並平移，讓燈籠落在 target——即首景影片第 0 幀裡
 * 發光涼亭的位置——再淡出溶接（兩畫面同一主體、同一亮點，接點自然）。
 * 時長見 camera.mjs PRELUDE_UNITS。
 */
export const SCROLL_WORLD_PRELUDE = {
  still: '/images/world/prelude.webp',
  origin: '45% 75%', // 起點燈籠在島圖上的位置＝拉近焦點
  target: '28% 69%', // 首景影片第 0 幀涼亭的位置＝燈籠拉近後要落在的螢幕座標
  zoom: 1.9,
};

export const SCROLL_WORLD_SCENES = [
  { id: 'intro', still: '/images/world/intro.webp', clip: '/videos/world/intro.mp4', accent: '#C2542E', href: '/activities' },
  { id: 'mountain', still: '/images/world/mountain.webp', clip: '/videos/world/mountain.mp4', accent: '#5E7A4F', href: '/theme/mountain-wilderness' },
  { id: 'river', still: '/images/world/river.webp', clip: '/videos/world/river.mp4', accent: '#A8B09E', href: '/theme/river-trekking' },
  { id: 'cave', still: '/images/world/cave.webp', clip: '/videos/world/cave.mp4', accent: '#B08D3E', href: '/theme/cave-exploration' },
  { id: 'culture', still: '/images/world/culture.webp', clip: '/videos/world/culture.mp4', accent: '#C2542E', href: '/theme/culture-history' },
  { id: 'ecology', still: '/images/world/ecology.webp', clip: '/videos/world/ecology.mp4', accent: '#5E7A4F', href: '/theme/ecology' },
  { id: 'finale', still: '/images/world/finale.webp', clip: '/videos/world/finale.mp4', accent: '#B08D3E', href: '/activities' },
];
