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
