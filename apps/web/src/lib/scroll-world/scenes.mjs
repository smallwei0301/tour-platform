/**
 * /world 3D 滾動首頁的場景註冊表（scroll-world 的 sections config 等價物）。
 *
 * 每景欄位：
 * - id：場景鍵，同時是 i18n `home3d.scenes.<id>` 的 key（eyebrow/title/body/tags/cta）。
 * - art：`SceneArt` 的美術鍵（分層 SVG 微景觀）。
 * - accent：本景強調色，一律取 BRAND_BOOK Section 03 八色系統。
 * - href：本景 CTA 目的地（主題頁或行程目錄）。
 *
 * 順序即飛行順序：品牌開場 → 五大主題 → 結尾 CTA。
 */
export const SCROLL_WORLD_SCENES = [
  { id: 'intro', art: 'intro', accent: '#C2542E', href: '/activities' },
  { id: 'mountain', art: 'mountain', accent: '#5E7A4F', href: '/theme/mountain-wilderness' },
  { id: 'river', art: 'river', accent: '#A8B09E', href: '/theme/river-trekking' },
  { id: 'cave', art: 'cave', accent: '#B08D3E', href: '/theme/cave-exploration' },
  { id: 'culture', art: 'culture', accent: '#C2542E', href: '/theme/culture-history' },
  { id: 'ecology', art: 'ecology', accent: '#5E7A4F', href: '/theme/ecology' },
  { id: 'finale', art: 'finale', accent: '#B08D3E', href: '/activities' },
];
