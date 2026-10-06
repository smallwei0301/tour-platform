# PR #1889 — midao2 封面上傳 single-flight

> 最後更新：2026-10-06 18:44 Asia/Taipei｜狀態：source／隔離 mock runtime PASS；D7 comment／文件 head CI pending

## 目標

修正編輯服務時封面上傳與儲存競態：從 upload 開始到封面 PATCH 完成維持同一把鎖，期間阻擋第二次選圖與 full save，失敗後可重試。此為 [PR #1889](https://github.com/smallwei0301/tour-platform/pull/1889) 的 bounded 修正；不替代共享 [midao2 worklog](issue-midao2.md) 的整體部署驗收。

## AC 清單

- [x] A upload pending 與 cover PATCH pending 各自令 input／save disabled，B／full save 不新增寫入
- [x] 完成 A 後可選 B，preview 與 full save 的 cover URL 皆為 B
- [x] upload／PATCH failure 釋放鎖，後續 retry 成功

三案由新增 `apps/web/e2e/issue1889-service-cover-single-flight.spec.ts` 的真 Chromium 測試驗證；假 guide cookie、有效 PNG 走實際 image compressor，services／summary／plans／upload／PATCH／full save 皆攔截 mock。未知 API／auth／外部請求 fail closed；三個既有 telemetry exact GET/script 只 abort，不發外部請求。

## 已完成（附證據）

- Source head：`6fb1bbe2f16cdc05ef0228292aec1390882fd948`，base main：`8aac3ddb668b08d13f3039257ad254702f1fa517`。完整四檔候選 SHA256：`790a58c6d6714339f6f1353a9d93a1b02befcca723d39349479335b6de35c564`
- 原 fix 兩檔為 `ServiceForm.tsx` 與 `midao2-service-cover-upload.test.mjs`；新增 slice 只有上述 spec 與 `apps/web/package.json` 的既有 smoke append。保留原五項、順序、workers=1、workflow／env／permissions／locks／安全 guards
- D1/D2：remote commit／ref／blob read-back 與候選一致；Node22.23.1 正式 focused 17/17、exit0。獨立 reviewer 另自行重跑 17/17
- D3：2026-10-06 17:45:34 Asia/Taipei，正式 `run-checks.sh --all --typecheck` exit0；5843 total／5840 PASS／0 FAIL／3既有 SKIP，full tsc PASS
- D4：[mock Chromium smoke](https://github.com/smallwei0301/tour-platform/actions/runs/37447361082) attempt1、14/14 PASS、43.8s、retry=0／flaky=0；原11案加本次3案。實際 checkout `c37e266012d06bc5091963bbd7048c6d9e1f0063`，parents=main8aac＋head6fb，tree `0fc31105640769102b6acc7e21d1ea76e8605562` 與發布／review／D3一致
- D5：已 commit 並以正常 fast-forward 更新原工作分支；已建立獨立乾淨 exact-source snapshot。原 frozen dirty 工作樹及其 patch／bytes 保留，未 reset 或刪除；node_modules 不是產品 artifact
- D6：[CI](https://github.com/smallwei0301/tour-platform/actions/runs/37447361168) 與 [secret-scan](https://github.com/smallwei0301/tour-platform/actions/runs/37447361154) success。Source gate、lint、typecheck、ordinary tests、build234/234、ISR smoke、preflight 全綠；preflight 同套普通測試不重複加總
- 獨立完整四檔 R2 code review PASS、未解 finding=0。R1 的 telemetry F1 真反例已修並復驗：producer-derived 3正向／12負向皆 abort。R2 為同獨立 actor 的續驗；初始 fresh fork none、requested Sol、actual unknown，不把 requested 當 runtime identity proof
- 2026-10-06 18:27 Asia/Taipei fresh ownership：16 open PRs 全查，本四檔與其他15 PR零交集；submitted reviews／inline threads皆空。#1890 的隔離付款 CI不是此 cover 修正的共用 hot boundary，不導入為本 PR blocker
- D7 文件側：本次 worklog 已寫；GitHub Conversation／Issue comment 尚待發布，雙寫目前未完成，不稱 D7 PASS

## 下一步

- 文件發布後，在同 PR 的 Conversation／Issue comment 記錄文件 commit exact head、worklog 連結、read-back 與適用驗證結果，完成 D7 另一側錨點；以 comment 收據記錄此後里程碑，避免本檔自引用 commit SHA
- 文件收尾 commit 仍保持原 Draft；其新 head 的必要 CI需取得真終局，不能借 source head 的綠燈冒稱新 head PASS
- Owner 已於2026-10-06 18:43:32 Asia/Taipei明確允許「剩餘收尾檢查通過後merge #1889，並讓既有流程自動部署midao.com.tw正式網站」，不含DB變更、付款功能或新權限；不再等待此增量批准。Root 完成最新 exact head/main/gates後再決定 merge／Ready。現有 [main Production deployment](https://vercel.com/smallwei0301s-projects/tour-platform/5pG41dtciWbyAJSPfiBXuFvqjom2) source=git、target=production、main8aac、READY並綁 midao.com.tw；上述授權來自本次明確回覆，沒有把Preview成功外推為Production授權

## 絕不重做（Do-NOT-redo）

- 原 cloud browser 對127.0.0.1:3333拒絕保留；未重試、未換 port/address/tunnel。真mounted結果來自已授權既有GitHub-hosted純mock lane
- 不改 frozen T0、workflow、DB/schema、真帳戶、寄信、付款、憑證、網路、permissions或付費資源；本次沒有Production操作或live DB acceptance
- 舊spec-only PASS、R1 FIX_REQUIRED、registry deny及create_commit服務取消歷史原樣保存。同payload單次重試後發布6fb；原取消call是否建立未知orphan仍不確定，不改寫為未執行
- Raw source／review／before-receipt／D3／CI／14-case日誌完整保存同一證據包，不重寫歷史證據或把source/discovery算mounted PASS
