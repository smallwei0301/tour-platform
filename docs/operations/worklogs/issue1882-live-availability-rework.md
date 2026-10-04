# issue1882 live availability 新實作

Owner 本輪批准三項 AC：成功 live schedules=[] 清除 SSR；排除 startAt<=now 並讓 V2 日期只彙總未開始場次；日期及 CTA scheduleId 隨目前有效方案與場次同步，刷新失效清除舊 id。

Base da9f1fbd5cc2b373609d0956404a1c91d61a864c；branch rework/midao2-live-availability。這是新施工，不是恢復原六檔；舊 worklog 保留，本輪授權覆蓋其相關 Do-NOT-redo。

Public seams：V2 日期 availability 輸出、DatePlanSection 可見日期與 CTA。以 mock 資料測試，無 DB 真連線。正式 runner 固定 Node22.23.1；逐項 red→green。禁止 DB/TEST/Production/部署、commit/push/PR、credentials/network/安全設定變更、legacy/middleware/harness/lock 修改。canonical E2E 由 root review spec 後執行，本施工者不執行。

requested gpt-6.1-sol；actual unknown。Native hooks NOT_VERIFIED；Owner 已批准自動補償。證據目錄 /workspace/tour-rework-20261003/build。

## V2 與 upcoming cutoff
- V2 public output red exit1：舊結果 first09:00、slotCount3，期望11:00、slotCount1；最小 cutoff green exit0。now 為可注入 Date，於 request 捕捉一次，absolute instant 排除 <=now。
- upcoming helper 更新 now 邊界 public tests，正式 red exit1→green exit0；午夜及 offset cases同步要求 strict future。
- 增補 V2 全部已開始及不同 timezone output regression cases。未改 legacy frozen API。
- canonical UI slice1 spec 已備妥 root review：成功 empty清除SSR日期；focus/live April 與civil late-day fixtures保留舊AC。產品 DatePlanSection尚未修改，等待root canonical red。
- interim targeted：V2/helper兩檔PASS，既有civil SSR FAIL（child status0但stdout空）；移除NODE_TEST_CONTEXT仍無效，兩次修不動停止，撤回未驗修正。直接CIVIL_DATE_CHILD Node22可輸出30 pills；既有SSR正式runner環境未驗，不冒稱PASS。

## 日期與 booking identity 新施工
- 新 public resolver `date-plan-availability.ts`，依 root 在 canonical child環境阻塞後授權，以可直接執行純 public seam替代fake React hooks。
- 逐項正式 red→green：empty（原非空fallback）；identity（原full-first id）；cutoff（原未排除已開始）。均red exit1、green exit0。Formal TAP僅file-level，初red未事先保存source snapshot或leaf assertion diff，故紅燈原因只可由原工具順序/編輯內容核對，不冒稱持久可讀assertion差異證據。
- DatePlanSection以resolver推導有效日期/id，render立即使用有效值；effect同步共享bottom CTA並清requestedDate。尚未browser驗證mounted refresh，不承諾永久掛載倒數。
- 新canonical spec共12 cases：原7保留對應AC，新增延遲live refresh replacement/empty/other-plan/full，以及<=now cutoff。Root負責review/pin；builder未执行canonical，首次root canonical red為child status0空輸出環境阻塞，非產品assertion紅燈。
- `selection-integrated-green.log` 正式3檔file-level3PASS＋typecheck exit0。新增resolver leaf3案尚未獨立leaf跑，由root驗證。
- Freeze後自檢finding：先filter容量再做foreign-ID defense，可能在selected a full + foreign x open誤判allForeign並帶x。已回報root，未私自解凍；待窄修正或review處理。

## Freeze finding 窄修正
Root明確再授權resolver＋對應test：先判完整日期/方案scope，再filter容量選booking identity。真leaf正式Node22 test-isolation=none red3pass1fail exit1（實際錯帶foreign-open id），green4pass0fail exit0。保存red source/test snapshots與可讀assertion log：selection-foreign-{red,green}.log；這項finding已修，待獨立review。最終resolver SHA256 1aabdd7483528b2ff38aad53c85ea43437152add360f7319f4958976985147d3，test 9ae59c30be92deee176e4a8b53f1fdcbdb7c8f60d36840d1a3cfa465b4fe5cd3。產品/tests重新freeze；此窄修後typecheck與全量ordinary由root補，builder不共享重跑run-checks。

## 原 intent source 契約窄修
Root全量ordinary exit1（745files，722pass、23fail）；真leaf affected-regression.log 18案16pass2fail，兩失敗皆舊測試把任意useEffect等同mount fetch。Root授權僅修兩測試及spec intent assertion，不改產品、不擴查其他21fail。

兩原測試改TypeScript AST檢查：component必須可解析、effect必須inline可檢視，callback內禁止fetch/ensureLiveAvailability（含property calls）；selection-sync effect可存在。原intent handlers要求保留。canonical fixture完成SSR後assert availability mocks長度0，browser未跑。

正式Node22真leaf intent-contract-green.log：18/18 PASS exit0；intent-contract-typecheck.log exit0。hash：activity-availability-intent.test.mjs f7ccdeaa385e3d4f2db9ddf50eb17b2ca073bd167b694ae731f5faca346481fa；plan-first-date-selection.test.mjs c55da2a9c030764c23dd30566d3d6c36f740cfa8bcc66cb0111533d6f34837d3；spec fe504f49691b742148c541bd840de4bd3ae7b591ed5c39680d8a7ee8c1ff71d7。產品與tests再次freeze，root管理review/pin及其他ordinary失敗歸因。

## 最終本機交付（未宣稱全套完成）
三項新施工已完成並保留未提交。獨立source review PASS，未解finding0；19項核心/對抗及18項intent leaf通過，窄修後typecheck exit0。最終ordinary正式run-checks --all：745個file-level、724pass、21fail、exit1；失敗未全部歸因，不能稱全綠。canonical E2E僅跑一次：Fixture server exited:，child exit/close0且stdout/stderr空，beforeAll失敗1、未跑6；新版12案未驗證。最後spec獨立審查後pin更新fe504f49691b742148c541bd840de4bd3ae7b591ed5c39680d8a7ee8c1ff71d7，正式preflight exit0，未重跑E2E。
保留 recovery/midao2-node22=da9f1fbd5cc2b373609d0956404a1c91d61a864c、原7/7與所有recovery artifacts。沒有commit/push/PR/API重試、網路/憑證/權限變更、DB/TEST/Production操作。新成果分支rework/midao2-live-availability；完整結果 /workspace/tour-rework-20261003/result.md、result.json、final.patch。

## 本輪21項失敗歸因與驗證續作
先保全12檔起始內容與sha256於 /workspace/tour-rework-20261003/verification/starting-files，recovery/midao2-node22仍da9f1fbd5cc2b373609d0956404a1c91d61a864c。唯一既有builder保持停止，本輪沒有產品/測試/runner/環境修正，僅此worklog追加與外部證據。

先讀原result.md/final.patch/ordinary-final.log；21個失敗測試檔與da9 bytes一致。正式canonical Node22對這21檔各定向取得leaf（沒有重跑全745）：163tests、100pass、63fail。歸因詳表 verification/attribution.md/json：子程序EPERM、空stdout/JSON與marker失敗；issue507另有2個既有loopback fixture listen EPERM。civil-date本輪只直接證明status0、0pill匹配，未保存raw stdout；前輪diagnostic另有空輸出。stdin一案status1為支持性環境歸因，底層policy未證實。

不載入repo的canonical child sentinel仍status17+EPERM+空stdout/stderr，async close17無輸出；child寫診斷檔證明確實執行。strace被PTRACE_TRACEME EPERM拒絕，未提權；stdin probe未完成且終止唯一owned child，不作成功證據。沒有支持最小可授權修復的證據，不改helper/gate或重跑瀏覽器。

fixture beforeAll/afterAll/guard與da9完全一致；diagnostic helper、spawn helper、ordinary runner及config同基底；tp-node22只有已審spec pin差异，官方Node22 artifact check仍通過。原child有UTF-8 stdout743bytes/stderr2048bytes，失敗child均0。

33個本次功能與intent leaf通過，typecheck exit0。獨立歸因審查修正文義/byte單位後通過（不是產品完整驗收）；全量ordinary舊21檔仍fail，新12案browser NOT_VERIFIED，不commit/push/PR。GitHub GraphQL Forbidden未重試/換接口；未變更憑證、網路、權限或連外DB/共享TEST/Production。完整續作結果 verification/verification-result.json、attribution.md 與audit-report.json。

## 標準核准執行恢復（本輪）
依使用者新增授權，先讀runtime exec_command規格：default sandbox workspace-write/network restricted；標準require_escalated由auto_review審核。此前只有sandbox內EPERM，沒有正式核准拒絕。本輪對精確無害命令逐項走正常核准，未修改OS、網路、安全、權限設定或停用保護。

同一repo-free canonical Node22 sentinel經核准後回status17、stdout CHILD_STDOUT_SENTINEL、stderr CHILD_STDERR_SENTINEL，沒有error；支持執行邊界限制，底層exact syscall policy仍未證實。接著正式run-checks：civil-date7/7、其餘19檔149/149、既有loopback mock issue5077/7，合計原21檔163/163 PASS。沒有重跑745。

canonical --preflight-e2e通過後，精確canonical12案命令經獨立正常核准執行：12/12 PASS、exit0、58.3s；spec/config digest、argv、env-i、offline npm、Chromium及server/browser guards完全未改。child exit/close0、noerror/nocleanupTimeout，stdout1710bytes/stderr1070bytes；完整記錄execution-review/e2e-artifacts。

Fresh獨立Sol audit新增5個負向純測試5/5 PASS，核對12檔hash及root browser結果，三AC範圍PASS、未解本次finding0、actualunknown。另列基底已有Link事件冒泡並行請求source風險，非本次回歸，未mounted重現；pending plan-switch、error retry、逆序response仍缺browser覆蓋。33/33功能intent與typecheck既有PASS且source未改。

本輪唯一施工者未啟動任何產品修改；12檔成果保留，只追加此worklog。未commit/push/PR，沒有GraphQL重試。全745沒有fresh綠燈，不冒稱完整repo/真實環境驗收。最新完整patch、hash與重現指令保存execution-review/result.md、complete-12-files.patch、current-hashes.json與reproduce.md；recovery/midao2-node22仍da9f1fbd5cc2b373609d0956404a1c91d61a864c。

## Publication gates（2026-10-03，本輪授權發布工作分支）
使用者已明確授權：完成 ownership、適用測試與獨立審查後可 commit／正常 push rework/midao2-live-availability；覆蓋前述歷史未授權發布狀態，不包括 main、merge、deploy 或既有 Forbidden API。唯一施工者 root，原 builder 停止；fresh 獨立 publication reviewer 僅讀取。

先核對原12檔與 execution-review/current-hashes.json、handoff.tar.gz 全部吻合；保留原patch、hashes、交接包與 recovery/midao2-node22=da9f1fbd5cc2b373609d0956404a1c91d61a864c。本轮沒有修改產品、測試或runner，只有此worklog追加。

為滿足 repo D3，經標準 execution 核准執行 canonical run-checks.sh --all --typecheck：ordinary 5863 tests、5860 pass、0 fail、3 skipped，typecheck exit0。既有 live GitHub routing／Next QA RLS 與 skipped RPC suite 不代表真實環境驗證；未加入憑證或啟用任何 live lane。完整記錄 publication/ordinary-typecheck.log、full-checks.json。這是 ordinary 套件綠燈，非全repo infrastructure、CI、build/lint 或 Production 驗收。

相同產品／spec／runner hashes 延續 canonical E2E12/12、exit0／cleanup PASS與獨立負向5/5；未無故重跑瀏覽器。Fresh publication review 比較da9確認 Link冒泡與缺少response ordering既存、沒有本次新增回歸，屬需後續追蹤的中度source風險，未mounted重現。pending plan-switch、錯誤retry、逆序response及持續掛載clock rollover覆蓋仍有限；本三AC fixture與純函式驗證成立，不宣稱消除所有並行風險。

預設sandbox git ls-remote失敗：Failed to connect to proxy port 8080；同一正常HTTPS origin命令經標準核准exit0，工作分支尚不存在，未改proxy或傳輸路線。後續commit、push與remote exact SHA／blob證據由 publication/result.md保存。GitHub GraphQL read/create既有Forbidden不重試、不換接口；Draft PR、issue雙寫與後續CI仍是未完成gate。

## Aggregate 文件修正與審查續作
本輪重新核對 spec SHA256 為 fe504f49691b742148c541bd840de4bd3ae7b591ed5c39680d8a7ee8c1ff71d7，與runner固定值一致，僅同步正式工具鏈文件舊917756 digest。產品、測試與runner bytes不變；原15檔aggregate再加此文件，共16檔。完整aggregate重新交同一位獨立 /root/aggregate_review 審查，不以原12檔review代替。

原helper非標準no-isolation兩次5cancelled／exit1，以及正式run-checks的automatic approval拒絕均保留，沒有改寫PASS。本輪主對話擴充 reviewer 委派範圍（解除原 review-doc-only 委派限制，並非使用者新增安全權限）：只准原兩個helper測試透過canonical run-checks正常更新既有last-checks收據，標準核准僅重試一次；仍拒絕就停止，不换actor/runner/環境。結果與完整命令保存在aggregate-refresh evidence。

既有同bytes ordinary5860pass/0fail/3skip、typecheck、targeted33、canonicalE2E12與負向5 evidence按hash等價沿用，不重跑未變動全套。lint未執行：正式runner npm allowlist未包含lint，不編輯或繞過；依harness D3，Draft前ordinary gate已滿足，CI lint/build等仍是後續merge條件。docs checker結果只涵蓋README Phase/Sprint關鍵字，不冒稱全文件驗證。

本輪只修文件並準備正常commit/push；不建立PR或寫issue。PR後雙寫由主對話依真實App回執補齊；Refs #1882，不宣稱部署browser AC完成。gh GraphQL讀取Forbidden仍有效，未呼叫gh PR。保留全部歷史patches/hashes/handoff及recovery da9。最終review、commit與remote exact證據見 /workspace/tour-rework-20261003/aggregate-refresh/result.md。

本輪唯一正式helper重試已由標準require_escalated准許執行，exit1：realpath: /root/.hermes/toolchains/node/22.23.1: Permission denied；tp-node22 preflight failed: toolchain root is missing or unresolved。該原命令未指定既有workspace TP_NODE22_ROOT，落入預設root路徑；沒有TAP、測試未執行。這次不是auto-review拒絕，不推定產品測試失敗。last-checks紅燈保留；已用完本輪單次重試，不加env重跑、不換actor或入口。文件修正保留未提交，commit/push/publication HOLD，原a271與recovery不變。

## Workspace canonical 配置補回與正式驗證
先讀既有成功reproduce.md、runner原始TP_NODE22_ROOT選項與workspace路徑，canonical --check驗證完整官方artifact/symlink digest通過；實際v22.23.1、execPath=/workspace/tour-cloud/toolchains/node/22.23.1/bin/node。沒有讀取或修復被拒/root/.hermes。僅補回上一輪遺漏的TP_NODE22_ROOT=/workspace/tour-cloud/toolchains/node/22.23.1，非新工具鏈、持久權限或guard變更。

同一reviewer /root/aggregate_review在主對話擴充reviewer委派範圍內，對原兩helper執行一次canonical run-checks、require_escalated正常准許：tool01fd19 exit0，TAP5pass/0fail/0cancelled/0skip，wiring涵蓋7個內部情境；last-checks正常更新綠燈。完整命令/參數/輸出保存runner-restored/helper-invocation.json與helper-test-output.log。前兩次no-isolation取消、最初scope拒絕及錯誤default root失敗保持原樣，不倒改歷史。

完整16檔aggregate重新獨立核對，source/test/runner14檔hash不變，沿用ordinary5860pass/0fail/3skip、typecheck、targeted33、canonicalE2E12、negative5。正式lint仍未執行：受支援npm allowlist沒有lint，不修改/繞過；Draft依D3已具ordinary綠燈，merge仍待CI lint/build/ISR/preflight與其餘適用gate。Docs-sync為exit0且無README Phase/Sprint可比對，spec/runner/document pin另以實際hash一致確認。

目前main ea75b40fa6e2db145b79a7ecc5f3eb01fdd598db已正常fetch唯讀核對，尚無AGENT-EXECUTION/model-routing檔；沿用工作分支既有正式routing與Owner指示，單一施工者root、同reviewer獨立驗收。候選base仍455的#1886分支，不merge/reset/rebasemain。最終review與正常commit/push、remote SHA/blob核對記錄在runner-restored/result.md。PR與issue雙寫留待主對話App實際建立後處理；未gh PR調用、merge/deploy/DB/共享TEST/Production或設定變更。

## Draft PR #1887 已建立：文件里程碑
主對話已透過既有GitHub App建立並讀回Draft PR https://github.com/smallwei0301/tour-platform/pull/1887，draft=true、open。本輪App只讀再次核對一致，沒有PR/issue mutation或gh PR調用。PR建立時已核對的base為codex/tour-canonical-e2e-1882@455b2e0a38cbc970b2f35af6cab5ae5bfe13cb99；建立時head為rework/midao2-live-availability@709dd181a810e60d53caddb7f486acf2585a303b，當時16檔／3commits／+735 -40。709是建立時快照，不是本文件里程碑提交後的exact head；本次最終commit及remote證據只寫repo外pr1887-milestone/result.md，不為自指SHA再追加commit。

既有455→709完整16檔獨立審查：/root/aggregate_review，requested gpt-6.1-sol／actual unknown，PASS-in-scope、未解finding0；aggregate patch SHA256 2ce210b20c0a3476f7d1dd88167966c87dfebe1058cc77ae77922ab40c919bb2。本輪僅worklog文件delta另審，不能稱重新完成全source review。產品／測試／runner14檔hash與runner-restored manifest等價，沿用ordinary5860pass／0fail／3skip、typecheck、targeted33/33、canonicalE2E12/12、negative5/5、正式helper5/5（wiring7情境）真實證據，不重跑未變全套。

依主對話交接，CI已自動啟動，由主對話另查；本輪沒有驗證CI結論或build/ISR/preflight。Lint仍未執行，安全部署browser未驗，維持pending／merge HOLD，不以Draft或平台預覽狀態替代驗收。

Issue #1882里程碑留言MCP呼叫返回「user cancelled MCP tool call」（依主對話原始回執交接），留言未完成。停止所有issue留言寫入，不重試、不換actor/API/入口；雙寫D7仍未完成，不宣稱整體任務完成。本輪只完成repo worklog側記錄，沒有任何issue/PR寫入。純文件commit適用bash-guard文件豁免，D7是完成定義缺項而非本次文件保存的前置commit gate。

保留所有歷史取消、scope拒絕、default-root preflight失敗與後续修正；reviewer委派範圍由主對話擴充，不是使用者新增安全權限。App成功不代表gh GraphQL Forbidden恢復。維持唯一施工者root，base455／recoveryda9／patches／hashes／handoff不變；禁止force/reset/rebase/merge/deploy/DB/共享TEST/Production及憑證、網路或權限設定變更。


## 2026-10-04 policy-display 限定tooling增量（未發布）
Owner14:32批准canonical lint/build與pinned policybrowser，唯一builder policy_tooling_builder、requestedSol／actualUNKNOWN；原3148leaves tree df3281460e8fc2ab7451ff22917051b3aed94a11與13政策檔保全。施工前>300行理由於source外 tooling-increment/plan.md。未修改harness／CI clean-tree gate／舊pinnedspec或config。
CLI TDD首命令使用Node22不支援的flag失敗，不算行為RED；第二次direct canonical CLI真RED為hostile NODE_OPTIONS在新lane尚未sanitize時使npm自檢失敗。Formal run-checks GREEN7/7，擴充後contracts14/14＋typecheckPASS；後續helper小修須最終重驗。raw失敗不覆寫。
Canonical lint exit0（既有head警告1）；build exit1，production startup要求三secrets，尚未到font/compiler，不新增credentials或弱化protectedguard。新policybrowser兩輪3/3FAIL：首fixtures未mock已知GET，第二輪只剩已abort dev POST original-stack-frames，finally blocked=[]仍失敗。AC段第二輪無primaryerror附件，不把runFAIL當browserPASS；停止同error第三輪，由freshreview核對exactcandidate。child exit/close0與ownedcleanup資料另保存，不代替browserAC。
增量全rawlogs／exits／舊產物備份／manifest／patch於 `/workspace/tour-transfer/policy-display/tooling-increment`。普通full／舊12E2E／最終contracts由本輪後續外部receipt報告，未跑的不聲稱PASS。nativeEdit工具absent，wiringNOT_VERIFIED。無install／commit／push／deploy／DB／sharedTEST／Production／GitHub訊息，D5/D6/D7與release仍HOLD。

Fresh reviewer R1指出第二輪唯一devdiagnostic已正確abort而被strict blocked=[]判FAIL；父層批准窄分類整改，保留everyPOST abort與所有business/unknown/nonlocal拒絕，只精確loopback/query-free original-stack-frames已abort列為expected diagnostic。新helper與spec pins同步，負向bookingPOST／unknownPOST／remote同path／queryvariation等行為契約新增；原兩FAIL不改寫，browser須reviewer回讀corrected diff後才執行，非盲第三retry。ordinary-final5885/5882pass/0fail/3skip＋typecheckPASS；舊canonical12/12 PASS57.9s，child與完整產物保存在外部tooling-increment。
