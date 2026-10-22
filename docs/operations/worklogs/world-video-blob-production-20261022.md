# 首頁世界影片改由 Vercel Blob 提供（Production）
更新：2026-10-23 00:30 Asia/Taipei。狀態：AUDIT_READY（Draft PR，未合併、未上線）。

## 背景
- Vercel 團隊 Deployment Storage 於 2026-10-22 18:45 Asia/Taipei 達免費額度 100%（10 GB）。
- 首頁 3D 滾動世界 14 支影片（7 景 × mp4／webm，30,679,590 bytes）原本放在 `apps/web/public/videos/world/`，每個部署都打包一份。
- #1895 的 Blob 試驗只對 `trial/blob-reversible-local` Preview 生效，Production 沒有受益。
- 查證：影片未被 trace 進任何 Function（368 個 `.nft.json` 中 0 個含 `videos/world`），只以靜態檔存在。Preview 已關閉、Production 保留 3 個後，本變更上限約省 92 MB（3 × 30.7 MB）。Owner 2026-10-22 選擇照做並同時查主因。

## 變更
- `scenes.mjs`：新增 `WORLD_MEDIA_ORIGIN`；`clip`＝mp4 Blob URL、新增 `clipWebm`＝webm Blob URL，路徑 `/world-media/v1/<scene>/<sha256>.<ext>`。
- `ScrollWorldClient.tsx`：webm 改取 `clipWebm`（hash URL 不能由 mp4 推導），其餘行為不變。
- `next.config.mjs`：CSP 新增精確 `media-src 'self' https://pekgelfm9z6nkvfj.public.blob.vercel-storage.com`。
- 14 支影片 `git mv` 到 repo 根目錄 `media/world-videos/`（Git 保留原檔與回滾來源，不再部署）。
- 測試：URL 格式、原檔 SHA-256＝URL hash（離線）、`public/videos` 不存在、CSP 精確 origin。
- Blob 物件為 #1895 已上傳的 14 個 hash 檔；本變更沒有新增 Blob 上傳。

## 驗證證據（2026-10-22 UTC）
- Blob 端 14/14：HEAD 200、MIME、Content-Length＝Git bytes、檔名 hash＝Git SHA-256；7/7 mp4 Range 206。
- `run-checks.sh --typecheck`（官方 Node 22.23.1，移除正式金鑰）：exit 0；scroll-world 兩檔 12/12。
- lint exit 0（僅既有 1 warning）。
- 本機完整 production build：exit 0，234/234 頁，`.next` 內 0 支影片。
- `next start`：首頁 200、CSP `media-src` 精確、`/videos/world/*` 404、poster 200。
- Chromium（Playwright 1.58.2＋`PW_EXECUTABLE_PATH`）對本機 build：#1895 三案（blob 模式斷言 hash URL）3/3；強制 MP4 1/1（只請求 mp4、0 webm）。
- 已知限制：此 Chromium 不含 H.264 解碼，強制 MP4 的實際播放未驗證；7 個 mp4 以 ffmpeg 完整解碼 exit 0。
- 整套 ordinary：6,011 中 2 個 email 失敗，原因是環境帶真 `RESEND_API_KEY`（#1911 已知行為）；移除金鑰重跑 12/12。

## 事件紀錄
- 首次整套測試未先移除正式金鑰。逐筆查核：Supabase「Vibe Ai backend」15:51–15:56 UTC 本 session 只有 `admin_security`／`soft_launch_controls` GET 404，無寫入；Resend 2 次呼叫皆空收件人被拒，無信寄出。之後一律 `env -u` 移除。
- 另觀察到 15:40–15:49 UTC 有非本 session 的 node 寫入打到「Vibe Ai backend」（`create_tour_order`／`cancel_tour_order`／`trip_departures` 等），已回報 Owner，未處理。

## 審查與 CI（2026-10-22 UTC）
- head `de85c799` CI：test https://github.com/smallwei0301/tour-platform/actions/runs/39813077187 success；secret scan https://github.com/smallwei0301/tour-platform/actions/runs/39813077188 success。
- Codex code review 與 security review：皆 completed、no findings（23:16–23:17 UTC，head de85c79）。
- 獨立審查（audit 層、fresh context、唯讀，actual model 依平台回報）：VERDICT PASS，0 blocking。3 項 non-blocking：
  - F1／F2：CSP 測試未與 `WORLD_MEDIA_ORIGIN` 交叉驗證、註解掉 media-src 仍通過 → 已修：測試改為只認未註解的陣列元素，並等於 `'self' ${WORLD_MEDIA_ORIGIN}`；origin 釘死已驗證 store。兩個 mutation 皆已被抓到。
  - F3：`3d-scroll-homepage.md` 舊路徑 → 已加註記。
- 後續 head 的 CI 連結記於 PR 留言。

## 回滾
revert 本 PR 的 commit：影片回到 `apps/web/public/videos/world/`，`scenes.mjs` 與 CSP 一併還原。

## 未完成／Gate
- [ ] CI exact head 綠燈
- [ ] Owner 決定是否合併（Preview 已關閉，合併即上線 Production）
- [ ] 上線後：midao.com.tw 首頁影片實測、Production 部署 Resources 確認無影片
- [ ] Blob store `pekgelfm9z6nkvfj` 為 #1895 試驗建立；不得清理 `world-media/v1/**`，否則首頁只剩 poster
