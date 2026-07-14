# 3d-scroll-homepage — 第二個 3D 滾動首頁（/world）
> 最後更新：2026-07-14｜負責 session：Claude（branch `claude/3d-scroll-homepage-58zygx`）

## 目標
參考 [oso95/scroll-world](https://github.com/oso95/scroll-world) 的「滾動＝攝影機自場景外飛入內部、再無縫飛向下一景」概念，為 Midao 製作第二個 3D 滾動首頁。原 repo 依賴 Higgsfield AI 預渲染影片＋scrub 引擎；本環境無法生成影片素材，故改以 **CSS 3D 透視（perspective + translateZ 縱深飛行）＋分層 SVG 微景觀** 實作同等體驗，零新依賴、零外部資產。

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

## 下一步
- 開 PR → 盯 CI 綠燈 → merge（依 harness/07 QA 流程補正式驗收報告）。
- 待 owner 決定：是否在經典首頁放 `/world` 入口、或做 A/B 導流；若要把正式路徑搬回裸 `/world`，需 P0-OVERRIDE 修改 middleware matcher＋localized 清單。

## 絕不重做（Do-NOT-redo）
- 不動凍結區；不動既有 `/` 首頁 LpSections 結構；migrations／API 無涉。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
