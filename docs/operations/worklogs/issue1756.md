# issue1756 — Midao runtime foundation and responsive shell
> 最後更新：2026-07-24 16:05 CST｜負責 session：Canary／2026-07-24

## 目標
建立Midao runtime foundation、responsive shell與catalog-verified as-built database baseline。既有production只走post-cutoff additive migrations；fresh環境走platform→baseline→post-cutoff→seed→catalog exact comparison。所有backend/data變更採strict TDD、staged evidence與local Postgres／Playwright真實驗證。

## 執行錨點
- Issue：https://github.com/smallwei0301/tour-platform/issues/1756
- Branch：`feat/midao-foundation-1756`
- Worktree：`/root/.hermes/worktrees/tour-platform/midao-foundation-1756`
- Base：`origin/main af3963cb48afdf246035bbf746694c7de18cc2ed`
- Reviewed plan anchor：`bcb81b119228dc81fecff7a212fff4017c4a1584`（原package plan）
- Package plan：`docs/plans/2026-07-22-midao-package-01-foundation-shell.md`
- Baseline design：`docs/plans/2026-07-24-as-built-database-baseline-design.md`
- Baseline implementation：`docs/plans/2026-07-24-as-built-database-baseline-implementation.md`

## AC 清單
- [ ] 128支pre-cutoff migration bytes凍結且6支Midao只屬post-cutoff；baseline v1兩次production唯讀capture一致且無data／secret。
- [ ] Fresh platform→baseline marker→6支post-cutoff→seed成功；existing rehearsal不執行baseline，terminal catalogs exact equivalent。
- [ ] 五個additive foundation objects與atomic RPC以RED → minimal GREEN完成，catalog／ACL／RLS runtime PASS。
- [ ] Durable idempotency、atomic mode switch、audit/outbox與exact RPC ACL/RLS contracts通過。
- [ ] Canonical guide guard、signed impersonation actor、login/logout cookie cleanup與safe redirect contracts通過。
- [ ] `/midao`五route responsive shell與Brand Book tokens完成。
- [ ] Midao＋legacy Playwright真browser gates、focused/full suite、lint、typecheck、build全部有fresh evidence。
- [x] Fresh executable-plan spec與quality/security reviews雙PASS（anchor `bcb81b11`）。

## 已完成（附證據）
- 2026-07-23 建立isolated implementation worktree；branch/base/plan anchor驗證且初始worktree clean。
- 2026-07-23 A1首次tracked `npm install --ignore-scripts`完成368 packages，但npm 11.9.0刪除一筆nested optional-peer lock entry，lock SHA drift gate正確FAIL；未沿用成PASS、未執行`npm audit fix`。
- 2026-07-23 owner原文「用推薦方案」核准改採deterministic `npm ci --ignore-scripts`；已restore original `package-lock.json`。
- 2026-07-23 第一輪focused correction review雙FAIL/HOLD：executable block漏SHA/TypeScript、過期umbrella next-action、npm exec Supabase postinstall seam、hostile npm/PATH/npmrc與舊node_modules/dirty-state隔離不足。
- 2026-07-23 從既有verified 2.87.2 cache供應固定standalone Supabase artifact：`/root/.hermes/toolchains/supabase/2.87.2/supabase`；read-back version `2.87.2`、SHA-256 `e325dd50b274e88fd1416f93b9e063902827ae326d356ab7f9dc604c3eba5c59`、mode `0755` regular root-owned、96,334,008 bytes。未下載floating CLI。
- 2026-07-23 第二輪focused correction review雙FAIL/HOLD：A1分開blocks且缺fail-fast，前置/install/postflight失敗可能被最後成功命令掩蓋；npm 11.9.0拒絕user/global config同指向`/dev/null`。已合併為單一`set -euo pipefail` block，temp HOME內建立兩個不同0600空npmrc，final clean-state為最後一項gate。
- 2026-07-23 第三輪local-only focused SPEC與QUALITY/SECURITY/EXECUTABILITY reviewers雙PASS，blocking 0（anchor `43975818`）；`bash -n`、fail injection/trap、npm 11 distinct config、linked-worktree cache、SHA/sentinel/TypeScript/fixed Supabase gates皆重驗通過。
- 2026-07-23 第一次exact A1 `npm ci` runtime完成661 packages後仍exit 1：package/package-lock未變、sentinel absent、TypeScript與Supabase PASS，唯一drift為npm 11 Arborist重寫`yarn.lock` 205 additions/12 deletions（diff SHA-256 `4e12b9d08811e8a1308ad025ac795650d95b52e0ff45749472f2170dcdcf23d1`）。npm source證實會load/save既有Yarn lock；已restore original SHA `b05a422f35e6d76e4e8b8a6f24ca712373bd513c43317482a607c1bf9039814e`，worktree clean，A1仍未PASS。
- 2026-07-23 v4 focused review雙FAIL/HOLD：`test A && test B`受Bash errexit例外可讓unexpected Yarn regular file被覆寫後假綠；cleanup restore失敗仍刪temp HOME會遺失唯一backup。v5拆分simple tests，使用`mv -fT`，且backup仍存在時保留temp HOME並非0退出。Scratch probes：normal failure、unexpected regular皆rc1且original restored；unexpected directory rc1且backup preserved。
- 2026-07-23 v5 focused SPEC PASS、QUALITY/SECURITY/EXECUTABILITY FAIL/HOLD：另有executable/mode/npmrc `&&` lists可受errexit例外假綠，且`test -z "$(git status ...)"`可吞git command failure。v6將A1所有`&&`清零，各gate獨立simple command；git status先以assignment capture（保留command exit）再驗空。
- 2026-07-23 v6 fresh focused SPEC與QUALITY/SECURITY/EXECUTABILITY reviewers雙PASS，blocking 0（anchor `ff3cec9b`）。Adversarial injections涵蓋executable/npmrc symlink、writable mode、git status fail/dirty、npm exit 42、Yarn regular/symlink/directory及restore failure，全部nonzero且無資料遺失；`bash -n`／diff check／clean PASS。
- 2026-07-23 exact reviewed A1 runtime在tracked process `proc_61f1911da71b` exit 0：Node `22.23.1`、npm `11.9.0`、`npm ci`完成661 packages；package-lock SHA `dccba04bc6aacc67936f437c79f2b18a30b285b2cc898acffcf15566a4142cbf`、Yarn SHA `b05a422f35e6d76e4e8b8a6f24ca712373bd513c43317482a607c1bf9039814e`、Supabase `2.87.2`，final status clean。A1 PASS。
- 2026-07-23 A2 exact Node22 auth/flag/impersonation baseline四檔exit 0：`# tests 38`、pass 38、fail 0、skipped 0、duration 1612.64ms。
- 2026-07-23 A3 staged evidence verifier完成strict TDD與多輪adversarial remediation；final HEAD `14901eac133c2a0c0d76f5f4e3c6b6d31b9b0f5e`。Final Node22 focused suite `36/36 PASS`、frozen targeted child＋`tsc --noEmit` exit 0、`--check-only` PASS；evidence tree `8409b5c735b4adefa73e91f9f833bb4725878f97`、linked-worktree manifest mode `0600`、secret read-back PASS。
- A3 final contracts涵蓋exact ordinary targeted/`--typecheck`/`--all` semantics、truthful npm-test coverage、三個bounded heavy prefixes、tree/path/status/blob與docs metadata snapshots、exact schema、0600、Node22、spawn error/signal、no child-output replay、credential/ambient-secret rejection。`npm test` coverage只承認shell實際選取的非hidden `apps/web/tests/<一層>/*.test.mjs`；root/deep/E2E/hidden tests需targeted或heavy entry補齊union。
- A3 final fresh SPEC/AC與QUALITY/SECURITY/EXECUTABILITY reviewers皆PASS，綁定同一HEAD `14901eac`，blocking 0；frozen `.claude/hooks/run-checks.sh`未修改。
- 2026-07-23 A4 prerequisite probe以Node `22.23.1`／npm `11.9.0`、isolated HOME實跑，當`npm_config_userconfig`與`npm_config_globalconfig`同指`/dev/null`時exit 1：npm在config resolution前拒絕double-loading。同一路徑plan seam不可執行；已修micro/master為runner-owned兩個不同0600 empty npmrc，A4實作暫HOLD至focused correction雙PASS。
- A4 correction首輪fresh focused SPEC與QUALITY/SECURITY reviewers皆FAIL：worklog scope stale、tests未鎖all-outcome cleanup；hostile umask可讓`open(...,0600)`實際mode000，且缺FD/path identity、partial setup／cleanup failure與success evidence sequencing。v2 contract加入exclusive FD create、`fchmod/fstat/lstat` dev/inode readback、restrictive umask與replacement probes、`mkdtemp`後立即try/finally、cleanup failure nonzero及cleanup成功後才atomic發布evidence。
- A4 correction v2 focused SPEC PASS；QUALITY/SECURITY仍FAIL一項：hostile umask也會讓`mkdtemp` HOME mode000，cache同樣缺exact mode readback，setup fail-closed可能被誤算probe通過。v3要求HOME/cache皆透過directory FD `fchmod/fstat`＋path `lstat` same dev/inode達exact0700，restrictive-umask case必須完成全setup並讓strict local npm11 no-network probe成功。
- A4 correction v3 focused SPEC PASS；QUALITY/SECURITY以non-root probe證實umask0777產生的mode000 HOME無法先open directory FD（EACCES）。v4在`mkdtemp`前暫設umask0077並於成功／失敗都恢復原值；若HOME已建立，restore/setup任何失敗仍進cleanup；hostile0777測試須驗原umask恢復且完整npm11 probe成功。
- A4 correction v4 focused SPEC PASS；QUALITY/SECURITY證實恢復hostile umask後才mkdir cache仍會產生mode000／EACCES。v5讓umask0077涵蓋全部純同步HOME/cache/npmrc setup與FD/path驗證，禁止期間await/spawn；每個成功／失敗點均先恢復原umask，再進child或外層cleanup。
- A4 executable correction v5 final fresh focused SPEC與QUALITY/SECURITY/EXECUTABILITY reviewers雙PASS，綁定`633083083830e6260d5235bddcbe37d9b6f500e0`，blocking 0。Reviewer以UID65534 hostile umask0777等價probe驗HOME/cache0700、兩npmrc0600、原umask恢復、strict isolated local npm `11.9.0` exit0且temp HOME已清除。
- 2026-07-23 A4 secret-safe CI command evidence runner完成strict TDD與多輪adversarial remediation；final implementation HEAD `3c0365c81a3060530dca855e40ead84044fbe110`。Final Node22 focused suite `25/25 PASS`、frozen targeted child＋`tsc --noEmit` exit0、`--check-only` PASS；evidence tree `1f7273fe6f5680e5fde6eff8d46d1fb17e9907bd`、linked-worktree manifest mode `0600`。
- A4 final contracts涵蓋exact lint/typecheck/build modes、validated Node22/npm11.9.0、strict reconstructed env、build secrets只存在child env、per-stream fragment/oversize redaction、repo dotenv/npmrc guards、hostile umask下HOME/cache0700與npmrc0600 FD/path identity、完整primary-first cleanup、clean HEAD/tree pre/postflight，以及cleanup成功後才發布0600 atomic evidence。
- A4 final fresh SPEC/AC與QUALITY/SECURITY/EXECUTABILITY reviewers皆PASS，綁定同一HEAD `3c0365c8`，blocking 0；獨立重現post-rename＋rm failure＋lstat EIO攻擊，確認unlink fallback執行、target不存在且PRIMARY／SECONDARY／TERTIARY errors保留。
- 2026-07-23 Phase B Task B1 backend_mode additive migration完成strict TDD：missing migration RED `4/4 fail`；GREEN／exact staged evidence `4/4 PASS`、`--check-only` PASS，tree `0ad47d0a16303a392388bef3ec25905a19b655c8`、manifest mode `0600`。Implementation `7878e9fb22ec4fc9283065699d781eda015b894b`；fresh focused SPEC／SQL QUALITY review PASS，blocking 0。Migration只新增legacy-default欄位、named value constraint、mode index與comment，不修改session version或既有migration。
- 2026-07-23 Phase B Task B2 notification outbox migration完成strict TDD及三輪security test remediation；final HEAD `1078f5c4fe93989b0eaa3f26d355f1d4e6bd9b57`。Final focused suite `2/2 PASS`、exact staged `--check-only` PASS，tree `475b65374dbc8d485a3ae1d3a14b63a0c4e8574c`、manifest mode `0600`；fresh SPEC／SQL QUALITY／SECURITY review PASS，blocking 0。
- B2 exact source contract與28個具名mutation／hostile cases鎖定完整欄位type/null/default、status/attempt constraints、stable claim index `(status,next_attempt_at,created_at,id)`及partial predicate、ENABLE/FORCE RLS、零policy、exact revoke＋service-role DML ACL，以及payload禁止完整PII/payment secrets。Trailing DISABLE／NO FORCE與comment-prefixed hidden GRANT皆實測拒絕。
- 2026-07-23 Phase B Task B3 durable idempotency migration完成strict TDD與SQL tokenizer remediation；final HEAD `acd58f618abcd06285b9dd4b12f3e2271e5abad5`。Final focused suite `3/3 PASS`、exact staged `--check-only` PASS，tree `51ae364bdeec463ccd3c4fb6d76654716a6f7e56`、manifest mode `0600`；fresh SPEC／SQL QUALITY／SECURITY review PASS，blocking 0。
- B3 schema鎖定actor/command/guide-scope key、SHA-256 request hash、processing/completed response invariant、scope-aware uniqueness、expiry/stale-processing indexes、exact RLS/ACL與去敏snapshot comments；不同guide可重用key，processing replay必須wait/retry且不得讀placeholder。Source test的PostgreSQL-aware lexer正確處理single/double/dollar quotes、nested comments及normal-state separators，quoted comment marker後active grant與comment-only必要clause均實測拒絕。
- 2026-07-23 Phase B Task B4 transactional audit migration完成strict TDD與source-contract remediation；final HEAD `80903a715b9deaf7db8e30cf98e37ecee72c43b1`。Final focused suite `2/2 PASS`、exact staged `--check-only` PASS，tree `d5759ee1b6dd18181e4acd39f3aa22871175e813`、manifest mode `0600`；fresh SPEC／SQL QUALITY review PASS，blocking 0。
- B4建立專用append-only `midao_audit_events`，含actor/guide/action/resource/request/reason/metadata/timestamp、兩組stable indexes、ENABLE/FORCE RLS、零policy及service-role-only SELECT/INSERT；不委託`audit_logs`。Shared SQL lexer補上E-string backslash semantics，八句top-level exact allowlist拒絕extra GRANT與DO/dynamic inverse RLS。
- 2026-07-23 Phase C Task C1 shared guide-session crypto完成strict TDD；final HEAD `e2fd257d5e487b0785bd9083e8f44a83df61501a`。Missing module RED時existing guide-auth `14 PASS`；final focused compatibility `28/28 PASS`、staged integration `6/6 PASS`、typecheck與`--check-only` PASS，tree `48a3d3530374aa19a554a7166417624aa1d4bfee`、manifest mode `0600`；fresh SPEC／security／legacy compatibility review PASS，blocking 0。
- C1精確保持guide HMAC bytes `${guideId}:${sessionVersion}`與三段cookie token，抽離production/build/dev secret lifecycle且不export raw secret；新增domain＋NUL＋UTF-8 payload byteLength framing供impersonation actor，guide與actor signature不可跨protocol驗證。
- 2026-07-23 Phase C Task C2 signed session version完成strict TDD；final HEAD `73977a6efbf990c1c7f76af6af8095311c61edd6`。Valid version=7的RED為`undefined !== 7`且tamper path原已GREEN；final focused regressions `20/20 PASS`、typecheck與`--check-only` PASS，tree `5bfd010b5d07b537222c5771d521f8094d05deed`、manifest mode `0600`；fresh SPEC／security review PASS，blocking 0。
- C2只在guide ID、三段token、number parse及HMAC驗證全部成功後暴露`sessionVersion`，version/signature tamper回`null`，token格式與既有API保持相容。
- 2026-07-23 Phase C Task C3 Midao kill switches完成strict TDD；final HEAD `769879fa877bfe59cd2c25a14223c59cf8d49410`。Exports missing RED `3/3 fail`；final focused `3/3 PASS`、`--check-only` PASS，tree `b703eb646e7dd4e6975704ffbb5b084e1cd7ba03`、manifest mode `0600`；fresh SPEC／quality review PASS，blocking 0。
- C3新增server-only backend、mutations、mode-switch三個default-off independent readers，完全沿用既有`1|true|yes|on` truthy contract；C3只暴露gates，directional enforcement按計畫留在D2 production boundary。
- 2026-07-23 Phase C Task C4 signed impersonation actor codec/cookie完成strict TDD與兩項security remediation；final HEAD `427ab312858161829042a38c0c864d7eead75f85`。Final actor＋shared crypto `13/13 PASS`、typecheck與`--check-only` PASS，tree `6092642328c602bad114d21ebe71399ac6528f33`、manifest mode `0600`；fresh final SPEC／security／cookie review PASS，blocking 0。
- C4固定`midao_impersonation_actor` host-only HttpOnly SameSite=Lax cookie，production Secure；payload只允許exact六鍵且無token，target/tamper/future/expiry/cross-protocol皆fail closed。Issued/expiry正規化至epoch-second，同組signed timestamps驅動Max-Age/Expires並clamp至guide-session expiry；clear helper同scope＋Max-Age=0＋past Expires。
- 2026-07-23 Phase C Task C4A admin impersonation route canonical actor完成strict TDD；final HEAD `ff77d9ccedabac9d8f5ceeb60f3a733a4b59b0cb`。Route＋existing admin＋actor regressions `26/26 PASS`、typecheck與`--check-only` PASS，tree `fd83e808c69c6218bcc44ccc8ed8666f89e4c095`、manifest mode `0600`；首次review timeout為INCONCLUSIVE，窄化純static re-review PASS，blocking 0。
- C4A actor email只取`pickAdminCredentials(request).email`後trim/lower，缺少即401；禁止body actor/token。Signed actor target取DB `guide.id`，guide session version/display name保持DB canonical；既有admin middleware/CSRF、UUID/config preflight、approved gate與visible banner均不弱化。
- 2026-07-23 Phase C Task C4B ordinary login/logout clears impersonation完成strict TDD；final HEAD `0419e4345e1c9c6ef9679c5a5497788483b6d645`。Focused `14/14 PASS`、typecheck與`--check-only` PASS，tree `bd87139d02a643ff4211ba9f59ac9da33638fcfa`、manifest mode `0600`；fresh flow／security review PASS，blocking 0。
- C4B單一helper同時清signed actor與visible banner；invite、email/password、legacy guideId三條成功登入在新session headers後清除，DELETE成功在guide/CSRF clear後清除。所有CSRF、credential、suspension、timeout/error paths不誤清。
- 2026-07-23 Phase C Task C5 canonical guide runtime access gateway完成strict TDD；final HEAD `ab7d7147dac1594818e53a93b39dd7873e780b14`。C5 focused `6/6 PASS`、combined session/actor `15/15 PASS`、typecheck與`--check-only` PASS，tree `e38bd1cfa0b72ce80c11cc2bc507aa07cce7de89`、manifest mode `0600`；fresh DB/session/security review PASS，blocking 0。
- C5 exact DB projection只讀id/display_name/backend_mode/version/status；canonical guard固定HMAC→identity/version→approved→backend flag→mode→impersonation，forged actor不降級，context name/version/mode只取DB。非阻擋hardening：日後分開DB error/not-found並拒絕malformed/null canonical row。
- 2026-07-23 Phase C Task C6 Midao V2 query/command wrappers完成strict TDD；final HEAD `d8069c57b596555ea881d4b8bc0f6857cabe2fec`。Focused `6/6 PASS`、typecheck與`--check-only` PASS，tree `d85d6192400430daaa6a02ea4c42d7f3ac22f690`、manifest mode `0600`；fresh boundary/idempotency/security review PASS，blocking 0。
- C6 query固定canonical guard→handler；command固定guard→CSRF V2化→mutation gate→strict printable-ASCII 1–128-byte key→canonical JSON SHA-256→handler。Context只含canonical DB/session actor與server request metadata；known errors V2 deterministic，unexpected sanitized並上報。
- 2026-07-23 Phase D Task D1 atomic backend-mode switch RPC完成strict TDD；final HEAD `5afb138e0c7f4bdb941479d0be934589d918bf18`。Source-contract `6/6 PASS`、`--check-only` PASS，tree `d261e6f0c38f58b4aa177467b89ea90ba6897da3`、manifest mode `0600`；fresh PostgreSQL correctness/security review PASS，blocking 0。
- D1 function為SECURITY DEFINER＋`search_path=pg_catalog`＋全schema-qualified objects；exact ACL只允許service_role。Idempotency claim/lock→guide row lock→same-mode no side effects或mode/version+1→audit→outbox→completed snapshot均在單一transaction；本階段未apply DB，真實catalog/concurrency由D3 gates驗證。
- 2026-07-23 Phase D Task D2 admin mode-switch gateway/API完成strict TDD remediation；final HEAD `0006353a8f3a0b741ef2675aadf7ebb2472e5cf6`。Initial implementation `fbb667a0` review FAIL blocking 3；async Supabase client、direction TOCTOU與mixed admin credential provenance均新增真RED後修復。Final exact D2/typecheck/check-only PASS，tree `a49643cc76af4252f9ce9cae1ec8367a2ea0ac6e`、manifest `0600`；focused/admin/C4A regressions `29/29 PASS`；fresh static re-review PASS，blocking 0。
- D2 actor逐欄完全mirror middleware header→cookie precedence；target=midao一律要求backend＋mode-switch flags，避免stale pre-read forward bypass；target=legacy rollback/same-mode不依賴任何flags。Gateway await production client，route strict UUID/body/reason/key/hash且無直接DB。
- 2026-07-23 Phase D Task D3a exclusive local Supabase runner完成多輪hostile remediation；final HEAD `8a70f79e096b5cdf92df8fb61111ebbe6910544e`。Unit `14/14 PASS`、typecheck/check-only PASS，tree `cbbec2325fb4de23550cbeffa0efdbd7b2e75699`、manifest `0600`；final fresh lifecycle/security review PASS，blocking 0。
- D3a同一Node持有owner-only directory＋`O_NOFOLLOW` regular/nlink1/uid/mode600 FD flock；exact LF/CRLF status、full container/network IDs與volume identifiers、pre-cleanup identity recheck、exact-ID cleanup、signal teardown、credential redaction及position-0 partial-write-safe metadata release均fail closed。尚未在D3a啟動Docker或apply DB。
- 2026-07-24 D3c/D3d remediation完成：real PostgreSQL `8/8 PASS`、commit `e095b602`、exact tree `ec634734c9ce231f80e6ad20c32caf59645cf269`；fresh review PASS、blocking 0。
- 2026-07-24 Midao responsive shell／page session boundary／五頁入口完成：commits `02639254`、`b2f04b9b`、`66c4b379`；focused regressions分別`6/6`、`10/10`、`9/9 PASS`，各自typecheck exact staged evidence PASS。
- 2026-07-24 full historical replay推進至第69／134支後熔斷；曾為調查建立的8支frozen migration修改全部隔離在`wip-d3b-full-migration-replay-remediation-20260724` stash，未恢復、未提交。Owner決定停止所有frozen migration修改，主線改採catalog-verified as-built baseline；並行只做schema-neutral UI。
- 2026-07-24 owner批准active production project `pyoderxmpeyqjwkeliiu`只讀catalog metadata；Vercel與Supabase CLI登入均驗證成功。Production probe：73張public tables全部RLS enabled、114 policies；3張Midao domain tables零policy而預設全拒絕；59張tables仍有authenticated broad grants，記為known security drift，不宣稱已修復。
- 6支`2026072300*` Midao foundation effects經PostgREST OpenAPI＋`limit=0` metadata probe確認production不存在；`guide_profiles`新欄位回SQLSTATE`42703`，因此全部列為post-cutoff。
- Supabase CLI 2.87.2 schema dump受570秒timeout後exit `124`，partial SQL缺complete marker且有函式／enum斷裂；已刪除臨時dump，不作baseline。`db dump --dry-run`證實可用安全短期連線env供direct PG17 extractor，credential未輸出或保存。
- Owner已批准：逐物件managed-schema boundary、目前production cutoff、fresh只記baseline marker＋post-cutoff history、PR source/release verified雙gate、CLI2.87.2＋PG17版本契約與整合設計。
- Baseline v1 docs首次commit `30c0b6f9d1b971fe41b5c9cb6230d08e44b8fb57`、tree `595dae14243e6ca38b92537f75a985c1efd561df`；五檔docs scope／placeholder／format-char／secret-pattern／diff checks PASS，worktree clean。
- Exact HEAD `30c0b6f9` fresh reviews均FAIL：SPEC blocking 3、QUALITY/SECURITY blocking 7、EXECUTABILITY blocking 11。合併去重為17類blocking；未把review timeout或partial summary當PASS，也未開始baseline實作／production capture。
- 主要blocking：cutoff與terminal catalog混用、overlay會多history row、唯讀未封鎖`.psqlrc/PG*`、existing rehearsal可能誤連remote、PG17/images未鎖digest、TOC/use-list/ownership證據未發布、known ACL drift可能被稱security PASS、credential temp-file矛盾、Task順序/RED/staging/evidence coverage及PR/release callers不可執行。
- 2026-07-24已重寫baseline design／implementation v2：分離`catalog.cutoff`與`catalog.expected-terminal`；baseline＋overlay合成單一marker；memory-only bounded credential pipe＋`psql -X`／empty HOME／strict env／read-only PGOPTIONS；toolchain/image content lock；published TOC/use-list/map；drift status分離；local-only runners；15個具RED、exact stage、ordinary＋heavy evidence與caller wiring的Tasks。
- v2 commit `d18042f287e596b3e583931b518f4d65fceb9850`、tree `83339b96f88789978ca771ca538fd6a46c8f04c6`；docs靜態自審PASS、worktree clean、GitHub #1756 body＋comment讀回PASS。
- 首輪v2三路review因600秒工具timeout均INCONCLUSIVE；縮窄成local read-only review後取得有效verdict：SPEC PASS blocking 0；QUALITY/SECURITY FAIL blocking 1；EXECUTABILITY FAIL blocking 3。
- v3最小修正處理4項：發布並digest-bound `dependency-closure.json`；Task 1新增registry metadata resolver、owner-approved immutable digest request與digest-only acquisition/read-back；Tasks 8/10明確producer、ledger、多target guarded publication/rollback與manual acceptance test；Tasks 11/12補heavy allowlist exact RED command。
- 2026-07-24 v3 commit `6568ee12752c578290c4519fe6901eb8150d7878`、tree `a80bb8580f23f4f97e3a2c0e316b492bc0cb4e52`；docs static/diff checks PASS，worktree clean。
- Exact v3 targeted fresh reviews全部放行：既有SPEC PASS blocking 0；QUALITY/SECURITY dependency-closure re-review PASS blocking 0；EXECUTABILITY toolchain/publication/heavy-RED re-review PASS blocking 0。GitHub里程碑：`issuecomment-5069595817`。
- 2026-07-24 Admin導遊詳情新增方向性後台模式入口：GET projection含`backend_mode`並保留legacy-schema fallback；approved profile可提供reason後以CSRF＋Idempotency-Key呼叫既有atomic API，成功只依v2 response更新local state。Initial commit `8437bdd0` fresh review FAIL blocking 2；新增fail-closed DB resolver與runtime command tests後commit `a0e69e83`，再以exact SQLSTATE `42703`修正message spoof fallback並commit `d588b152355a1116754072b556695cfe022213bb`、tree `d27e7ab302a98e42f7b4cd3aca8fa2f998f9030e`。Final focused/runtime/regression `18/18 PASS`、typecheck PASS；final narrow fresh review PASS、blocking 0。GitHub milestone：`issuecomment-5070711712`。
- 2026-07-24 Baseline Task 1 immutable toolchain lock完成strict TDD；commit `4298dafe1fc24d5d40e35e0002dd197819b6938f`、tree `58420dfcd343f05c634159bb0e0f958030df7ac4`。Focused `15/15 PASS`；12項required images全部local present、missing bytes 0、未pull；PG client三工具皆為17.10；request／lock二次生成byte-identical且secret scan PASS。Fresh combined review進行中。
- 2026-07-24 Task 2前read-only inventory audit發現原plan把current forward總量134誤寫為cutoff frozen集合。Live partition為128支pre-cutoff＋6支Midao post-cutoff＝134；ledger applied/covered union亦為128且missing exact六支Midao。Docs修正commit `2d627fa6cc305b1d61558b309a037e0c80658863`、tree `0caa8f1c67d729cd4adaebff6716d3cdb5c235a3`；targeted SPEC／SECURITY／EXECUTABILITY review全部PASS、blocking 0。GitHub milestone：`issuecomment-5070729487`。

## 下一步
- Task 1實作已完成，等待fresh combined review；若有blocking先remediate至0。
- 128／6／134 partition gate已清零；Task 1 fresh review放行後開始Task 2 exact 128支pre-cutoff SHA manifest。
- 缺image時只發布immutable digest supply request，未經owner批准不下載。

## 絕不重做（Do-NOT-redo）
- 不重跑或重審完整plan／A4／Phase B／Phase C／D1–D3a：對應anchors均已有fresh PASS；D3a final為`8a70f79e`。下一步只進D3b。
- 不沿用首次`npm install`後再restore lock假裝deterministic；必須由`npm ci`重新建立。
- 不執行`npm audit fix`，避免未review dependency/lock drift。
- 不修改frozen middleware、legacy orders/payments、既有migrations、protected E2E、`CLAUDE.md`或`.claude/**`。
- 未經對應gate不做production SQL/migration apply、deploy、guide mode switch、真付款或LINE通知。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
