# #1891 — Next Google 字型無副檔名 URL 建置相容修復

> 更新：2026-10-06 20:12 Asia/Taipei｜狀態：local source／獨立審查 PASS；真 Google app build／新 CI 尚待

## 目標

修復 [#1891](https://github.com/smallwei0301/tour-platform/issues/1891)：main9cce 的 [CI](https://github.com/smallwei0301/tour-platform/actions/runs/37453529951) 在官方 Next15.5.14 loader122 對 extensionless Google URL 取 null[1]。13個raw URL確定不匹配原regex；實際offending family/upstream原因仍UNKNOWN。此為獨立main健康slice，不重開已merged #1889。

## AC 清單

- [x] 原真vendor loader RED1；guarded shim後同SDK/CSS/font fetch wrappers/cache/emit GREEN0
- [x] extensionless以實際WOFF2/WOFF/TTF/OTF bytes判格式；未知／錯header／截斷／declared span越界fail closed；normal URL沿原路
- [x] 保留Next15.5.14／loader／fontkit digest guard、品牌families/weights/display/variables、原真fetch與next build；無新deps/locks/assets/workflow/credentials/network/DB
- [ ] 新head原真Google-font app build與必要CI終局成功；SDK單元fixtures不算app build PASS

## 已完成（附證據）

- Base main9cce258c22a9e39cde82294916ff48effd6927a2；source3檔patch SHA256：0decbfb63c0d30208e3c2bd64aad43d41a8e036289f6ac84b042451007c076cc
- Source3檔：build compatibility script、apps/web/package.json build前置、新unit test。RootDocument／locks／workflow／guards／原font test／sharedSDK皆未改；自有獨立deps驗證
- 獨立R2 bounded review PASS、未解finding0；自行49/49 focused＋原R1 17declared-length反例全拒，另真compressed WOFF/transformed WOFF2/CFF WOFF/WOFF2四組通realSDK；非完整font規範驗證
- Node22正式 --all --typecheck：2026-10-06 20:05:04 Asia/Taipei exit0，5889total／5886PASS／0FAIL／3既有SKIP，tsc PASS。僅process指定UNDICI-EHPA warning filter，原R1四個JSON/stderr污染FAIL與typeNOT_RUN完整保存
- #1891建立前曾缺批准拒／服務cancel，未假造Issue號或換endpoint；Owner明准公開建立後，同payload正常服務恢復已於20:09:02真建立此Issue

## 下一步

- 只新增本必要worklog完成文件適用驗證與獨立doc review，保持source3 bytes不變；正常source Draft後追原真Google build及CI，不以local SDK GREEN冒稱完整發布
- 公開Issue comment記實際source head、worklog及終局，完成D7；在此文件生成時尚未發布／comment，不能稱雙寫已完成

## 絕不重做（Do-NOT-redo）

- 不vendor/換品牌/升級Next、不mock或skip原build、不patch共享deps；Owner1735/1742曾否決手工自托管，保持原Google slicing
- R1真F1為fontkit跨declared table span讀取，已用instance-local bounded stream修並復驗；原來源／反例／fail logs及before-receipts不覆寫
- 所有Source/SDK單元證據與真app build範圍分開；新CI／發布／merge及其Production影響須沿原適用gates，不把1889上線批准外推成新scope授權
