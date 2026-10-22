# 首頁 3D 滾動世界影片（原檔）

## 用途
這 14 支影片（7 景 × mp4／webm）是首頁 `/` 3D 滾動世界的「飛入」素材。Production 從 Vercel Blob 讀取，**不再放在 `apps/web/public/`**（避免每次部署都打包 ~30 MB 進 Deployment Storage）。本目錄只是 Git 內的原檔與回滾來源，不會被部署。

## Blob URL 規則
- origin：`https://pekgelfm9z6nkvfj.public.blob.vercel-storage.com`
- 路徑：`/world-media/v1/<scene>/<sha256>.<ext>`，檔名 hash ＝ 該檔 SHA-256（內容定址，換內容必換 URL，可長期快取）。
- URL 定義在 `apps/web/src/lib/scroll-world/scenes.mjs`（`WORLD_MEDIA_ORIGIN`、`clip`＝mp4、`clipWebm`＝webm）。
- CSP 於 `apps/web/next.config.mjs` 以 `media-src` 精確放行該 origin。
- 單元測試 `scroll-world-scenes.test.mjs` 會比對本目錄檔案的 SHA-256 與 URL 內 hash 是否一致。

## 要換影片時
1. 更新本目錄的原檔（檔名維持 `<scene>.<ext>`）。
2. 計算新檔 SHA-256，上傳到 Blob 的 `world-media/v1/<scene>/<新 sha256>.<ext>`。
3. 修改 `scenes.mjs` 中對應場景的 hash，跑 `scroll-world-scenes` 單元測試確認一致。

## 回滾
revert 此次搬遷的 commit：影片會回到 `apps/web/public/videos/world/`，`scenes.mjs` 恢復本站路徑（CSP 的 `media-src` 也一併還原）。
