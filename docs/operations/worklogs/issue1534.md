# Issue #1534：導遊頭像裁切復原與雲端驗證

## 目標
沿用原頭像裁切候選，適配現行非語系 profile 頁，修正取消、卸載、換檔後的過期編碼回呼與重複確認。僅使用合成圖片、假 session 與 mocked API。狀態：HOLD，完整 production build 尚未通過；未 commit／push／PR。

## AC 清單
- [x] 修改前八檔 size／SHA256 全部匹配父端 v2 manifest；完整 diff 40871 bytes、SHA256 `4aab54e45d8b1e4db58389a53142ea9a90cdf6e2e7529d5ebe4f653bb17a0cb5`
- [x] 原 geometry 內容、原 mocked E2E 與 lifecycle E2E bytes 保留；原 geometry 單測僅改必要 import
- [x] 現行 profile 的 AvatarField 抽成領域元件，舊路由不恢復；hero／gallery 行為未擴修
- [x] canonical targeted 35/35、完整 lint、完整 typecheck 通過
- [x] canonical D3 --all：5911 tests／5908 PASS／0 FAIL／3 既有 SKIP，exit 0
- [x] 真實 Chromium mocked E2E 7/7；額外真 React StrictMode、輸出與卸載驗證 2/2，均 exit 0
- [ ] 完整 production build：BLOCKED，Google Fonts fetch 失敗，exit 1
- [ ] 完整發布 gates：本輪不 commit／push／PR／Ready／merge／部署

## 精確來源與保全
- 原 main：b83b8c51dbcb4a806cf9cc6d2f7bd6713a60ea3e；原 PR head：132f9d074ca47b4909384ffd0ec40d16ea7f48ee
- 驗證 base：5d68a11a7e93021e7f7cca8e0f02368f9b9ec764；相較原 main 僅 readiness 快照變動，八路徑 baseline 未變
- 隔離分支：verify/issue1534-cloud-20261019；原 work 分支與未提交成果保留
- Library 原 archive 未成功下載；採父端精確文字輸入，補齊截斷原檔後才驗完整 hash；不宣稱 Library materialization 成功
- 原 v2 八檔與原 patch、初次失敗、修復 diff／命令收據均另存 evidence；此文件是最終送審快照，終局獨審與 manifest 以附檔保存，避免為寫回同一候選結果而改變已審 bytes

## 已證實失敗與限定修復
1. 巨型檔案 ratchet：profile 1009 行超過天花板 992；抽出 ProfileAvatarField，修復後 wc 906 行（guard 計 907）。
2. src/lib 頂層檔案數：180 超過 179；geometry 原 bytes 移到 src/lib/avatar/crop-geometry.ts，必要 caller／單測 import 同步。未改 guard／ceiling／豁免。
3. 抽離後既有 profile endpoint 接線契約失敗；profile 明確傳入固定 uploadUrl，元件以必要 literal prop 實際 fetch。未改原測試或加無效註解應付 gate。
4. 初次 D3 的 OG URL 失敗來自驗證 harness 誤帶 localhost base URL；分離 test／browser 環境後原 OG 8/8、pristine main 對照 12/12。
5. typecheck 與 dev 同時啟動曾造成 .next/types 刪建競態；停止 dev 後原完整 typecheck exit 0。原失敗保留。
6. 標準 npm ci --ignore-scripts --offline 安裝 661 packages，exit 0；npm ls --all exit 0。安裝產生的 yarn.lock 副作用已保存差異並還原，package-lock.json 未改。

## 真實執行證據（2026-10-19 Asia/Taipei）
- canonical Node v22.23.1 workspace provision：官方 archive SHA256 與完整檔案／symlink 驗證通過；process.execPath 指向實體工具鏈，未改 /root 權限或使用 Node24 代替
- 原 run-checks.sh／tp-node22.sh 執行 focused 與 D3；未修改 runner 或測試成員／skip
- E2E 使用既有 /usr/bin/chromium，React dev 的 reactStrictMode=true；兩份 repo specs 共七案驗正常確認、取消按鈕／Escape／backdrop、重複確認、換檔及延遲 native 編碼
- 額外 browser oracle 實見 createObjectURL 兩次／revoke 一次的 StrictMode effect replay、拖曳／縮放 transform 改變；實際輸出 File 解碼為 400×400 WebP，toBlob type／quality 為 image/webp／0.85
- 真卸載：同文件 Next Link 導航卸載元件，保留並完成先前 queued native encoder callback，fetch invocation 仍為零。初次 accessibility selector 未觸發導航的失敗與修正版 oracle 均保留，不以 callback VM 代替 browser
- 完整 build 在未改動的 RootDocument next/font 路徑無法取得 Inter、Noto Sans TC、Noto Serif TC；未換字型來源、修改安全設定或把 mocked build 當完整通過
- requested models 依 repo 路由；actual model unknown 保留。派工 before → tool → receipt 證據另存；工具順序紀錄不是平台身分驗證

## 下一步
以最終 manifest／full diff 綁定 fresh-context Standards 與 Spec 獨審；附真實重跑結果與所有歷史失敗。由父端處理合法字型取得條件及完整 build／發布 gates；本輪不擴大網路或憑證權限，不把通過的本地 tests 當可發布。

## 絕不重做
不重寫原裁切功能、不恢復舊路由、不改受保護 E2E／harness／architecture gate，不使用真帳號／私照／真上傳／共用 TEST／Production DB／寄信／付款，不新增憑證或網路權限，不 merge／部署／升級額度。
