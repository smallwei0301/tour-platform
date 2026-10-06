# #1891 — Next Google 字型無副檔名 URL 建置相容修復

> 更新：2026-10-06 20:35 Asia/Taipei｜狀態：PR #1892 source／真 Google app build／CI／Preview PASS；文件與 D7 收尾中

## 目標

修復 [#1891](https://github.com/smallwei0301/tour-platform/issues/1891)：main9cce 的 [CI](https://github.com/smallwei0301/tour-platform/actions/runs/37453529951) 在官方 Next15.5.14 loader122 對 extensionless Google URL 取 null[1]。13個raw URL確定不匹配原regex；實際offending family/upstream原因仍UNKNOWN。此為獨立main健康slice，不重開已merged #1889。

## AC 清單

- [x] 原真vendor loader RED1；guarded shim後同SDK/CSS/font fetch wrappers/cache/emit GREEN0
- [x] extensionless以實際WOFF2/WOFF/TTF/OTF bytes判格式；未知／錯header／截斷／declared span越界fail closed；normal URL沿原路
- [x] 保留Next15.5.14／loader／fontkit digest guard、品牌families/weights/display/variables、原真fetch與next build；無新deps/locks/assets/workflow/credentials/network/DB
- [x] Source head e3e150 原真 Google-font app build、CI、smoke 與 Preview 終局成功；SDK單元fixtures不算app build PASS

## 已完成（附證據）

- Base main9cce258c22a9e39cde82294916ff48effd6927a2；source3檔patch SHA256：0decbfb63c0d30208e3c2bd64aad43d41a8e036289f6ac84b042451007c076cc
- Source3檔：build compatibility script、apps/web/package.json build前置、新unit test。RootDocument／locks／workflow／guards／原font test／sharedSDK皆未改；自有獨立deps驗證
- 獨立R2 bounded review PASS、未解finding0；自行49/49 focused＋原R1 17declared-length反例全拒，另真compressed WOFF/transformed WOFF2/CFF WOFF/WOFF2四組通realSDK；非完整font規範驗證
- Node22正式 --all --typecheck：2026-10-06 20:05:04 Asia/Taipei exit0，5889total／5886PASS／0FAIL／3既有SKIP，tsc PASS。僅process指定UNDICI-EHPA warning filter，原R1四個JSON/stderr污染FAIL與typeNOT_RUN完整保存
- #1891建立前曾缺批准拒／服務cancel，未假造Issue號或換endpoint；Owner明准公開建立後，同payload正常服務恢復已於20:09:02真建立此Issue
- [Draft PR #1892](https://github.com/smallwei0301/tour-platform/pull/1892) source head e3e150ca2c6916e83d004442da8ee603990d6d9b／tree fc681d65b88dab447f3ae364341858b46d10384d；四檔 bytes、commit parent/tree 與 remote ref 已真回讀，獨立乾淨 snapshot 保留舊 staged 工作樹
- [自然 CI 37463585378](https://github.com/smallwei0301/tour-platform/actions/runs/37463585378) SUCCESS：5889total／5886PASS／0FAIL／3既有SKIP；raw 明列 guarded compatibility patched → 原 next build／Next15.5.14 → ISR／Preflight PASS，workflow 無 mocked-font env
- [自然 smoke 37463585384](https://github.com/smallwei0301/tour-platform/actions/runs/37463585384) SUCCESS：13 passed＋1 flaky，舊 #1360 line92 空列表在 CSRF GET（helpers40）ECONNRESET，內建 retry 成功、根因未證；cover3 首跑 PASS，無手動 rerun
- Preview dpl_fNgnByPAFwUoiycAAhBsp5vHpNXS READY／target null／exact e3e150／aliasError null；原 main9cce CI 字型 FAIL 與已知 Production READY 分別保留，尚未 merge 本修正

## 下一步

- 本次只更新必要 worklog，保持 source3 bytes 不變；文件 R2 窄驗證／獨立 review 後正常更新原 Draft，再追新 exact head 適用 CI
- 在 #1891 公開留言記 source head、worklog 與終局，完成 D7；生成本文件時該留言尚待，待真 read-back 才稱雙寫完成

## 絕不重做（Do-NOT-redo）

- 不vendor/換品牌/升級Next、不mock或skip原build、不patch共享deps；Owner1735/1742曾否決手工自托管，保持原Google slicing
- R1真F1為fontkit跨declared table span讀取，已用instance-local bounded stream修並復驗；原來源／反例／fail logs及before-receipts不覆寫
- 所有Source/SDK單元證據與真app build範圍分開；新CI／發布／merge及其Production影響須沿原適用gates，不把1889上線批准外推成新scope授權
