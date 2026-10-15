# #1816 private confirmation runtime 施工紀錄

## 目標

固定 base/HEAD `2eb6df3d665b64569e2a31a43e08e2a95dc81bec`，branch `codex/issue1816-private-confirmation-runtime`。
role=build，requested=gpt-6.1-sol，actual=unknown；before PASS chunk2605af。
complexity=complex：跨三條領域流程與單一 state owner；不宣稱模型身分已驗證。
Owner 已允缺 Claude 工具的等效保護/ownership、官方 Node22、原 run-checks 與獨審流程；未宣稱 hook wiring。
本工作僅安全 source／純模擬測試；不連真 DB、不做付款寄信／共用 TEST／Production／網路、權限或憑證變更，不改治理/runner/pin/凍結檔/auth/UI。build 未在本次施工執行。
純 mock browser 可另行調度；本 actor 本輪不跑 browser/全套，由父流程排程，並非概括聲稱 Owner 禁止所有 browser。

## AC 清單（原九條；source 獨審通過，AC7 未完成）

- [x] RED：至少一個行為測試能在舊設計下證明 production module 直接依賴 mutable runtime shape；測試必須先真實失敗。
- [x] GREEN：conversion、accept、preview 的 production path 不再直接 import/export `__confirmationRuntime` 或可變 Map。
- [x] 單一 private adapter 擁有 stores、clock、seed/reset 與 lifecycle state transition；沒有第二份 shadow store。
- [x] Conversion success、double-convert、wrong traveler、expired/used token、accept replay、preview invalid／expired／used 等既有行為不變。
- [x] Preview read contract 在 in-memory 與 Supabase adapter 上有可重用 parity tests。
- [x] Accept 仍由 RPC 決定最終結果；preview 不執行 accept RPC，也不消費 token。
- [ ] 現有 Midao reusable E2E 仍通過，且一般 booking checkout 不受影響。
- [x] Architecture ratchet 全綠，未放寬 800 行上限或新增 ESM cycle。
- [x] 刪除舊 runtime export 後，複雜度被集中進 adapter，而不是搬成 conversion／accept／preview 三份 helper。

## 已完成（含 commit SHA）

- 尚未 commit/push/PR；本 actor 不做遠端 write，由父流程接 fresh 獨審後處理。固定 base/HEAD 未變。
- 原 baseline 四 focused 檔83 PASS，`/workspace/issue1816-evidence/baseline.log`；不重跑無變更 baseline。
- AC1 候選歷史：正常公開回應 alias 無有效 RED；seed-only alias RED 只證 seed ownership，未作 AC1 替代。
- 新 AC1：`access-runtime-review.md` PASS/0 findings，原 control exit0、recording exit1、seed-only recording exit1，兩者相同23安全事件且完整公開 oracle 通過。父流程已同步 Issue comment `6197613906`。
- A 將已審 probe 固定為 repo fixture，唯一修改 root URL 為 repo-relative，已 bytes 核對；公開 oracle/phase/事件清除策略/zero-events assertion 原樣保留。
- A 首次父測試繼承 `NODE_TEST_CONTEXT` 導致 nested child 空跑而假綠（`implementation/A-red.log`）；沒有將它當 RED。修正 driver 刪父子 runner 協定環境變數後，正式原 source RED：chunk271bd1，`A-red-corrected.log` exit1，control PASS、recording 唯一 fail 為原 boundary assertion。最終 driver 另鎖 child tests2/pass2/skipped0 防空跑。
- 七 stores、clock/token providers、seed/reset/inspect、conversion/accept/preview domain operations 與 transitions 現在由 `confirmation-runtime.mjs` 單一擁有，467行。最終沒有 raw Map export、legacy runtime handle、shadow state 或 gateway traversal。
- Gateway 留 normalize/hash、安全錯誤、公開 projection、Supabase 原 RPC/read 編排；兩個純 policy/value helper 與錯誤 factory 不擁有 state、不回指 gateway。reset 仍只清資料；fixture inputs/outputs、inspect 與 completed snapshots detached。
- 既有缺 order 的測試改為明確 lifecycle fixture，原安全500斷言不變；未更動其他既有公開 oracle。

分批證據（原正式 run-checks；全部 exit0，AC1 RED 另列）：

| 批次 | 責任 | tests | log | added+deleted |
|---|---|---:|---|---:|
| B1 | stores/providers 單 owner，暫時同 backing bridge | 63 | `B1.log` | 115 |
| B2 | seed/reset/inspect ownership | 63 | `B2.log` | 124 |
| C1 | 共用純 conversion policy | 25 | `C1.log` | 173 |
| C2 | conversion lifecycle domain operation | 63 | `C2.log` | 271 |
| D1 | accept domain operation | 38 | `D1.log` | 231 |
| D2 | preview domain operation | 38 | `D2.log` | 125 |
| D3 | fixture ownership、刪 legacy export/raw bridge | 45 | `D3.log` | 134 |
| D4/E4 | semantic faults、共享純值清理（合計） | 65（D4時） | `D4.log` | 128 |
| E1 | shared memory/fake Supabase full envelope | 16（初版） | `E1.log` | 156（helper99+test57，最終含17情境） |
| E2 | snapshot/reset/clock/TOCTOU/RPC權威 | 22（初版） | `E2.log` | 150（最終24測試） |
| E3 | bounded closure graph/fresh import + ratchet | 6 | `E3.log` | 72 |

B/C/D line counts 是使用保存的實作 script 在 /tmp 的 fixed HEAD source 副本重建 diff，**不是當時逐批保存的 patch**；方法與各path在 `implementation/batch-line-counts.json`。D4/E4是對D3副本的最終source與既有fixture差異保守合計。B 事先拆 B1/B2、C 拆 C1/C2、D 分四責任，均沒有單批超300。總票不是小改，仍必須 aggregate 獨審。

最終正式命令（固定 `TP_NODE22_ROOT=/workspace/issue1816-runtime/toolchains/node/22.23.1`，原 run-checks，未改 runner/pin）：

```bash
bash .claude/hooks/run-checks.sh --typecheck apps/web/tests/api/midao-inquiry-convert.test.mjs apps/web/tests/api/midao-booking-confirmation.test.mjs apps/web/tests/api/midao-traveler-confirmation-preview.test.mjs apps/web/tests/api/midao-checkout-confirmation-gate.test.mjs apps/web/tests/api/issue1816-confirmation-runtime-contract.test.mjs apps/web/tests/api/issue1816-confirmation-preview-parity.test.mjs apps/web/tests/api/issue1816-confirmation-authority.test.mjs apps/web/tests/unit/architecture-ratchet-guard.test.mjs apps/web/tests/unit/issue1816-confirmation-import-graph.test.mjs
```

- 真 exit0，132 tests /132 PASS/0 FAIL/0 SKIP，typecheck exit0。最後正式原始log：`/workspace/issue1816-evidence/implementation/frozen-focused-typecheck.log`；receipt：`frozen-checks-receipt.json`，epoch1792083770（UTC 2026-10-15 17:02:50 / 台北2026-10-16 01:02:50）。chunk109993。
- 新 boundary control/recording均GREEN；shared parity17情境，authority24測試；ratchet4與graph/import2全綠。graph解析21個local modules，owner closure16，沒有cycle/owner回指gateway。現有原83 focused亦在132內。
- fake preview RPC/write tripwire零calls；pending preview→expired/capacity RPC拒絕、expired preview→RPC成功均維持accept權威；memory expiry/capacity TOCTOU、failure不留claim、同key可再成功。
- 僅使用既有查詢與fake，未改Supabase產品規則/schema；施工者已讀Supabase skill，本工作不需遠端操作，未執行真 query。
- SOURCE/TEST FREEZE：2026-10-15T17:02:51.254738+00:00；13 paths，manifest `frozen-source-manifest.json` SHA256 `160c0d3807a7586745601ba2a2c1601ec677c1b71f85aae6ec6dd3a34e4ef3af`。
- source/tests aggregate +1156/-582，完整patch `frozen-source.patch` SHA256 `4c53304fcbe695390470926055634e7722d4f3a091002c93255d8484a5f8b902`。每path bytes/lines在manifest與`aggregate-source-stats.json`。
- 範圍read-back：兩gateway無 `__confirmationRuntime`/Map traversal；所有13 paths及worklog最終手動file-guard exit0在`final-file-guard.json`，不冒稱Claude hook wiring。`git diff --check`最終通過。

AC施工證據（均待父流程fresh audit；不自行驗收結案）：

| AC | 施工真值 |
|---|---|
| 1 | 新合格動態RED原證據與repo重現保留；原公開oracle不變。 |
| 2 | boundary GREEN，production legacy runtime export/import刪除；待architecture獨審。 |
| 3 | 單owner七stores/providers/seed/reset/transitions，隔離測試GREEN；待獨審。 |
| 4 | 原83 focused＋新增回歸全綠，無產品規則變更。 |
| 5 | 17 shared full-envelope memory/fake Supabase情境GREEN。 |
| 6 | RPC權威、preview零write/RPC、不consume、TOCTOU與replay/隔離測試GREEN。 |
| 7 | HOLD：本actor未跑E2E；完整Midao lane仍需auth/DB條件，純mock其他lane由父流程另排。 |
| 8 | ratchet、21 local closure無cycle與fresh import GREEN；待architecture獨審。 |
| 9 | domain operations集中owner、未留raw bridge/三份規則；待deletion獨審。 |

## 下一步

- 發布前 staged diff check 首次完整涵蓋新增檔案時真 exit2：三個新 pure helper 各有一個檔尾多餘空白行；此前 unstaged `git diff --check` 未涵蓋未追蹤檔，不當作完整 candidate 綠燈。修正只各刪1 byte（嚴格 `old = new + '\n'`），原source審查紀錄與失敗保留。
- 最終source manifest SHA256 `bb307b749aba70cb8679fe0a3587db89c3549f0e21dc06d1458877f0852ecb4b`，source patch SHA256 `1b1c6e4d898bbd23dd84be5d6be884925a0e29800229c23eed323a782599116b`（+1153/-582）；前述初審manifest/patch是未修EOF的歷史候選。新增EOF修正與文件增量另作獨立review，重新執行原full＋typecheck，不以舊證據冒充新候選。
- 最終候選原 `run-checks.sh --all --typecheck` 真exit0：5934 tests／5931 PASS／0 FAIL／3 SKIP／0 cancelled，29.704秒；typecheck成功。證據 `release-suite/ordinary-typecheck.log` 與 `receipt.json`，重型程序已結束釋放容量。
- 2026-10-16 01:07 Asia/Taipei：兩位 fresh-context reviewer 對同凍結13檔分別 PASS-in-scope／未解0；行為 reviewer 真跑134 PASS、child control/recording各2 PASS。原 full ordinary 真 exit0，5934 tests／5931 PASS／0 FAIL／3 SKIP／0 cancelled（27.257秒）。施工typecheck亦exit0。詳見 [QA報告](../qa-reports/issue1816-source-recovery-20261016.md)。
- Source/tests維持凍結；文件review後按原gate commit/push/Draft PR並讀回。發布SHA、URL與自然CI結果同步Issue；本次文件在commit前定格，不預填尚未產生的SHA。
- AC7仍HOLD：既有完整Midao browser lane依賴auth/DB，focused checkout不能替代；沒有完成全九AC。PR checklist回答 `Issue 目標是否已直接驗證: no` 並解釋安全source範圍已驗證。
- 自然CI（含lint/build）、完整browser與正式sign-off仍待完成；不Ready、merge、關票、部署或操作真DB。

## 絕不重做（Do-NOT-redo）

- 不改原九 AC、probe oracle 或事件清除策略以換綠，不用 seed-only 修法替代 architecture boundary。
- 不跑 `midao-inquiry-convert-rpc.test.mjs`：它需要真 PG；fake RPC 在 `midao-inquiry-convert.test.mjs`。
- reset 只清資料，clock/token setters 分開 restore；不建立 shadow stores，不匯出 Map/generic get-set/live rows 作最終 seam。
- 單批 added+deleted 預估超300先拆；總搬遷超300需 aggregate 獨審，不稱小改。
