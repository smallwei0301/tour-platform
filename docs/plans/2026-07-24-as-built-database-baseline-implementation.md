# As-built Database Baseline Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 建立經production catalog逐項驗證的baseline v1，讓fresh Supabase環境從baseline＋post-cutoff migrations重建，同時保證existing production永遠不執行baseline。

**Architecture:** 既有 `supabase/migrations/` 是production additive lane且全歷史凍結；`supabase/baselines/v1/` 是fresh-only as-built lane。固定PostgreSQL 17 catalog extractor產出canonical JSON，以ownership manifest分類application/platform/overlay/extension objects，fresh與existing rehearsal最後都由同一comparator驗terminal catalog。

**Tech Stack:** Node.js 22 built-in test runner、PostgreSQL 17 `psql/pg_dump`、Supabase CLI 2.87.2、Docker、JSON manifests、Bash tracked heavy runners。

**Authoritative design:** `docs/plans/2026-07-24-as-built-database-baseline-design.md`

---

## 全域規則

- 不恢復 `wip-d3b-full-migration-replay-remediation-20260724` stash。
- 不修改任何既有 `supabase/migrations/*.sql`；只允許新增post-cutoff timestamp migration。
- Production只允許catalog read；任何schema apply另需owner明確授權。
- Capture command不得接受caller SQL或connection string argv。
- 所有heavy commands用tracked background，底層固定 `timeout --signal=TERM 570s`。
- 每個commit前使用exact staged evidence；manifest mode `0600`。

## Task 1：凍結歷史migration bytes

**Objective:** 建立134支forward migration的canonical SHA-256 manifest與drift guard。

**Files:**
- Create: `scripts/database-baseline/build-frozen-migration-manifest.mjs`
- Create: `apps/web/tests/unit/midao-baseline-frozen-history.test.mjs`
- Create: `supabase/baselines/v1/frozen-migrations.sha256`

**Step 1 — RED**

測試要求：排除`.rollback.sql`、排序穩定、完整filename＋digest、symlink/non-regular/duplicate version明確報告、任一byte drift non-zero，且8支stash修改不得出現在工作樹輸入。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-frozen-history.test.mjs
```

Expected：FAIL，builder與manifest missing。

**Step 2 — Minimal GREEN**

Builder以directory FD列舉、`lstat/fstat`驗regular/nlink/uid/path identity，輸出到exclusive `0600` temp後atomic rename。Manifest header固定format/version、repo tree與forward count；不把rollback列入。

**Step 3 — GREEN/evidence**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-frozen-history.test.mjs
node scripts/database-baseline/build-frozen-migration-manifest.mjs --check
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-baseline-frozen-history.test.mjs
```

**Step 4 — Commit**

```bash
git commit -m "test: 凍結歷史 migration bytes"
```

## Task 2：定義catalog extractor schema與唯讀SQL

**Objective:** 以單一allowlisted SQL查詢完整catalog，拒絕data tables與動態caller SQL。

**Files:**
- Create: `scripts/database-baseline/catalog-queries.sql`
- Create: `scripts/database-baseline/extract-catalog.mjs`
- Create: `apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs`
- Create: `apps/web/tests/fixtures/database-baseline/catalog-minimal.json`

**Step 1 — RED**

Source/runtime tests鎖定design §8全部sections；SQL第一句明確read-only transaction，查詢只可引用`pg_catalog`、`information_schema`與allowlisted Supabase metadata，禁止application table row scan、COPY、INSERT、UPDATE、DELETE、DDL與caller supplied SQL。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs
```

Expected：FAIL，SQL/extractor missing。

**Step 2 — Minimal GREEN**

Extractor只接受`--connection-env-fd`、`--output`與固定project metadata；spawn fixed PostgreSQL 17 `psql`，透過stdin送reviewed SQL；stdout只能是exact JSON document，stderr先redact。任何missing section、duplicate canonical identity、unknown kind、server major非17或transaction read-only未證明即FAIL。

**Step 3 — GREEN/evidence**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs
```

**Step 4 — Commit**

```bash
git commit -m "feat: 建立唯讀 PostgreSQL catalog extractor"
```

## Task 3：catalog normalizer

**Objective:** 將raw catalog轉成byte-stable canonical JSON，不隱藏security差異。

**Files:**
- Create: `scripts/database-baseline/normalize-catalog.mjs`
- Create: `apps/web/tests/unit/midao-catalog-normalizer.test.mjs`
- Create: `apps/web/tests/fixtures/database-baseline/catalog-unstable-a.json`
- Create: `apps/web/tests/fixtures/database-baseline/catalog-unstable-b.json`

**Step 1 — RED**

覆蓋排序、OID/統計值排除、expression whitespace規則、role-class map、完整ACL/RLS/default privileges保留、function body digest、duplicate/unknown/missing拒絕，以及同義輸入byte-identical。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-catalog-normalizer.test.mjs
```

Expected：FAIL，normalizer missing。

**Step 2 — Minimal GREEN**

不用regex解析SQL body；只正規化extractor已分欄的catalog values。JSON使用固定key order、UTF-8、LF與terminal newline；任何不能安全正規化的expression保持原文並產生stable digest。

**Step 3 — GREEN/evidence**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-catalog-normalizer.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-catalog-normalizer.test.mjs
```

**Step 4 — Commit**

```bash
git commit -m "feat: 正規化 database catalog"
```

## Task 4：逐物件ownership boundary

**Objective:** 對application/platform/overlay/extension/excluded objects做唯一、完整分類。

**Files:**
- Create: `scripts/database-baseline/validate-ownership-boundary.mjs`
- Create: `apps/web/tests/unit/midao-baseline-ownership.test.mjs`
- Create: `supabase/baselines/v1/ownership-boundary.json`
- Create: `supabase/baselines/v1/role-map.json`
- Create: `supabase/baselines/v1/exclusions.json`
- Create: `supabase/baselines/v1/platform-prerequisites.json`

**Step 1 — RED**

測試涵蓋overlap、missing object、unknown object、glob過寬、platform object被baseline建立、app overlay被整體排除、extension object誤歸application、未批准exclusion與版本不符。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-ownership.test.mjs
```

Expected：FAIL，validator/manifests missing。

**Step 2 — Minimal GREEN**

Manifest只允許exact canonical identity或reviewed prefix class；`auth/storage`不是自動排除條件。Platform prerequisite固定CLI 2.87.2、PG17、required roles/extensions與local stack service contract。

**Step 3 — GREEN/evidence**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-ownership.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-baseline-ownership.test.mjs
```

**Step 4 — Commit**

```bash
git commit -m "feat: 定義 baseline object ownership"
```

## Task 5：catalog comparator

**Objective:** 產出machine-readable exact diff，unknown difference fail closed。

**Files:**
- Create: `scripts/database-baseline/compare-catalog.mjs`
- Create: `apps/web/tests/unit/midao-catalog-comparator.test.mjs`

**Step 1 — RED**

逐section加入missing/extra/changed案例；ACL、policy、function identity/body、trigger state、index predicate、constraint validated、extension/version與default privileges不得被通用exclusion吞掉。輸出不得含business data或secret。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-catalog-comparator.test.mjs
```

Expected：FAIL，comparator missing。

**Step 2 — Minimal GREEN**

Comparator先驗兩側schema/extractor version與digest，再逐canonical identity比較；exclusion需exact identity＋field＋reason＋approval，未命中即FAIL。

**Step 3 — GREEN/evidence**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-catalog-comparator.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-catalog-comparator.test.mjs
```

**Step 4 — Commit**

```bash
git commit -m "feat: 建立 database catalog exact comparator"
```

## Task 6：secret-safe production capture wrapper

**Objective:** 從linked production取得direct PG17 schema/catalog metadata，credential只在memory/child env。

**Files:**
- Create: `scripts/database-baseline/capture-production-catalog.mjs`
- Create: `scripts/database-baseline/verify-manifest.mjs`
- Create: `apps/web/tests/unit/midao-production-catalog-capture.test.mjs`
- Create: `apps/web/tests/unit/midao-baseline-manifest.test.mjs`
- Create: `apps/web/tests/fixtures/database-baseline/supabase-dump-dry-run-redacted.txt`

**Step 1 — RED**

Mocked adapters涵蓋：pinned CLI binary bytes、exact project ref、dry-run fixture parser、unexpected line/duplicate password/URI/command injection拒絕、secret fragment跨chunk redaction、FD/path replacement、hostile umask、timeout/signal、child/cleanup errors、no argv secret、no raw output persistence。Archive/TOC tests鎖定schema-only custom format、structured TOC identity、ownership-complete `--use-list`、platform schema creation排除、禁止regex/line-based SQL stripping。Manifest測試另鎖required fields/digests、禁止credential/raw argv、unknown field與partial publish拒絕。

```bash
node --test --test-concurrency=1 \
  apps/web/tests/unit/midao-production-catalog-capture.test.mjs \
  apps/web/tests/unit/midao-baseline-manifest.test.mjs
```

Expected：FAIL，capture wrapper missing。

**Step 2 — Minimal GREEN**

Wrapper固定：

```text
verify CLI bytes
→ repo-wide exclusive lock
→ supabase db dump --linked --dry-run to 0600 FD
→ exact parse into child env
→ direct PG17 schema-only custom archive
→ pg_restore structured TOC
→ fixed catalog extractor
→ ownership-complete TOC allowlist
→ pg_restore --use-list render baseline/overlay SQL
→ credential/business-row scans＋syntax preflight
→ normalized output＋digests
→ owned cleanup
```

禁止`--db-url`、caller SQL、ambient PATH binary與raw child output進manifest。Custom archive不得提交；`pg_restore --list`必須成功且TOC逐項分類，`--use-list`不得包含platform schema creation或unknown object。Rendered SQL必須零COPY、零business INSERT、無credential pattern並通過syntax preflight；禁止以regex或line filter刪SQL statement。`verify-manifest.mjs`先實作strict artifact schema、archive/TOC/rendered/catalog digests與credential exclusion；cutoff/lane規則於Task8擴充。

**Step 3 — GREEN/evidence**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/unit/midao-production-catalog-capture.test.mjs \
  apps/web/tests/unit/midao-baseline-manifest.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh \
  apps/web/tests/unit/midao-production-catalog-capture.test.mjs \
  apps/web/tests/unit/midao-baseline-manifest.test.mjs
```

**Step 4 — Fresh security review**

Review exact HEAD；blocking非零不得執行production capture。

**Step 5 — Commit**

```bash
git commit -m "feat: 建立安全的 production catalog capture"
```

## Task 7：執行兩次唯讀production capture

**Objective:** 取得byte-identical authoritative snapshot並發布baseline候選，不執行production write。

**Files:**
- Create: `supabase/baselines/v1/catalog.normalized.json`
- Create: `supabase/baselines/v1/catalog.sha256`
- Create: `supabase/baselines/v1/baseline.sql`
- Create: `supabase/baselines/v1/managed-overlays.sql`
- Create: `supabase/baselines/v1/manifest.json`
- Create: `docs/operations/baseline-ledger.json`

**Step 1 — Read-only capture A/B**

以tracked background各跑一次，輸出到兩個runner-owned temp dirs：

```bash
timeout --signal=TERM 570s node scripts/database-baseline/capture-production-catalog.mjs \
  --project-ref pyoderxmpeyqjwkeliiu --output-dir <temp-A>
timeout --signal=TERM 570s node scripts/database-baseline/capture-production-catalog.mjs \
  --project-ref pyoderxmpeyqjwkeliiu --output-dir <temp-B>
```

Expected：兩次normalized catalog bytes、normalized TOC bytes與rendered baseline/overlay SQL bytes一致；custom archive各自記digest但不要求binary bytes相同。若capture期間catalog改變，HOLD並重新取同一穩定窗口。

**Step 2 — Review artifacts**

- baseline SQL只含schema，無COPY/business INSERT/secret。
- ownership manifest涵蓋全部objects。
- `managed-overlays.sql`只含approved app overlay。
- 59-table authenticated broad grants寫入known security drift，不列exclusion。
- Cutoff綁production project、timestamp、live history、catalog digest與最後verified filename。

**Step 3 — Publish artifacts**

使用exclusive create＋mode readback；baseline ledger記provenance/review，不冒充production apply。

**Step 4 — Exact docs/artifact evidence與commit**

```bash
node scripts/database-baseline/verify-manifest.mjs --baseline supabase/baselines/v1
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh \
  apps/web/tests/unit/midao-baseline-frozen-history.test.mjs \
  apps/web/tests/unit/midao-baseline-ownership.test.mjs

git commit -m "feat: 建立 production as-built baseline v1"
```

## Task 8：baseline manifest與lane identity verifier

**Objective:** 將cutoff、marker、post-cutoff selection與lane confusion fail-closed。

**Files:**
- Modify: `scripts/database-baseline/verify-manifest.mjs`
- Modify: `apps/web/tests/unit/midao-baseline-manifest.test.mjs`

**Step 1 — RED**

涵蓋marker identity、6支Midao exact filename/version/hash/order、future timestamp selection、duplicate version、missing/extra/reordered/hash drift、baseline出現在production discovery、occupied/empty lane inversion。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-manifest.test.mjs
```

Expected：FAIL，verifier missing。

**Step 2 — Minimal GREEN**

Selection完全由manifest完整filename＋digest決定；version只作Supabase history identity，不取代filename。Fresh marker採唯一synthetic version，不與既有版本重疊。

**Step 3 — GREEN/evidence/commit**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-manifest.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-baseline-manifest.test.mjs
git commit -m "feat: 驗證 baseline cutoff與lane identity"
```

## Task 9：fresh workdir materializer

**Objective:** 建立只含baseline marker＋post-cutoff migrations的runner-owned Supabase workdir。

**Files:**
- Create: `scripts/database-baseline/materialize-fresh-workdir.mjs`
- Create: `apps/web/tests/unit/midao-baseline-materializer.test.mjs`

**Step 1 — RED**

測copied config identity、symlink/hardlink/replacement、baseline first、overlay order、6支post-cutoff完整、rollback排除、seed分離、cleanup ownership、foreign workdir拒絕。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-materializer.test.mjs
```

Expected：FAIL，materializer missing。

**Step 2 — Minimal GREEN**

Materializer從validated artifacts組裝temporary `supabase/migrations/`；baseline synthetic migration最先、overlay其後、post-cutoff依manifest；seed使用明確local fixture，不複製production data。

**Step 3 — GREEN/evidence/commit**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-materializer.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-baseline-materializer.test.mjs
git commit -m "feat: 建立 fresh baseline workdir"
```

## Task 10：fresh-install真PostgreSQL gate

**Objective:** empty PG17成功materialize baseline＋6支Midao＋seed並exact compare。

**Files:**
- Create: `scripts/database-baseline/run-fresh-install.mjs`
- Create: `apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs`
- Modify: `scripts/testing/run-midao-foundation-postgres.sh`
- Modify: `scripts/testing/verify-staged-check-evidence.mjs`
- Modify: `apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs`

**Step 1 — Tracked-heavy allowlist RED/GREEN**

先新增hostile tests：只允許literal prefixes

```text
timeout --signal=TERM 570s node scripts/database-baseline/run-fresh-install.mjs
timeout --signal=TERM 570s node scripts/database-baseline/run-existing-upgrade-rehearsal.mjs
```

拒絕alternate node、extra env/shell、path traversal、timeout變更、argument injection與任意`database-baseline/*.mjs`。Focused verifier suite GREEN後才可使用新heavy prefixes。

**Step 2 — Post-implementation acceptance test**

本gate不冒充TDD RED；unit tasks已分別保留RED。Integration assert：empty identity、baseline history marker、6支history exact once、seed readback、terminal catalog exact、ACL/RLS/RPC與cleanup。

**Step 3 — Heavy evidence**

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s node scripts/database-baseline/run-fresh-install.mjs \
  --test apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
```

Expected：exit 0；任一catalog diff、history mismatch或cleanup failure為FAIL。

**Step 4 — Commit**

```bash
git commit -m "test: 驗證 baseline fresh install"
```

## Task 11：existing-lane upgrade rehearsal

**Objective:** production-shaped cutoff clone只執行post-cutoff，結果與fresh terminal catalog一致。

**Files:**
- Create: `scripts/database-baseline/run-existing-upgrade-rehearsal.mjs`
- Create: `apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs`

**Step 1 — RED source/lifecycle contract**

先以mock adapter測existing marker判定、baseline execution count必為零、empty DB拒絕、post-cutoff exact once、failure rollback與cleanup。

**Step 2 — Real rehearsal**

從baseline cutoff state clone建立occupied fixture，不含baseline marker；套6支Midao後extract terminal catalog，與fresh結果比較。

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s node scripts/database-baseline/run-existing-upgrade-rehearsal.mjs \
  --test apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs
```

Expected：exit 0，baseline從未執行，terminal catalogs exact equivalent。

**Step 3 — Commit**

```bash
git commit -m "test: 驗證 existing database post-cutoff upgrade"
```

## Task 12：拆分PR source gate與release verified gate

**Objective:** 解開「先CI綠／先production verified」死結，不弱化release證據。

**Files:**
- Modify: `scripts/check-migration-ledger.mjs`
- Modify: `apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs`
- Create: `scripts/check-migration-source-gate.mjs`
- Create: `apps/web/tests/unit/migration-source-gate.test.mjs`
- Modify: `docs/operations/migration-apply-ledger-sop.md`

**Step 1 — RED**

PR mode允許new post-cutoff migration尚未verified，但要求timestamp/hash/source tests/manifest；既有歷史byte drift仍FAIL。Release mode要求live history＋ledger verified，pending/missing仍HOLD。假verified、baseline ledger冒充production ledger與已apply未驗證均拒絕。

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs \
  apps/web/tests/unit/migration-source-gate.test.mjs
```

Expected：新source gate missing／現有單gate語意不符。

**Step 2 — GREEN/evidence/commit**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs \
  apps/web/tests/unit/migration-source-gate.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh \
  apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs \
  apps/web/tests/unit/migration-source-gate.test.mjs
git commit -m "fix: 分離 migration source與release gates"
```

## Task 13：重新接回D3b–D3d與E4/F9/F10

**Objective:** D3與真browser lane建立在fresh baseline，不使用歷史replay或假session。

**Files:**
- Modify: `scripts/testing/with-midao-local-supabase.mjs`
- Modify: `apps/web/tests/unit/midao-local-supabase-runner.test.mjs`
- Create: `scripts/testing/run-midao-e2e.sh`
- Create: `scripts/testing/run-midao-legacy-e2e-compat.sh`
- Modify after selectively restoring E4 WIP only: `apps/web/e2e/helpers.ts`
- Modify after selectively restoring E4 WIP only: `apps/web/playwright.config.ts`
- Modify after selectively restoring E4 WIP only: `supabase/seed.sql`
- Create: `apps/web/tests/security/midao-e2e-auth-seam.test.mjs`
- Create: `apps/web/e2e/midao-navigation.spec.ts`
- Create: `apps/web/e2e/midao-auth-and-impersonation.spec.ts`

禁止apply／pop D3b frozen-remediation stash；E4 paths以path-scoped restore取回並重新跑RED/GREEN，不把舊focused PASS冒充baseline後證據。

**Step 1 — Runner RED**

要求D3/E2E runner呼叫fresh materializer，禁止synthetic guide_profiles bootstrap、hard-coded 6-file subset、disabled seed與ordinary 134-file replay。

**Step 2 — Minimal GREEN**

保留D3a lock/container ownership；替換DB preparation seam為baseline fresh lane。E4使用真HMAC/session actor與deterministic local seed；server-owned fixed port、`reuseExistingServer=false`。

**Step 3 — Heavy gates**

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-foundation-postgres.sh \
  apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs \
  apps/web/tests/integration/midao-mode-switch-postgres.test.mjs \
  apps/web/tests/integration/midao-mode-switch-concurrency-postgres.test.mjs

node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-e2e.sh \
  apps/web/e2e/midao-navigation.spec.ts \
  apps/web/e2e/midao-auth-and-impersonation.spec.ts
```

Expected：D3 catalog/ACL/RLS/RPC/concurrency與real-auth browser全部PASS。

**Step 4 — Commit**

```bash
git commit -m "test: 以 baseline 驗證 Midao Postgres與E2E"
```

## Task 14：known security drift report

**Objective:** 讓59-table broad grants保持可見，不在baseline中被誤判為理想PASS。

**Files:**
- Create: `docs/operations/qa-reports/2026-07-24-production-grant-drift.md`
- Create: `apps/web/tests/security/midao-baseline-security-drift.test.mjs`

**Step 1 — RED**

測report與catalog digest綁定、table/grantee/privilege完整、RLS與ACL結論分離、禁止exclusion吞掉drift、禁止宣稱已修復。

**Step 2 — GREEN/evidence**

```bash
node --test --test-concurrency=1 apps/web/tests/security/midao-baseline-security-drift.test.mjs
```

本task只報告；如owner另批准修復，新增post-cutoff migration與獨立issue，不修改baseline或歷史。

**Step 3 — Commit**

```bash
git commit -m "docs: 記錄 production grant drift"
```

## Task 15：Final gates與雙寫

**Objective:** 完整驗證、fresh review、worklog/GitHub milestone同步。

**Files:**
- Modify: `docs/operations/worklogs/issue1756.md`
- Modify: `docs/plans/2026-07-22-midao-package-01-foundation-shell.md`

**Step 1 — Focused union/typecheck**

執行authoritative plan G1更新後的exact Node22 list。

**Step 2 — Heavy partitions**

分別tracked background執行：

- baseline fresh/existing gates；
- D3 PostgreSQL；
- Midao/legacy Playwright；
- full tests；
- lint；
- typecheck；
- production build。

每個底層都用570秒timeout；不能合併partial runs成假綠。

**Step 3 — Fresh reviews**

對exact HEAD執行SPEC、QUALITY/SECURITY與baseline architecture review；timeout/tool failure為INCONCLUSIVE。

**Step 4 — Milestone雙寫**

Worklog記：exact argv、Node/CLI/PG版本、tree/SHA、exit/test counts、catalog digests、review blocking count與remaining production apply HOLD。GitHub只在network授權範圍留言；不push／PR／merge除非owner另行授權。

**Step 5 — Completion condition**

只有design §14全部成立，才可將`#1756`標為implementation complete；production Midao migration apply仍為獨立授權步驟。
