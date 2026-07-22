# issue1751 worklog — [QA] Daily test checklist for recent merged PRs 2026-07-22

- Issue: https://github.com/smallwei0301/tour-platform/issues/1751
- Branch: `claude/resolve-open-issues-uiv0ql`
- 目標：驗證 PR #1750（booking UUID 入口先解 canonical slug 再讀 detail）合併後的生產行為。

## 狀態

- [x] Focused regression：`node --test apps/web/tests/unit/issue1745-booking-activity-resolution.test.mjs` → **6/6 pass**
- [x] 生產唯讀 API 驗證（curl，Asia/Taipei 2026-07-22 08:48）
  - `/api/health` → 200，version `e6aecf70a9f9c8dec3137515aa6a8e68a8dc21aa`（與 issue 指定 SHA 一致）
  - `/api/activities?activityId=<uuid>` × 2 → 200，回傳完整活動清單（7 筆），兩個目標 UUID 都在清單內（前端據此解析 canonical slug）
  - `/api/activities/<uuid>`（直接以 UUID 打 detail）× 2 → **404 `NOT_FOUND: activity not found`**，fail-closed 契約維持
- [x] 真實瀏覽器（Playwright + Chromium 141，走 agent proxy）smoke
  - `/booking/c0000003-…0001`、`/booking/6f8049be-…f2d0` 桌機 1280px＋手機 390px 各一輪 → HTTP 200、**0 console error、0 failed request**
  - Network 證據：前端先打 `/api/activities`（lookup），解析出 canonical slug（`kaohsiung-chaishan-cave-experience`／`activity-1780446372245`）後打 `/api/activities/<slug>` → 200；**未再出現先打 `/api/activities/<uuid>` 的 404 噪音**
  - 無 `?plan=` 時顯示明確中文引導文案（缺少方案參數，請返回行程頁重新選擇），非白屏/404
  - 帶 `?plan=half-day` 時桌機＋手機完整 booking 畫面（標題、步驟指示、方案、日期、人數、CTA）皆正常，0 console error
  - `/activities` 列表頁 → 200，h1「全台灣 7 個私人導遊行程」，無錯誤
- [x] 完整回歸（本機 main-based branch，Node v22.22.2）：`npm test` → 4698 tests / 4695 pass / **0 fail** / 3 skipped；`npm run typecheck` → exit 0；`npm run lint` → exit 0
- [x] QA 報告：`docs/operations/qa-reports/issue1751-daily-qa-2026-07-22.md`
- [x] Issue 留言＋關閉

## 踩坑（已寫入 lessons.md 候選）

- 遠端環境 Chromium 走 agent proxy 打外部 HTTPS 會 `ERR_CONNECTION_RESET`：上游 MITM 無法處理 Chromium TLS 1.3 大型 ClientHello（含 post-quantum key share）。解法＝(1) `certutil` 把 `/root/.ccr/ca-bundle.crt` 內 Anthropic egress CA 匯入 `~/.pki/nssdb`；(2) 啟動參數 `--proxy-server=http://127.0.0.1:33487 --disable-quic --ssl-version-max=tls1.2`（憑證驗證仍開啟）。

## 結論

GO — PR #1750 修補在生產環境行為正確，未發現回歸。
