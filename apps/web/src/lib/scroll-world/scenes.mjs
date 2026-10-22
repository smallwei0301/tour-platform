/**
 * `/`（祕島世界 3D 滾動首頁）的場景註冊表（scroll-world 的 sections config 等價物）。
 *
 * 每景欄位：
 * - id：場景鍵，同時是 i18n `home3d.scenes.<id>` 的 key（eyebrow/title/body/tags/cta）。
 * - still：場景主圖（AI 生成的黏土微景觀，深色底可直接飄浮在舞台上）。
 * - clip：可選的「飛入」影片（Higgsfield 生成）mp4 完整 URL；有 clip 時相機接近該景會播影片
 *   scrub，still 當 poster／reduced-motion fallback；無 clip 則以 still 當 billboard。
 * - clipWebm：同一支影片的 webm（VP9）完整 URL，瀏覽器支援時優先使用。
 *
 * 影片不再隨部署打包：住在 Vercel Blob（WORLD_MEDIA_ORIGIN），路徑 /world-media/v1/<scene>/<sha256>.<ext>，
 * 檔名 hash＝原檔 SHA-256。原檔保留在 Git 的 media/world-videos/（見該目錄 README）。
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

export const WORLD_MEDIA_ORIGIN = 'https://pekgelfm9z6nkvfj.public.blob.vercel-storage.com';

const blob = (id, hash, ext) => `${WORLD_MEDIA_ORIGIN}/world-media/v1/${id}/${hash}.${ext}`;

export const SCROLL_WORLD_SCENES = [
  { id: 'intro', still: '/images/world/intro.webp', clip: blob('intro', 'b882f5627c634a46dc560127dee8ea81acf7270fbc604375f6a6676527700ce5', 'mp4'), clipWebm: blob('intro', '3599a06e091338dbc592cb80207f47fb67b766ccffe283996bb73a1355bc0ba1', 'webm'), accent: '#C2542E', href: '/home' },
  { id: 'mountain', still: '/images/world/mountain.webp', clip: blob('mountain', '712d4472c9fff263fa2ca231c9f20ec0a3b164d6be77bc7101de67f4e8d2767b', 'mp4'), clipWebm: blob('mountain', 'fa9ef0ebeeeb8f863dc28c8a928ecd1a6c227328c4b944d8e7893e91ce10dc57', 'webm'), accent: '#5E7A4F', href: '/theme/mountain-wilderness' },
  { id: 'river', still: '/images/world/river.webp', clip: blob('river', '0e62882910a1e19c91f5c6e65ffc31302485ef8468709dc8d1fa9633d938b0ee', 'mp4'), clipWebm: blob('river', '1dd385a5d046ec00a26bc9b84de5e3609543d3f1ab384bc3a103ff084eb59fd0', 'webm'), accent: '#A8B09E', href: '/theme/river-trekking' },
  { id: 'cave', still: '/images/world/cave.webp', clip: blob('cave', 'aa886cf91b650ed0505d811ce1fa08f0416d964d11daa3a92f93ded155e50750', 'mp4'), clipWebm: blob('cave', 'da2f20c026b610f7df836638bbbe39a5a535a069bc03da50e82a424213e19d65', 'webm'), accent: '#B08D3E', href: '/theme/cave-exploration' },
  { id: 'culture', still: '/images/world/culture.webp', clip: blob('culture', '38911a886576b472dc62ff707e422ae42de619e4c0ae65391bca38ea68a1bd94', 'mp4'), clipWebm: blob('culture', '8fb454f15e5679b260237503271da80aa85081fcf30922d3b32db5475dcab06b', 'webm'), accent: '#C2542E', href: '/theme/culture-history' },
  { id: 'ecology', still: '/images/world/ecology.webp', clip: blob('ecology', '47e426eb9136646acf869e89e7fb372f864d1eb10e28b06b09ad1b6a2fd74e71', 'mp4'), clipWebm: blob('ecology', '9fed988464ef08c547205601f678ed032f79b12188ee32696922a9cf8f7df0d9', 'webm'), accent: '#5E7A4F', href: '/theme/ecology' },
  { id: 'finale', still: '/images/world/finale.webp', clip: blob('finale', '2ce25d8048790fef57946a5731d685b8bb1efbf2ec4e14b1378261d1415f46ad', 'mp4'), clipWebm: blob('finale', '626f0b697c0ecb1bafdc2f1c91c68521b414436ae3dba12b11a63d2eb1d73e82', 'webm'), accent: '#B08D3E', href: '/home' },
];
