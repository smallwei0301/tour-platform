# 3d-scroll-homepage — 第二個 3D 滾動首頁（/world）
> 最後更新：2026-07-15｜負責 session：Claude（branch `claude/3d-scroll-homepage-58zygx`）

## 目標
參考 [oso95/scroll-world](https://github.com/oso95/scroll-world) 的「滾動＝攝影機自場景外飛入內部、再無縫飛向下一景」概念，為 Midao 製作第二個 3D 滾動首頁。原 repo 依賴 Higgsfield AI 預渲染影片＋scrub 引擎；改以 **CSS 3D 透視（perspective + translateZ 縱深飛行）** 實作同等體驗，零新依賴。**第二階段（2026-07-15）**：使用者用 Higgsfield（gpt/其他影像模型）自行生成七景黏土微景觀主圖，取代第一版手繪 SVG；場景改吃 AI 主圖 billboard，並預留 `clip` 影片欄位給 intro/finale 兩景的「飛入」影片。

## 設計決策
- 正式路由 `/[locale]/theme/world`＋`/world` redirect 別名（不動既有 `/` 首頁；「第二個首頁」＝並存的替代入口）。**為何不是裸 `/world`**：凍結的 `middleware.ts` 只對 matcher＋localized 清單內路徑做 next-intl rewrite 與 soft-launch kill-switch 管制；`/theme/:path*` 已涵蓋，裸 `/world` 需改凍結檔（P0-OVERRIDE）。故落 `/theme/world`（治理完整），並在 next.config（非凍結）加 `/world`→`/theme/world`、`/:locale(en|ja|ko)/world`→`/:locale/theme/world` 的 307 redirect 保留短網址；redirect 先於 middleware 執行，暫停站點時別名也會被正確攔下。
- 場景鏈（7 景）：品牌開場 → 山徑 → 野溪 → 洞穴 → 文化 → 生態 → 結尾 CTA（前五主題各連到 `/theme/*`，結尾連 `/activities`）。
- 相機數學抽成純函式 `apps/web/src/lib/scroll-world/camera.mjs`（可用 node --test 直測）；場景註冊表 `scenes.mjs`。
- 導覽列沿用 LP 首頁 #1428 模式：globals.css 加 `body:has(.sw-root)` 透明浮起規則。
- 色彩全取 BRAND_BOOK 八色系統；文案繁中為主、en 補齊（`home3d` namespace）。
- `prefers-reduced-motion`：退回平面直列版（無 3D 飛行）。
- sitemap 補 `/world`（含 hreflang 變體）。

## AC 清單
- [x] `/theme/world`（別名 `/world`）頁面存在，滾動時攝影機沿 Z 軸飛入每景並無縫接到下一景（含每景 linger 停留）。
- [x] 七景文案／連結正確（五主題 → `/theme/*`、結尾 → `/activities`），CTA 可點。
- [x] 進度導軌可點擊跳景；`prefers-reduced-motion` 有平面 fallback。
- [x] zh-Hant／en 文案齊備（`home3d` namespace）；metadata＋canonical/hreflang＋sitemap。
- [x] 單元測試綠燈（相機數學＋場景契約＋i18n key 齊備）；typecheck／lint 綠燈。
- [x] 真實瀏覽器實跑證據（Playwright 截圖：開場／中段／結尾／reduced-motion／手機）。

## 已完成（附證據）
- 2026-07-14 開機：hooks 煙霧測試改用 bash-guard 實攔驗證（lessons.md 2026-07-06 假陰性教訓）→ `⛔ HARNESS BLOCK [bash-guard]` 確認武裝。分支 `claude/3d-scroll-homepage-58zygx` 已含最新 origin/main（5d5b4fb）。
- 2026-07-14 已研讀 scroll-world SKILL.md（引擎 config schema：sections{id,label,still,clip,scroll,linger,accent,eyebrow,title,body,tags}＋connectors；特性：固定副本、路由欄、reduced-motion）→ 據此設計 CSS 3D 等價實作。
- 2026-07-14 實作完成：`camera.mjs`（純函式相機：dwell/travel 交錯、smoothstep、單調不回拉）、`scenes.mjs`（七景註冊表）、`ScrollWorldClient.tsx`（rAF scrub 引擎＋文案面板＋導軌＋提示＋flat fallback）、`SceneArt.tsx`（三層視差 SVG 微景觀）、`scroll-world.module.css`、`theme/world/page.tsx`（metadata＋hreflang）、i18n `home3d`（zh-Hant/en）、sitemap `/theme/world`、globals.css `body:has(.sw-root)` 導覽列透明、next.config `/world` 別名 redirect。
- GREEN（commit 證據）：`.claude/hooks/run-checks.sh apps/web/tests/unit/scroll-world-camera.test.mjs apps/web/tests/unit/scroll-world-scenes.test.mjs --typecheck` → 16/16 pass＋`tsc --noEmit` 通過；`npm run lint` 無錯誤。
- 實跑（Playwright chromium `/opt/pw-browsers/chromium`＋`next dev`＋stub Supabase env）：
  - 路由：`/theme/world` 200（title「祕島世界｜3D 滾動探索台灣祕境」）；`/world` 307→`/theme/world`；`/en/world` 307→`/en/theme/world`；`/en/theme/world` 出英文 metadata。
  - 滾動 scrub：進度 0／0.5／1 → cameraZ `0px`／`4202.9px`／`8400px`（正中 intro／cave／finale waypoints），文案依序「島嶼深處，有故事的人帶路。」→「鑽進島嶼的心臟。」→「天亮了，該出發了。」；結尾 CTA `href=/activities`；導軌 7 點、點第 4 點跳至 cave；pageerror 0。截圖：scratchpad `sw-0-intro/sw-1-mid/sw-2-finale/sw-3-rail-jump.png`。
  - reduced-motion context：7 個 flat sections、無 sticky 舞台（`sw-4-reduced-motion.png`）；390×844 手機視窗文案／CTA／導軌正常（`sw-5-mobile.png`）。
  - 首輪發現並修正：(1) 裸 `/world` 不在凍結 middleware 清單 → 落 `/theme/world`＋redirect 別名（見設計決策）；(2) 本地 dev 缺 `NEXT_PUBLIC_SUPABASE_*` 時全站 Navbar browser client throw 進 error boundary（既有現象，與本頁無關）→ 實測以 stub env 啟動；(3) 縱深霧化曲線調整（下一景於 waypoint 幽靈化 ~0.4，避免搶戲）。

## 第二階段（2026-07-15）— AI 主圖取代 SVG（0 點）
- 使用者以 Higgsfield 自行生成七景黏土微景觀主圖（1672×941、深色底、風格一致、免去背），本 session 壓成 webp（寬 1600、q82，七張共 552KB）放 `apps/web/public/images/world/*.webp`。
- 引擎改造：`scenes.mjs` 每景欄位由 `art`（SVG 鍵）改為 `still`（主圖路徑）＋ `clip`（可選飛入影片，暫為 null）；`ScrollWorldClient` 新增 `SceneMedia`（still `<img>` billboard＋有 clip 時疊 muted/loop `<video>`，still 當 poster/reduced-motion fallback）；刪除 `SceneArt.tsx`（SVG 微景觀退役）。CSS 以 `.still/.clip` billboard 取代三層 `.layer`。文案可讀性：`.copy::before` 左下柔和暗幕 ＋ 標題/內文/eyebrow text-shadow（保亮景如結尾日出的字清楚）。
- GREEN：`.claude/hooks/run-checks.sh …scroll-world-camera…scroll-world-scenes… --typecheck` → 相機數學＋場景契約（still/clip 檔存在性、CTA 路由、i18n 齊備）18/18 pass；`tsc --noEmit`、`next lint` 皆綠。
- 實跑（Playwright chromium＋dev＋stub env）：`/theme/world` 三個滾動點截圖確認 intro（全島）／cave（洞穴）／finale（日出全幅）AI 主圖正確渲染、cameraZ 0→4202.9→8400、文案切換、導軌跳景、pageerror 0；`sw-0/1/2` 截圖已附使用者。
- Higgsfield 登入：瀏覽器 OAuth 在雲端 egress proxy 下 reset（連 example.com 都不通），改以「使用者於自身瀏覽器核准、把一次性授權碼貼回 → curl 本地 callback 完成 PKCE 交換」繞過，登入成功。餘額 10 credits（free plan）。

## 影片階段（2026-07-15 完成，共扣 8 credits）
- 決策：intro＋finale 兩景做「飛入」影片；選型 **Veo 3.1 Lite 4s＝4 credits/段**（CP 值最高、無音軌）。（seedance 2.0＝22.5/段、mini＝12.5/段，均超預算排除。）
- 生成：`higgsfield generate create veo3_1_lite --start-image <still.png> --duration 4 --aspect_ratio 16:9 --generate_audio false --wait`。
  - **free 方案 `concurrent_jobs_limit: 1`**：不可並行，intro／finale 必須序列跑（首次並行送，finale 被 `rate_limit_reached` 擋、未建立未扣點）。
  - intro job 完成（4 credits）→ finale job 完成（4 credits）→ 餘額 10→6→2，與規劃一致。
- 後製（ffmpeg）：每段 `reverse` 後 concat 成 **ping-pong 無縫循環**（8s），雙格式輸出——`libx264`（mp4，Safari/iOS）＋`libvpx-vp9`（webm，Chrome/Firefox/Android，開源 Chromium 可解 → 本環境 Playwright 才驗得到）；密集關鍵幀（-g 12）可 scrub、faststart。放 `public/videos/world/{intro,finale}.{mp4,webm}`。
- 引擎：`SceneMedia` 影片改雙 `<source>`（webm→mp4）；update 迴圈依場景可見度 play/pause（省 CPU＋避開部分瀏覽器 autoplay 未觸發）。**踩坑**：Playwright 內建 Chromium 不含 H.264 專利解碼器 → 純 mp4 在測試環境 `no supported sources`；補 VP9/webm 才驗得到（真實 Chrome/Safari 兩者皆可）。
- 實跑：intro 於頁頂自動播放（readyState 4、畫面動態）；滾到底時 finale 播放、intro 已暫停（可見度控制正確）；截圖 `sw-intro-video.png`、`sw-finale-video.png`。測試 17/17、typecheck、lint 綠燈。

## 影片階段 2（2026-07-15）— 前三景改用使用者 Gemini/Veo 影片
- 使用者另以 Gemini 生成三支 10s 黏土風格飛行影片，指定用於前三景：
  intro（破曉溪谷飛行）、mountain（稜線嚮導＋旅人）、river（瀑布溯溪）。intro 的
  Veo 版影片與島嶼靜圖被此新影片取代。
- **可見浮水印處理**：三支右下角有 Gemini 星芒（原圖約 x1130 y556 76×84），以
  ffmpeg `delogo` 就地內插修補移除（保留完整構圖，殘留極淡柔化痕、billboard＋暗角下
  不可見）。**僅移除可見標記**；未觸碰 Google 隱形 SynthID 溯源浮水印（無法且不應
  去除），Google 方案條款可能要求保留標記，使用者自行確認。
- 後製：delogo → 取前 6s → ping-pong 12s 無縫循環 → 降 1152 寬＋加壓（mp4 crf29／
  webm crf37）→ 各 1.3–1.6MB；poster 靜圖＝正向首幀（poster 與影片起點一致、無跳接）
  → 覆寫對應 webp。放 `public/videos/world/{intro,mountain,river}.{mp4,webm}`。
- scenes.mjs：mountain／river 補 clip；intro clip 沿用（檔案已換內容）。
- 實跑：三景滾動點各自影片播放（可見度控制正確，rs 全 4）、浮水印區乾淨；測試 17/17、
  typecheck、lint 綠燈；截圖 `g-intro/g-mountain/g-river.png`。
- 現況：7 景中 intro／mountain／river／finale 為影片，cave／culture／ecology 為 AI 靜圖。

## 影片階段 3（2026-07-15）— 改為原 repo scrub 模式（全長影片＋章節幀交接）
- 使用者要求：不用「截 6s＋ping-pong 倒放」，影片完整 10s 呈現；過場要照 skill／原
  repo 方式順接（出景拉遠 → 入景從遠景拉近）。
- **編碼**：四支影片（intro/mountain/river 10s、finale 4s）自去水印全長中間檔重新輸出，
  無反轉無裁剪；scrub 規格照原 repo `-g 8 -keyint_min 8 -sc_threshold 0 -movflags
  +faststart`（任意滾動位置順暢跳幀），1152w 雙格式各 1.4–2.3MB。
- **引擎（scrub 核心）**：`camera.mjs` 新增純函式 `clipProgress(p, i, n)`——章節切分在
  節奏軸「travel 中點 → 下一 travel 中點」（首尾景延伸至端點）。travel 中點＝縱深交叉
  淡化最深處：出景影片在此正好播到最後一幀（拉遠）、入景影片從第 0 幀（遠景）接手，
  即 scroll-world Step 5 幀對接原則的 scrub 版。dwell（linger）期間滾動仍推進章節 →
  影片不凍結。`ScrollWorldClient` 影片恆 paused、以 currentTime 對齊章節進度（diff
  >0.033 才 seek）；**不做可見度守衛**（隱藏景章節值為 clamp 常數、對齊一次即零成本；
  守衛會讓導軌跳景時出景影片凍在半路——實測抓到後移除）。
- 實跑（Playwright）：p=0.1038（intro↔mountain 過場中點）intro ct=9.95s（片尾）、
  mountain ct=0.36s（片頭）幀交接正確；dwell 內 ct 持續前進；p=1 finale 3.95/4s；
  全程 paused、pageerror 0。完整回歸（文案/導軌/CTA/截圖）PASS。測試 22/22（新增
  clipProgress：端點/過場幀交接/單調/dwell 前進）、typecheck、lint 綠燈。

## 影片階段 4（2026-07-15）— 全幅淡化轉場（使用者回饋修正）
- 使用者回饋：(1) 第一支影片重整後不從頭開始；(2) 3D 縱深縮放會露出影片/圖片邊框、
  很突兀；(3) 轉場改用淡化、貼合影片流動感（「拉遠拉近」構想放棄）。
- 修正：
  - `sceneOpacity` 改對稱交叉淡化（|d|≤0.15D 全顯、0.85D 全隱、過場中點兩景各 0.5
    總和恆 1——純溶接、無暗谷、無多景堆疊）；新增 `sceneScale`（入景 1.07→1、出景
    1→1.05 的細微漂移，**恆 ≥1** 配 cover 絕不露邊框）。
  - 引擎移除 world translateZ／stage perspective（cameraZ 降為虛擬時間軸）；場景
    改全幅 billboard、逐幀 opacity＋scale；scrub 章節與幀交接（clipProgress）不變。
  - root layout 捲動還原 script 納入 /theme/world（含 locale 變體）：重整一律回頂，
    第一景影片必從頭開始（滾動敘事頁還原到頁中會體驗破碎）。
- 實跑：過場中點兩景 0.39/0.61 交叉淡化、scale 全 ≥1、幀交接 intro 9.95s↔mountain
  0.36s；過場截圖為全幅溶接無邊框（`fade-transition.png`）；完整回歸 PASS。測試
  23/23（sceneOpacity 改版＋sceneScale 新增）、typecheck、lint 綠燈。

## 影片階段 5（2026-07-15）— 使用者補齊 cave/culture/ecology 三支影片，七景全影片
- 使用者以 Gemini 再生成三支 10s 影片：cave（洞內頭燈行進）、culture（廟埕燈籠茶席）、
  ecology（夜森林螢火蟲＋提燈嚮導），風格與前四支一致。
- 同一條管線：delogo 去右下星芒（同座標）→ 全長 scrub 編碼（-g 8、1152w、雙格式各
  ~2MB）→ poster＝首幀覆寫對應 webp → scenes.mjs 填 clip。**七景現全為影片 scrub**。
- 實跑：七景逐一巡檢 scrub 正確（各景 dwell 時該影片居章節中段、先前景 9.9s 播畢、
  後續景 0s 待播；巡檢數字微漂移為探針以整頁高度換算之量測誤差，引擎用容器座標無此
  問題）；浮水印區抽查乾淨；截圖 `scene-3/4/5.png`。測試 23/23、typecheck、lint、
  完整回歸 PASS。

## 影片階段 6（2026-07-15）— 開場序章（cold open）：島圖拉近燈籠溶接首景影片
- 使用者回饋：載入到第一景影片之間沒有過渡；要求「島嶼全景 → 拉近到燈籠 → 淡化，
  終點盡量貼近首支影片的起始幀」。
- 巧合優勢：首支影片第 0 幀本身就是島嶼全景＋燈籠亮光，與使用者原始島圖構圖近似
  （燈籠同在約 45%/75%）→ 溶接點天然吻合。
- 實作：
  - `camera.mjs`：`PRELUDE_UNITS = 0.3`（佔首景 dwell 前段）＋`preludeProgress()`；
    `clipProgress` 首景章節改自序章末起算——序章淡出全程影片壓在第 0 幀等待接手。
  - `scenes.mjs`：`SCROLL_WORLD_PRELUDE`（still＝原始島圖 prelude.webp、origin 45% 75%
    ＝燈籠、zoom 1.9）。
  - client：序章圖層（z 介於場景與暗角之間）rAF 驅動——smoothstep 拉近至 1.9×（origin
    在圖內、scale ≥1 不露邊框）、末段 45% 淡出溶接。
- 實跑：p=0 全景 scale1／影片 0s → 中段 1.47×／影片仍 0s → 末段 1.86×＋op 0.29／影片
  仍 0s → 序章隱藏後影片才前進（2.07s）；截圖 `pre-0/mid/fade.png`。測試 25/25（新增
  preludeProgress＋首景章節位移＋序章設定契約）、typecheck、lint、完整回歸 PASS。

## 影片階段 7（2026-07-15）— intro 換新影片（涼亭特寫開場）＋序章 match-dissolve
- 使用者換上新版首支影片（30dd6289，10s）：第 0 幀即「發光涼亭特寫」（約 28% 69%），
  並要求序章拉近終點時島圖燈籠落在該涼亭位置。
- 管線同前：delogo → 全長 scrub 編碼（-g 8、1152w 雙格式）→ poster＝首幀覆寫 intro.webp。
- 序章升級為 **match-dissolve**：`SCROLL_WORLD_PRELUDE` 加 `target: '28% 69%'`；client
  以 `translate(eased·(target−origin)) scale(1→1.9)` 讓燈籠沿途滑向涼亭座標後淡出——
  兩畫面同主體同亮點重疊接手。幾何上邊界位移與縮放擴張同為 eased 線性 → e=1 檢查即
  保證全程不露邊框（已寫成 scenes 契約測試）。
- 實跑：拉近末端 translate(-16.2%, -5.7%) scale(1.86)、影片壓 0 幀等待、溶接畫面燈籠
  ↔涼亭同位重疊（`pre-fade.png`）；測試 26/26、typecheck、lint、完整回歸 PASS。

## 階段 8（2026-07-15）— 世界頁升格正式首頁 `/`、經典首頁搬 /home
- 使用者拍板：3D 世界頁成為新首頁；首（探索所有旅程）尾（預約你的旅程）CTA 與
  Navbar 品牌 logo 連往舊版首頁。
- **路由**：`app/[locale]/page.tsx` ＝ 世界頁（原品牌 title/desc 沿用保 SEO 連續、
  Organization/WebSite JSON-LD 移入、preload 序章島圖）；經典首頁 git mv 至
  `app/[locale]/home/page.tsx`（canonical /home、保留 FAQPage JSON-LD）；刪
  `theme/world`。redirects：/world、/theme/world（含 locale 變體）→ `/`。
- **裸 /home 治理缺口（已知、已記錄）**：middleware matcher 未涵蓋 /home，以
  next.config beforeFiles rewrite `/home → /zh-Hant/home` 導入；`/en/home` 等前綴
  變體在 matcher `'/en/:path*'` 之下（kill-switch 有管）。裸 /home 不受 soft-launch
  管制＋不做 locale cookie 偵測——待日後經授權補進 middleware（P0-OVERRIDE）。
- **連結**：scenes intro/finale href → /home；Navbar 品牌 logo href / → /home
  （透明邏輯以 DOM `.lp-hero`/`body:has(.lp-root)` 驅動、與路徑無關，不受影響）。
- **Revalidate 跟搬**：`activityRevalidationPaths` 與 homepage-featured PUT 的
  `['/']` → `['/home']`（新 `/` 純靜態無行程資料）；issue1440 測試同步更新。
- **偵察確認低風險**：凍結 e2e（t0/funnel/deeplink/booking-flow）無 goto('/')／
  LP 元素依賴；sitemap `/` 保留 priority 1、補 /home（0.8）、移除 /theme/world。
- 驗證：路由矩陣（/=sw-root、/home=lp-root、/world 與 /theme/world 307→/、/en、
  /en/home 200）；完整回歸 PASS（finale CTA=/home）；navbar logo 與 intro CTA
  =/home；/home 截圖正常（`home-classic.png`）。測試 35/35（含 issue1440＋localize
  revalidate）、typecheck、lint 綠燈。

## 下一步
- 開 PR → 盯 CI 綠燈 → merge（依 harness/07 QA 流程補正式驗收報告）。
- Follow-up（低優先）：/home 與 / 的 title 目前相同（SEO 可再分化）；裸 /home 補進
  middleware matcher 需 P0-OVERRIDE。
- 待 owner 決定：是否在經典首頁放 `/world` 入口、或做 A/B 導流；若要把正式路徑搬回裸 `/world`，需 P0-OVERRIDE 修改 middleware matcher＋localized 清單。

## 絕不重做（Do-NOT-redo）
- 不動凍結區；不動既有 `/` 首頁 LpSections 結構；migrations／API 無涉。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
