# 測試策略與 Agent 施工規範

> 狀態：`TECHNICAL CONTRACT`
>
> 本文件是 Tour Platform 測試**充分性、分層、去重與停止條件**的單一真相。
>
> `.cursor/harness/07_testing_playbook.md` 管理測試命令、執行與 QA 證據流程。本文件管理「應測什麼、在哪一層測、何時足夠、何時過度」。

## 1. 目的

本規範同時防止兩種失敗：

1. **測試不足**：只驗 happy path、只讀 source、沒有真 DB、沒有瀏覽器，卻宣稱功能完成。
2. **測試過度**：同一行為矩陣在多層重複、鎖死實作細節、建立不成比例的 fixture、mock、snapshot 或排列組合。

目標不是追求最多測試。目標是用最小但完整的測試組合，證明每一個獨立產品風險已被正確層級覆蓋。

## 2. 適用範圍

以下工作在開始前必須讀本文件：

- 新增或修改測試。
- 修復 bug 或安全問題。
- 修改 API、資料庫、migration、RLS、交易、併發或背景工作。
- 修改 UI、互動、表單、導覽、付款或預訂流程。
- 修改跨模組契約、序列化格式或第三方整合。
- 聲稱功能已驗收、可交付、可上線或可合併。

純文字修正仍需執行文件與連結檢查，但不需要為此啟動完整產品測試。

## 3. 規則優先順序

遇到衝突時，依下列順序處理：

1. `CLAUDE.md` 的安全、凍結區、migration、production side-effect與實跑證據規則。
2. Owner核准的live issue、當前PR與明確驗收條件。
3. 本文件的測試充分性、分層、去重與停止條件。
4. `.cursor/harness/07_testing_playbook.md` 的執行方式與QA證據格式。
5. 領域技術契約、runbook與現行程式碼。
6. 歷史計畫、舊報告與archive。

文件與現行行為衝突時，先停止擴寫測試。回到live issue、current code、current schema與實際執行證據確認契約。

## 4. 核心模型：AC → 風險 → Owner layer → Seam

每個測試都必須能回答四個問題：

1. 它對應哪一條驗收條件（AC）？
2. 它防止哪一個獨立失敗風險？
3. 哪一層擁有這個行為契約（owner layer）？
4. 哪些消費端只需要接線測試（seam test）？

### 4.1 Owner layer

Owner layer是定義完整行為矩陣的地方。

例如：

- Policy resolver擁有 `inherit / restrict / closed` 矩陣。
- PostgreSQL function擁有交易、鎖、CAS、RLS與冪等契約。
- API handler擁有HTTP狀態、認證、輸入與錯誤映射。
- UI component擁有disabled、提示、焦點與互動狀態。

Owner layer完整測一次。

### 4.2 Seam test

Consumer只證明接線正確，不重跑owner layer的全部矩陣。

Seam test通常只需要證明：

- 正確輸入被傳入owner。
- owner結果被正確映射。
- 一個代表性正向案例。
- 一個具有獨立風險的負向或旁路案例。

若consumer測試再次展開完整矩陣，PR必須說明它能捕捉哪個owner測試無法捕捉的mutation。

## 5. 施工前必填的風險矩陣

開始寫測試前，先在issue worklog或PR描述建立下表：

| AC | 可觀察行為 | 獨立風險 | Owner layer | 最小測試 | Consumer seam | 不需要測的排列 |
|---|---|---|---|---|---|---|
| AC-1 | 使用者看到正確狀態 | 舊資料被漏掉 | resolver | 三個policy狀態 | route一正一負 | 每個狀態重跑route |
| AC-2 | 交易只能成功一次 | 重複寫入 | PostgreSQL | 兩個併發請求 | API映射409 | 每個欄位排列 |

完成條件：

- 每條AC至少有一個可觀察行為。
- 每個獨立風險有owner layer。
- 每個測試有唯一目的或清楚的跨層目的。
- 明確列出不測的排列，防止無界擴張。

若無法建立此矩陣，表示需求或契約仍不清楚。先澄清，不要用更多測試代替設計決策。

## 6. 測試層級選擇

### 6.1 Unit test

適用：

- 純函式。
- 狀態轉換。
- 計算、排序、解析、policy與錯誤分類。
- 無網路、無DB、無瀏覽器的領域規則。

最低充分組合：

- 一個代表性成功案例。
- 每個真正邊界各一個案例。
- 每個會改變結果種類的失敗分支各一個案例。

不需要：

- 把同一結果用多組等價資料重跑。
- 為private helper逐一建立測試。
- 驗證函式內部呼叫順序。

### 6.2 Contract test

適用：

- API request/response schema。
- Gateway與fallback的一致契約。
- 序列化欄位。
- 外部服務adapter。
- 穩定且公開的錯誤碼。

應測公開輸入與公開輸出。

Contract test不應鎖定：

- 私有函式名稱。
- 內部query builder鏈。
- 無契約意義的JSON欄位順序。
- 可安全重構的call order。

### 6.3 Integration test

適用：

- Route → service → gateway接線。
- 多個模組共同完成的行為。
- 真實序列化、授權映射或side effect邊界。

Integration test只重測跨層風險。

若owner unit test已有完整policy矩陣，integration test通常只留：

- 一個正向接線。
- 一個負向或旁路接線。
- 一個跨層才可能發生的錯誤。

### 6.4 真 PostgreSQL test

下列行為不能只靠source-regex、mock或in-memory fake證明：

- Transaction與rollback。
- CAS、row lock、advisory lock與併發競爭。
- Unique、check、foreign key與deferred constraint。
- RLS、grants、role與security definer/invoker。
- Trigger、function、view與SQL型別轉換。
- Migration upgrade與rollback後的真實schema/behavior。
- 冪等重試與「只允許一個winner」。

最低充分組合依風險選擇：

- Migration可套用。
- 主要成功路徑。
- 未授權角色被拒絕。
- 一個交易失敗且無部分寫入。
- 兩個並行請求驗證winner/loser或冪等結果。
- Rollback可執行並恢復指定契約。

不是每個migration都需要全部六項。只有涉及相應風險時才加入。

### 6.5 Component/UI behavior test

適用：

- 顯示狀態。
- 輸入驗證。
- disabled/loading/error。
- 鍵盤、焦點與ARIA。
- component內部互動。

優先測DOM可觀察行為。

不要用source-regex檢查JSX expression，來代替可執行的component或browser行為測試。

### 6.6 Playwright E2E

下列變更必須有真瀏覽器證據：

- 使用者可見流程。
- 導覽、表單、dialog、tab與鍵盤操作。
- API與UI共同決定的disabled/error/success狀態。
- 付款、預訂、登入、回呼後頁面等關鍵旅程。
- SSR/hydration、cookie、redirect或middleware行為。

E2E應測少量關鍵旅程：

- 一個最重要的成功流程。
- 每個不可由低層測試捕捉的關鍵失敗流程。

不要把unit policy矩陣複製成大量瀏覽器排列。

### 6.7 Production smoke

Production smoke只驗證低風險、唯讀或已核准的線上行為。

它不能取代：

- Unit與integration測試。
- 真DB migration驗證。
- Preview E2E。
- Production mutation授權。

證據必須記錄URL、時間、版本/SHA、結果與限制。不得記錄secret或PII。

## 7. 依變更類型的最低充分測試

### 7.1 Bug fix

必須包含：

1. 能重現原始症狀的測試。
2. RED → GREEN證據，或等價mutation證據。
3. 修復所在owner layer的focused test。
4. 若bug跨層，再加入最小seam test。

若原始症狀是UI行為，source test不能代替browser reproduction。

### 7.2 API route

依範圍至少考慮：

- 認證與授權。
- 輸入驗證。
- 成功response contract。
- Domain failure映射。
- Side effect只發生一次。
- 不可洩漏內部錯誤或敏感資料。

不需要為每個domain enum在route層重跑owner矩陣。

### 7.3 DB / migration / RLS

必須先區分：

- 靜態artifact契約。
- 真正DB行為。

Source test可守檔名、statement存在、禁止危險statement與必要排序。

真DB test負責交易、角色、constraint、併發、資料結果與rollback。

只有source test而沒有真DB行為證據時，不得宣稱transaction、RLS、CAS或migration semantics已驗收。

### 7.4 UI

至少考慮：

- 核心狀態與文案語意。
- 使用者輸入。
- Loading/error/empty。
- 鍵盤與無障礙。
- 真瀏覽器旅程。

如果Playwright已驗證同一個disabled與提示行為，不要再用source-regex鎖住相同JSX expression。

### 7.5 Refactor

沒有行為變更時：

- 跑既有owner tests。
- 跑受影響seam tests。
- 執行typecheck/lint/build中與改動相符的檢查。

不要因為函式被拆分，就為每個新private helper新增一套測試。

### 7.6 Security / authorization

至少包含：

- 核准身份成功。
- 非核准身份失敗。
- 跨tenant/跨guide/跨user被拒絕。
- 失敗時無side effect。
- 錯誤回應不洩漏敏感資料。

若安全邊界在DB，必須使用真DB角色或等價真實授權環境。

### 7.7 Concurrency / idempotency

至少包含：

- 兩個真正重疊的操作。
- 明確winner/loser或同結果契約。
- 最終資料筆數與狀態。
- 失敗或重試沒有部分寫入。

單執行緒連續呼叫不能證明併發安全。

### 7.8 Docs / config / generated artifacts

- Docs：檢查Markdown link、格式與指標正確性。
- Config：檢查parser/schema與一個實際consumer。
- Generated artifact：測generator與freshness，不把生成內容行數算成手寫測試規模。

純docs改動不需要無關的完整應用測試。

## 8. 測試不足防線

以下任一情況表示證據不足：

- Bug測試無法重現原始症狀。
- 只有happy path。
- 授權變更沒有denied path。
- DB交易、RLS、CAS或constraint只有regex/mock。
- 使用者可見流程只有source或unit test。
- 只檢查HTTP status，沒有檢查side effect或資料結果。
- 測試早於最後一次相關改檔。
- 測試未綁定current head、staged tree或清楚的dirty manifest。
- Worker只回報「PASS」，沒有命令、exit code與可核對輸出。
- 完整測試通過，但Issue AC沒有逐條對應證據。

遇到以上情況，Reviewer分類為 `缺漏`。不要用更多同層測試掩蓋缺少的高保真層。

## 9. 過度測試防線

### 9.1 同一矩陣只完整測一次

完整policy/state/error矩陣放在owner layer。

Consumer只測接線與consumer獨有風險。

同契約若跨三層以上完整重複，PR必須逐層說明不同mutation。說不出差異時，合併或刪除重複矩陣。

### 9.2 Source-regex限制

Source assertion只適合本質上屬於source/artifact的契約，例如：

- Migration檔名與statement順序。
- 禁止某個危險API或legacy import。
- 必須保留特定export或註冊入口。
- 無法在安全測試環境執行的靜態部署限制。

Source assertion不適合：

- UI顯示或disabled行為。
- API response行為。
- SQL交易、RLS、併發與constraint semantics。
- 私有函式名稱、空白、query builder鏈或可重構call order。

若source assertions多於behavior assertions，PR必須說明為何無法以可執行行為測試取代。

### 9.3 JSON與serialization

只有「byte-identical」本身是公開契約時，才比較序列化字串。

一般API或物件契約應使用語意比較：

- 比較必要欄位與值。
- 忽略無契約意義的key order。
- 對新增向後相容欄位採明確策略。

`JSON.stringify(actual) === JSON.stringify(expected)`若只是方便，應改成deep equality或欄位契約。

### 9.4 Snapshot

Snapshot必須：

- 小而聚焦。
- 內容可人工review。
- 只包含公開輸出。
- 避免時間戳、ID、class順序等高漂移內容。

大型頁面、整份SQL、整個API payload或大量generated baseline不可用單一snapshot取代行為assertions。

### 9.5 Fixture與mock

Fixture與mock的目的，是建立必要邊界，不是重製production系統。

規則：

- 優先使用最小資料。
- 共用穩定builder，不複製大型fake。
- 每個fake只實作案例使用的介面。
- 不把query builder內部順序當成公開契約。
- Mock failure要模擬真實錯誤類型。

單一fixture/mock超過80行時，PR必須說明：

1. 為何不能使用既有helper。
2. 為何不能用較高保真的integration環境。
3. 哪些行是每個案例都需要。
4. 未來是否應抽成共用test utility。

### 9.6 排列組合

只加入會改變結果種類或風險類型的案例。

不要為下列差異建立獨立案例：

- 等價ID或文字。
- 不影響分支的revision數字。
- 同一closed狀態的多個等價版本。
- 每個enum與每個route的笛卡兒積。

使用pairwise、table-driven或代表性邊界取代無界permutation。

### 9.7 行數比例只做review trigger

Test LOC與production LOC不是品質目標。

以下是review trigger，不是拒絕門檻：

- `test LOC / handwritten production LOC > 2`。
- 單一fixture/mock超過80行。
- 同一契約在三層以上完整重複。
- Source assertions多於behavior assertions。
- 測試檔遠大於owner implementation，且沒有新增獨立風險。

觸發後，PR作者必須說明風險與每組測試的獨立價值。

計算時排除：

- Generated baseline。
- Lockfile。
- Manifest。
- 自動產生schema。
- Evidence與worklog。

### 9.8 Production diff不得為測試失真

為可測性抽出清楚的domain seam是合理的。

下列情況需重新設計：

- 只為測試新增production-only flag。
- 把private implementation變成public API。
- 在production加入只供fake呼叫的分支。
- 為了source-regex固定函式名稱與程式排列。
- 測試要求改變產品契約，而Issue沒有此需求。

## 10. 擴大測試範圍與既有交付 Gate

### 10.1 新增測試的範圍

本節的owner/seam模型只決定「應新增哪些focused tests」，避免為同一風險持續擴寫重複案例。

Focused tests通過後，只在下列風險條件擴大**新增或診斷用測試**：

- 修改共用contract或跨域gateway。
- 修改auth、payment、booking、availability等高影響主線。
- 修改build、toolchain、test runner或全域config。
- Focused test暴露相鄰回歸。
- 變更無法由依賴圖清楚界定。
- Reviewer指出具體且可達的跨域風險。

擴大順序：

1. Owner focused tests。
2. 直接consumer seam tests。
3. 領域suite。
4. Typecheck/lint/build。
5. 全suite。
6. Preview E2E或核准的production smoke。

完整suite不是新增測試設計的理由；但它可以是既有交付或release gate。

### 10.2 不可跳過既有交付 Gate

避免過度測試，不代表可以跳過repo既有驗證門檻。

交付、commit與PR仍必須遵守`CLAUDE.md`及`.cursor/harness/07_testing_playbook.md`：

- 先跑targeted tests。
- Backend任務依現行playbook再跑`npm test`。
- 提交PR前依現行rubric執行`.claude/hooks/run-checks.sh --all`，或取得對應current head SHA的CI全綠證據。
- Release gate要求的build、E2E與production smoke仍需完成。

本文件只能控制測試設計與新增案例範圍，不能單方面取消現有governance gate。

若要改變`.cursor/harness/03_rubrics.md`或`.cursor/harness/07_testing_playbook.md`的全套驗證要求，必須另行取得治理授權，並同步修改所有入口與gate。不得只在本文件放寬。

## 11. 停止條件

當以下條件全部成立時，停止新增測試：

- 每條AC有可觀察證據。
- 每個獨立風險有owner test。
- 每個必要consumer有最小seam test。
- 必要的真DB或真瀏覽器層已完成。
- 每個負向案例代表不同失敗類型。
- 沒有未解釋的review trigger。
- 新增一個測試已無法指出新的可達mutation。

「再多一個比較安心」不是新增測試理由。

新增測試的合格理由格式：

> 若移除本測試，`<具體mutation>`仍可能通過現有suite，並造成`<使用者/資料/安全影響>`。

## 12. RED → GREEN與mutation證據

Bug regression test必須證明它能抓到bug。

可接受證據：

- 修復前測試RED，修復後GREEN。
- 暫時回退修復或注入等價mutation，測試RED；恢復後GREEN。
- 對不可安全回退的migration，使用隔離DB或fixture證明缺少關鍵statement時失敗。

只看到GREEN不能證明回歸測試有效。

證據必須晚於最後一次相關改檔。

## 13. 驗證證據格式

每次交付至少記錄：

- Branch。
- HEAD SHA或staged tree識別。
- 最後相關改檔時間。
- 執行命令。
- Exit code。
- Passed/failed/skipped數量。
- 未執行項目與原因。
- E2E的URL、browser、artifact位置。
- DB test使用的隔離環境。

Worker自報PASS不是最終證據。Reviewer需確認：

- 證據綁定正確worktree與SHA。
- 證據晚於最後改檔。
- 命令真的涵蓋聲稱範圍。
- 背景程序exit 0且測試本身沒有failed。

## 14. Agent開工清單

- [ ] 讀取 `CLAUDE.md`、live issue/PR與本規範。
- [ ] 確認正確repo、worktree、branch與base SHA。
- [ ] 列出AC與不在範圍內的項目。
- [ ] 建立AC → 風險 → owner layer → seam矩陣。
- [ ] 搜尋既有測試，避免重建已有矩陣。
- [ ] 指定需要的最高保真層：真DB、browser或production smoke。
- [ ] 定義RED或mutation證據方法。
- [ ] 寫下停止條件。

## 15. Agent實作中清單

- [ ] 每個新測試只增加一個獨立風險或跨層證據。
- [ ] Owner layer保留完整矩陣。
- [ ] Consumer只測接線與consumer獨有風險。
- [ ] Fake與fixture保持最小。
- [ ] Source assertion只守source契約。
- [ ] DB semantics使用真PostgreSQL。
- [ ] 使用者行為使用真瀏覽器。
- [ ] 測試失敗時先診斷，不用更多assertion掩蓋不穩定性。
- [ ] Production code沒有為測試加入失真分支。

## 16. Agent完成前清單

- [ ] Regression test有RED → GREEN或mutation證據。
- [ ] AC逐條有證據。
- [ ] Auth/tenant/side-effect負向邊界完整。
- [ ] 必要真DB、browser與seam測試已完成。
- [ ] Review triggers均有合理說明或已精簡。
- [ ] 沒有重複policy矩陣、等價permutation或大型無界snapshot。
- [ ] Focused evidence晚於最後改檔。
- [ ] 需要時才擴大到領域或全suite。
- [ ] `git diff --check`與文件link檢查通過。
- [ ] 回報未驗證項目，不把INCONCLUSIVE寫成PASS。

## 17. PR測試說明模板

```markdown
## Test design

### AC / risk matrix
| AC | Risk | Owner layer | Test | Consumer seam |
|---|---|---|---|---|
| AC-1 | ... | ... | ... | ... |

### Existing coverage reused
- `<path>`：保留的owner contract。

### New tests
- `<path>::<case>`：捕捉`<mutation>`。

### Deliberately not duplicated
- 不在route/E2E重跑完整policy矩陣，因owner unit suite已覆蓋。

### Fidelity
- Real PostgreSQL: yes/no + reason
- Browser: yes/no + reason
- Production smoke: yes/no + approval boundary

### Review triggers
- Test/product LOC: `<ratio>`，排除generated artifacts。
- Fixture/mock >80 lines: yes/no + justification
- Source assertions > behavior assertions: yes/no + justification
- Same contract repeated across 3+ layers: yes/no + justification

### Fresh evidence
- Branch / SHA:
- Last relevant edit:
- Command:
- Exit code:
- Result:
- Not verified:
```

## 18. Reviewer分類

Reviewer對每組測試使用以下分類：

### `必要`

捕捉獨立、可達且有影響的風險。層級正確。移除後會留下具體mutation。

### `可合併`

風險有效，但可用table-driven、共用fixture或單一owner矩陣降低重複。

### `過度`

只重複等價輸入、鎖實作細節、建立無契約的byte/snapshot/call-order要求，或無法指出新mutation。

### `缺漏`

沒有驗證真正風險。常見例子是用regex代替DB semantics、用unit代替browser、只有happy path或證據早於改檔。

Reviewer提出阻擋時，必須指出：

- 哪條AC或風險。
- 哪個現有測試不足。
- 需要哪一層證據。
- 最小新增範圍。
- 哪些後續範圍不應倒灌。

## 19. 分層調整範例

### 19.1 重複policy矩陣

不佳：

- Resolver測完整 `inherit / restrict / closed`。
- Route再測完整三態。
- Traveler/E2E再測完整三態。

正確：

- Resolver owner test完整三態與邊界。
- Route測一個正向映射與一個缺policy失敗。
- E2E只測使用者可見的代表性允許/阻擋旅程。

### 19.2 SQL regex取代DB行為

不佳：

- Regex看到 `FOR UPDATE` 就宣稱CAS安全。
- Regex看到`GRANT/REVOKE`就宣稱RLS/role正確。

正確：

- Source test守statement存在、危險statement不存在與必要排序。
- 真PostgreSQL同時送出兩個請求，驗證一個winner與最終資料。
- 用真role驗證allowed/denied與失敗無side effect。

### 19.3 UI source contract重複E2E

不佳：

- Regex鎖定 `disabled={!canPublish || isLegacy}`。
- Playwright又驗證按鈕disabled與提示文案。

正確：

- Component或Playwright驗證可觀察disabled與提示。
- Unit test保留決策函式的狀態矩陣。
- 不鎖JSX expression與private變數名稱。

### 19.4 JSON完全字串相等

不佳：

- 用 `JSON.stringify`比較兩個語意相同物件。

正確：

- Deep equality比較公開欄位。
- 只有簽章、cache key或byte protocol明定順序時，才比較bytes。

## 20. 快速判定句

新增任何測試前，完成這句話：

> 這個測試位於`<layer>`，保護`<AC/risk>`，能抓到`<mutation>`；現有`<test>`抓不到它，因為`<reason>`。

若無法完成，先不要新增測試。
