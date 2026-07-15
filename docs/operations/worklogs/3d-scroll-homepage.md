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

## 下一步
- 開 PR → 盯 CI 綠燈 → merge（依 harness/07 QA 流程補正式驗收報告）。
- 待 owner 決定：是否在經典首頁放 `/world` 入口、或做 A/B 導流；若要把正式路徑搬回裸 `/world`，需 P0-OVERRIDE 修改 middleware matcher＋localized 清單。

## 絕不重做（Do-NOT-redo）
- 不動凍結區；不動既有 `/` 首頁 LpSections 結構；migrations／API 無涉。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
