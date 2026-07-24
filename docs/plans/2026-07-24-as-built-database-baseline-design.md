# Tour Platform 現況竣工圖 Database Baseline Design v2

> 狀態：2026-07-24 owner已批准as-built baseline方向；v2納入exact HEAD `30c0b6f9` fresh SPEC／SECURITY／EXECUTABILITY review的全部blocking修正。未取得v2 fresh review PASS前不得實作或capture production。

## 1. 目標

建立一份經PostgreSQL catalog逐項驗證的`baseline v1`，供全新local、CI、staging與災難復原環境使用，同時保證existing production永遠不會套用baseline。

這是「依目前房屋實測繪製竣工圖」，不是拆除或重建production。

## 2. 已批准、不再重開的決策

1. **主線**：現況竣工圖baseline；不再要求134支forward migrations從空DB完整重播。
2. **凍結集合**：production cutoff對應的128支pre-cutoff forward migration以完整filename＋SHA-256凍結；D3b stash內8支frozen修改不得恢復或提交。6支Midao與未來新增migration屬post-cutoff，不在這128支集合，不會因集合外合法多檔而誤FAIL。
3. **Reference**：active Supabase production project `pyoderxmpeyqjwkeliiu`；production只允許唯讀metadata，不讀business rows，不執行DDL/DML。
4. **Managed-schema邊界**：逐物件ownership；Supabase擁有`auth/storage`內部物件，App自有跨schema policy／trigger／grant由overlay管理，unknown ownership一律HOLD。
5. **Cutoff**：baseline v1代表2026-07-24 capture時production狀態；6支`2026072300*` Midao migrations全部屬post-cutoff。
6. **Fresh history**：exact history set只能是單一`baseline_v1` synthetic marker＋6支Midao與未來post-cutoff migrations；不偽造128筆cutoff舊history，也不建立獨立overlay history row。
7. **Ledger gate**：PR/source gate與production release/verified gate分離，且必須接到實際workflow／preflight callers。
8. **版本契約**：Supabase CLI `2.87.2`、PostgreSQL server/client major `17`；所有實際binaries與container images另以content digest鎖定。升級需重新capture、render、compare與review。
9. **並行UI**：只做不依賴未確認column／payload的shell、loading、empty、error與view-model skeleton。

## 3. 已取得的唯讀證據

- Repo inventory：134支forward migrations、53支rollback migrations；forward exact partition為128支pre-cutoff frozen＋6支Midao post-cutoff。
- Production `public`：73張ordinary tables，73/73啟用RLS，114條policies。
- `midao_availability_defaults`、`midao_day_overrides`、`midao_requests`啟用RLS但無policy，一般角色預設全拒絕。
- 59張tables對`authenticated`仍有廣泛底層write grants。RLS仍是資料列閘門，因此不等於已證實越權；但此狀態違反「App writes走service role」目標，必須以machine-readable known security drift保存，不得用exclusion隱藏或稱為security PASS。
- 6支Midao foundation effects均未在production生效：3張foundation tables、atomic RPC及`guide_profiles.backend_mode`／`guide_session_version`不存在；欄位probe回SQLSTATE `42703`。
- Supabase CLI 2.87.2 plain schema dump於570秒後exit `124`，partial SQL缺complete marker且函式／enum斷裂；已刪除，不得作baseline來源。

## 4. 非目標

- 不把production data、PII、password hash、token、connection string、storage objects或sequence current values匯入repo。
- 不修改任何既有migration。
- 不對production套用baseline、Midao migrations或security remediation。
- 不讓普通`supabase db reset`／`db push`自行猜lane。
- 不把catalog equivalence當成security approval。
- 不在本設計內升級Supabase CLI／PostgreSQL。

## 5. 兩個catalog truth artifacts

Cutoff與terminal不能共用同一artifact：

### 5.1 `catalog.cutoff.normalized.json`

- 來源：production唯讀capture。
- 語意：目前production竣工狀態，尚未包含6支Midao post-cutoff effects。
- 用途：生成／驗證baseline v1與existing rehearsal起始狀態。

### 5.2 `catalog.expected-terminal.normalized.json`

- 來源：在pinned self-owned local stack上，以已review的cutoff baseline＋digest-checked 6支post-cutoff migrations materialize，重新extract、人工review後atomic發布。
- 語意：fresh與existing兩lane完成post-cutoff後共同的不可變右側真相。
- Fresh terminal與existing terminal必須**各自獨立**對此artifact exact compare；另保留fresh↔existing等價檢查，不能只讓兩個可能同錯的lane互比。

兩份artifact各自有digest，manifest不可混用。

## 6. Lane A：existing production

```text
live catalog + live migration history
→ verify existing-lane identity and cutoff manifest
→ select strictly post-cutoff additive migrations
→ owner-authorized apply exactly once
→ recapture terminal catalog
→ exact compare expected-terminal
→ update production ledger verified
```

- Baseline SQL永遠不出現在ordinary production migration discovery path。
- Existing runner看到`baseline_v1` marker即FAIL。
- Empty DB執行existing lane即FAIL。
- 未取得production apply明確授權時，流程停在唯讀preflight。

## 7. Lane B：fresh install

```text
pinned Supabase platform bootstrap
→ materialize one synthetic baseline_v1 migration
   [baseline.sql bytes + exact boundary + managed-overlays.sql bytes]
→ six Midao post-cutoff migrations
→ later post-cutoff migrations
→ deterministic non-secret seed
→ extract terminal catalog
→ exact compare expected-terminal
```

- `baseline.sql`與`managed-overlays.sql`是兩個可review artifacts，但materializer必須按固定順序組成**同一支**synthetic `baseline_v1` migration。
- Exact history set assertion拒絕獨立overlay marker、第二支synthetic migration、128筆fake cutoff history或任何未在manifest的row。
- Fresh runner偵測occupied application schema即FAIL。
- Future fresh環境仍走lane-aware runner；普通全歷史reset不是受支持入口。

## 8. Supply-chain與toolchain lock

在任何production credential取得前，先建立並review：

```text
supabase/baselines/v1/toolchain-lock.json
```

至少固定：

- Supabase CLI absolute realpath、version、SHA-256、uid/gid、mode、nlink；
- 執行`psql`、`pg_dump`、`pg_restore`的PG17 toolchain container repo digest／image ID；
- container內三個binary absolute path、exact version；
- local Supabase所有service images的immutable repo digest／image ID；
- expected architecture；
- lock schema version。

禁止ambient PATH client或mutable tag。每次child前重新驗binary／container identity；local stack啟動後read-back實際container image ID。若image缺失，先以registry metadata將每個required tag解析成immutable `repository@sha256:digest`並發布`toolchain-supply-request.json`，列出architecture、local-present及estimated bytes；向owner展示完整digest清單與下載量。只有owner批准後，acquirer才可依request逐項執行digest-qualified pull；禁止tag、額外image或request drift。下載後重新read-back image ID／architecture／PG17 binary paths/version，再生成toolchain lock；未批准或任一identity不符即HOLD。

## 9. Production credential與唯讀邊界

1. 固定CLI binary先通過toolchain lock。
2. `supabase db dump --linked --dry-run` stdout只經bounded pipe進父程序memory buffer；禁止named temp pathname。限制最大bytes、timeout與exact output shape；解析後覆寫Buffer，child退出後刪除env reference。
3. Credential只能短暫存在父程序memory與受控child env；不得進argv、log、manifest、evidence或repo。
4. Remote `psql`固定：
   - runner-owned empty `HOME`；
   - strict child-env allowlist，清除所有ambient `PG*`／`DATABASE_URL`／service variables；
   - `psql -X --set=ON_ERROR_STOP=1`；
   - `PGOPTIONS='-c default_transaction_read_only=on'`，從連線建立即read-only；
   - reviewed SQL內再執行`BEGIN READ ONLY`並read-back `transaction_read_only=on`；
   - 禁止caller-supplied SQL。
5. Remote `pg_dump`同樣使用strict env、empty HOME與`PGOPTIONS` read-only；只允許schema-only custom archive。
6. Hostile `.psqlrc`、`PGOPTIONS`、`PGSERVICE*`、`PGPASSFILE`、`DATABASE_URL`、PATH replacement與dry-run injection均須先有RED tests。
7. SIGKILL無法保證process memory抹除，因此文件不宣稱物理secure erase；安全目標是「不落盤、最短生命週期、無輸出／artifact殘留」。

## 10. Capture、TOC與render

```text
production read-only custom archive A/B
→ pg_restore --list
→ normalized TOC
→ catalog extractor
→ complete ownership classification
→ selected use-list + dependency closure
→ pg_restore --restrict-key=<same in-memory session key> --use-list
→ exact framing parser removes only generated psql \restrict/\unrestrict envelope
→ baseline.sql / managed-overlays.sql
→ artifact publisher
```

規則：

- Raw custom archives只在runner-owned temporary storage，mode/identity受控，不提交repo；發布成功及digest read-back後刪除。
- A/B orchestrator同一程序產生一個不可預測restrict key，只存memory，兩次render用同一key；key不得進manifest/log。
- 不以regex或line filter裁切SQL statement。唯一允許的轉換是exact byte-boundary parser驗證並移除PG17生成的首尾`\restrict <same-key>`／`\unrestrict <same-key>` framing；內部SQL bytes與digest必須不變。
- A/B必須在normalized catalog、normalized TOC、selected use-list、TOC ownership map、baseline SQL與overlay SQL全部byte-identical；custom archive binary本身不要求相同。
- 每個TOC entry exactly once分類，dependency closure完整；missing／extra／unknown／duplicate均FAIL。
- Published SQL零COPY、零business INSERT、零credential pattern並通過pinned local syntax/materialization preflight。

## 11. Versioned artifacts

```text
supabase/baselines/v1/
  baseline.sql
  managed-overlays.sql
  capture-manifest.json
  manifest.json
  toolchain-supply-request.json
  toolchain-lock.json
  catalog.cutoff.normalized.json
  catalog.expected-terminal.normalized.json
  toc.normalized.json
  use-list.txt
  toc-ownership-map.json
  dependency-closure.json
  role-map.json
  ownership-boundary.json
  exclusions.json
  platform-prerequisites.json
  frozen-migrations.sha256
  security-drift.json
  catalog-cutoff.sha256
  catalog-expected-terminal.sha256
```

`capture-manifest.json`只封存production cutoff capture／TOC／ownership／rendered SQL／security drift provenance；它不能宣告fresh terminal完成。`manifest.json`在expected-terminal發布後才建立，引用capture-manifest digest並封存兩個catalog truths、exact history與lane contract。

跨`supabase/baselines/v1`與`docs/operations`的多檔發布不宣稱單一POSIX syscall可提供瞬時全域atomic snapshot。可執行契約是transaction-aware publication：每個target以同目錄exclusive temp＋fsync/read-back＋rename原子替換；`capture-manifest.json`倒數第二、ledger最後發布，兩者必須持有同一`transactionId`，ledger是唯一commit marker。

兩者共享的`payloadDigests`是固定13-path canonical map，只允許：`baseline.sql`、`managed-overlays.sql`、`catalog.cutoff.normalized.json`、`toc.normalized.json`、`use-list.txt`、`toc-ownership-map.json`、`dependency-closure.json`、`role-map.json`、`ownership-boundary.json`、`exclusions.json`、`platform-prerequisites.json`、`security-drift.json`、`catalog-cutoff.sha256`；明確排除`capture-manifest.json`與`docs/operations/baseline-ledger.json`，missing／extra path均FAIL。Ledger另含`captureManifestSha256`；manifest不得自含digest，ledger不得含self-digest，避免self／mutual recursion。

Publisher先取得linked-worktree exact singleton lock，再檢查／recover journal。Lock與journal paths由固定`git rev-parse --git-path` namespace導出，exclusive、no-follow、0600、current-owner、nlink1及FD/path identity均須驗證。首次mutation前，所有pre-existing targets先建立同目錄identity-bound durable rollback copies；所有temps、rollback copies、journal file及其parent directory均fsync。Journal只允許`PREPARED → PROMOTING → COMMITTED → CLEANED`，每次state與每次rename後都fsync file及containing directory，ledger rename後再次fsync ledger parent。Recovery在每個rename／fsync boundary必須idempotent：只有磁碟上ledger exact匹配transactionId、`captureManifestSha256`及13-path `payloadDigests`才視為`COMMITTED`並清理identity-matched leftovers；任何其他state一律依journal記錄的prepared／pre-existing identity回滾，foreign replacement則HOLD且不得刪除。

所有Task 8及後續讀取baseline artifacts的scripts、acceptance tests與materializers，在讀任何payload前都必須呼叫transaction verifier；verifier拒絕manifest／ledger transaction不一致、13-path集合不完整、unfinished journal或identity/digest mismatch。不經此gate的普通讀者不構成本契約下的有效consumer。

`manifest.json`至少包含：

- schema／extractor／normalizer／publisher versions；
- source project ref與capture timestamps；
- cutoff identity；
- exact 128 pre-cutoff frozen filenames＋digests；
- exact post-cutoff filenames／versions／digests／order；
- toolchain lock digest與全部artifact digests，明確包含normalized TOC、selected use-list、TOC ownership map及`dependency-closure.json`；
- `dependency-closure.json`逐selected TOC entry列出direct/transitive dependencies、render destination、A/B digest與missing/extra/unknown/duplicate結果；
- one synthetic baseline marker identity；
- expected exact fresh history set；
- lane prohibitions；
- `catalog_equivalent=true|false`；
- `security_policy_status=known_drift|approved`。

不得包含connection string、password、service key、restrict key或raw command output。

## 12. Ownership lifecycle

在production capture前只能建立：validator、JSON schemas、empty templates與fixtures；不得假裝已知完整object inventory。

Capture A/B後才生成actual：

- `ownership-boundary.json`
- `role-map.json`
- `exclusions.json`
- `platform-prerequisites.json`
- `toc-ownership-map.json`

每個object唯一分類：

- `application`
- `platform`
- `application_overlay`
- `extension`
- `excluded_environmental`

重疊、missing、unknown或沒有owner批准理由的exclusion全部FAIL。

## 13. Catalog comparison contract

比較：schemas、relations、columns、types、constraints、indexes、functions/procedures exact identity與body digest、triggers、RLS enabled/forced、policies、ACL、owners、default privileges、extensions、publication membership及App-owned managed-schema overlays。

排除：OID、object address、statistics、row counts、sequence current values、timestamps與runtime state。

任一section缺失、duplicate canonical key、extractor version mismatch或unexpected diff即FAIL。

## 14. Known security drift

- `security-drift.json`必須與cutoff catalog digest綁定，列出完整59-table ACL集合、grantee、privilege及RLS分離說明。
- Drift artifact與security-policy gate在baseline首次發布交易內完成，不能延後到「baseline已看似PASS」之後。
- Catalog equivalence PASS不等於security PASS；manifest必須保留`security_policy_status=known_drift`。
- Fresh重現production ACL只能稱「catalog equivalent with known drift」。
- 若owner批准修復，另新增post-cutoff additive migration與獨立review／production apply流程；不得修改baseline或歷史檔。

## 15. Local-only runner identity

Fresh、expected-terminal builder與existing rehearsal都必須內部使用D3a self-owned local Supabase wrapper：

- 連線host只能是literal loopback；
- port、database、project ID、container IDs、labels、volumes與image IDs全部由owned stack capture並在每次apply前read-back；
- 明確拒絕project ref `pyoderxmpeyqjwkeliiu`、`--linked`、remote URL、ambient `DATABASE_URL`與任何外來PG env；
- runner不接受caller DB URL；
- identity drift時不apply、不cleanup foreign resource。

Existing rehearsal先以fixture-builder建立local cutoff-shaped occupied DB，再啟動existing upgrade runner；「baseline execution count=0」只計upgrade runner階段，fixture prep不得冒充production apply。

## 16. Ledger與callers

- `docs/operations/migration-ledger.json`：production apply事實。
- `docs/operations/baseline-ledger.json`：capture／publication provenance，不冒充production apply。
- PR與local preflight明確呼叫source gate。
- Scheduled/manual drift或post-apply release流程明確呼叫verified gate。
- `.github/workflows/migration-drift-detect.yml`與`scripts/preflight-check.sh`必須實際接線；CI path filters包含baseline scripts/manifests/tests。
- Supabase history、production ledger與baseline ledger不可互相替代。

## 17. Evidence與TDD規則

- 每個behavior先有真RED：exact command、預期assertion failure，不接受missing path、syntax error或0 tests。
- GREEN後先`git add -- <該Task exact files>`，再跑staged verifier。
- 每個含staged tests的commit至少有一個ordinary evidence entry覆蓋所有staged tests；heavy entries只能追加，不能取代ordinary entry。
- Regression/final suite與commit staged evidence分開陳述，禁止拿大量已commit tests冒充staged test coverage。
- Package全域heavy allowlist同步只增加兩個完整literal Node prefixes，含唯一允許`--test`與exact path；拒絕其他flags/env/path。

## 18. 最低驗收矩陣

1. Exact 128 pre-cutoff frozen filenames/digests：missing/drift FAIL，6支Midao與合法future post-cutoff extra files交source gate。
2. Toolchain binaries與all service images digest／identity PASS。
3. Hostile rc/env/credential tests PASS；production capture不落credential檔。
4. A/B normalized catalog／TOC／use-list／ownership map／rendered SQL byte-identical。
5. TOC entry exactly once分類與dependency closure PASS。
6. Single synthetic baseline marker；overlay額外history row FAIL。
7. Empty fresh成功；occupied→fresh、empty→existing、baseline marker→existing全部FAIL。
8. Expected-terminal artifact經review發布。
9. Fresh與existing各自exact compare expected-terminal，另彼此等價。
10. Existing upgrade runner baseline execution count=0且local-only identity PASS。
11. ACL／RLS／function exact identity／trigger／constraint／extension逐項比較。
12. Known drift artifact與security status分離PASS。
13. PR source caller與release verified caller hostile tests PASS。
14. D3 schema／rollback／concurrency/idempotency與真Playwright PASS。
15. Cleanup identity、timeout、signal、partial publish與secret scan hostile tests PASS。

## 19. 完成定義

Baseline v1只有在以下全部成立時才完成：

- v2 spec與implementation plan fresh SPEC／SECURITY／EXECUTABILITY review均PASS、blocking 0；
- authoritative production catalog唯讀capture成功；
- versioned artifacts與digests完整；
- fresh／existing exact comparison與lane-confusion tests PASS；
- source／release gates實際接線；
- artifacts無business rows／credentials；
- 128 pre-cutoff frozen migrations無byte drift；
- known security drift沒有被隱藏或稱為security PASS；
- 未經另行授權沒有production schema mutation。
