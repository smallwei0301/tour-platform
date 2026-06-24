# Hyperframes Composition Brief: Midao 祕島

## Objective
Create a short, polished launch-style brag video for Midao 祕島（台灣在地導遊預約平台）.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20s

## Source Material
- Project root: `/home/user/tour-platform`
- Primary files read: `BRAND_BOOK.md`, `README.md`, `app/page.tsx`, `src/components/landing/LpSections.tsx`
- Product name: Midao 祕島
- Tagline / strongest claim: 島嶼裡，還有一座島。/ An island, untold.
- Key UI to recreate: 首頁「編輯精選」行程卡（柴山探洞・城市祕境）、引路人 Andy Lee 卡、預約成功微文案
- Copy that must appear verbatim:
  - 島嶼裡，還有一座島。 / An island, untold.
  - 島嶼深處，有故事的人帶路。
  - 在地嚮導 × 深度路線 × 真實相遇
  - 柴山探洞・城市祕境 ／ 走進城市邊緣的地形祕境 ／ ★ 4.9 共 128 則評論 ／ NT$ 1,680 起
  - 不是觀光打卡，是懂路的人帶你走進柴山。— 高雄柴山・Andy Lee
  - 好了，引路人會在山上等你。
  - 尋找一條你的徑 →

## Creative Direction
- Tone preset: polished（+cinematic 緩起）
- Creative direction: 破曉時翻開的祕島田野誌——古地圖在呼吸
- Interpretation: 少場次、長停留、慢溶；宋體＋留白＋一道朝霞光。遵 BRAND_BOOK Voice & Tone（禁形容詞／網紅口吻／驚嘆號濫用）。
- Angle: 不是 OTA 促銷，是品牌田野誌；賣「信任——有故事的人帶路」，全程用真實文案與真實 UI。
- Hook: 「祕」印章落下 + 主標語「島嶼裡，還有一座島。」
- Outro / punchline: 「好了，引路人會在山上等你。」→ logo + CTA「尋找一條你的徑 →」
- Avoid: 通用 SaaS 大話、抽象 filler 視覺、無關的視覺重設計、whoosh 連發、對拍閃字

## Visual Identity
- Background: 古紙 #F4ECD8 / 山墨 #1A2E1F
- Text: #1A2E1F on paper / #F4ECD8 on ink
- Accent: 朝霞 #C2542E（次：苔綠 #5E7A4F、黃銅 #B08D3E、礦石 #2A2422）
- Display font: Noto Serif TC（本地 assets/fonts）
- Body font: Fraunces（本地 assets/fonts，斜體）
- Visual references: 編輯精選書籤卡、難度圓點、★評分、信任徽章 2×2、羅盤浮水印、印章

## Storyboard
見 `brag-output/brag-plan.md`（創作合約）。
1. 印章開場 / Tagline — 3.6s
2. 承諾 / Hero line — 3.8s
3. 編輯精選行程卡（真實 UI）— 4.4s
4. 引路人 Andy Lee / 信任 — 4.2s
5. 預約成功 + Outro — 4.0s

## Audio
- Audio role: cinematic 低限氛圍 bed（破曉山風 + 低頻 drone）
- Audio arc: 0–2.5s 淡入 → 全程低鋪 → 17.5s 起 3s 淡出
- Music: `assets/audio/bed.mp3`（自製，bundled business-moves 與品牌衝突故不用）
- Music treatment: 低音量，最後淡出收 logo；無節拍 grid
- Audio-reactive treatment: none
- Audio-coupled moments:
  - Scene 1 印章落下 — `assets/audio/sfx-seal.mp3`（柔和印壓）
  - Scene 3 行程卡滑入 — `assets/audio/sfx-slide.mp3`（紙張聲）
- SFX selection guidance: 僅兩處，克制；其餘交給留白
- Audio files: 已置於 `assets/audio/`

## Hyperframes Instructions
- 真實 UI：必含編輯精選行程卡（真實標題／評分／價格）與引路人原話。
- 文字全程可讀：polished 長停留，每行 ≥0.8s（句子 ≥1.2s）。
- 15–25s 內（目標 20s）。
- GSAP、字體、音訊一律本地化（render 無外連）。
- 每個 timed 元素 data-start/data-duration/data-track-index + class="clip"；timeline paused 註冊到 window.__timelines。
