# As-built Database Baseline Implementation Plan v2

> **For Hermes:** Use `subagent-driven-development` task-by-task. Exact HEAD `30c0b6f9` v1 plan fresh reviews were FAIL；v2已吸收全部blocking。未取得v2三路fresh review PASS前不得執行Task 1。

**Goal:** 建立production as-built baseline v1，讓fresh Supabase從單一baseline marker＋post-cutoff migrations重建；existing production永遠不執行baseline。

**Architecture:** `supabase/migrations/`是existing additive lane；`supabase/baselines/v1/`是fresh-only lane。Production cutoff catalog與post-cutoff expected-terminal catalog分離。所有DB terminal state由同一PG17 extractor正規化並對不可變artifact exact compare。

**Authoritative design:** `docs/plans/2026-07-24-as-built-database-baseline-design.md`

---

## 全域執行規則

1. 不恢復`wip-d3b-full-migration-replay-remediation-20260724`；不修改任何既有migration。
2. Production只允許metadata read；任何schema apply另需owner明確授權。
3. Heavy local stack／Docker／capture commands使用tracked background，底層`timeout --signal=TERM 570s`。
4. 每個新behavior先跑exact RED；missing path、syntax error、0 tests不算RED。
5. GREEN後、staged verifier前，必須執行該Task明列的exact `git add -- ...`。若Files ownership與實際stage不一致即HOLD。
6. 每個含staged test的commit必須先有ordinary evidence覆蓋全部staged tests；heavy entry只能追加。最後跑`--check-only`與`git diff --cached --check`。
7. Regression／full suite是acceptance evidence，不冒充staged test evidence。
8. Actual artifacts發布採exclusive temp＋fsync/read-back digest＋atomic rename；partial publish、cleanup failure或secret scan failure皆non-zero。
9. PG17 toolchain或image缺失時HOLD並先取得owner對下載／資源使用同意。

## Task 1：供應鏈與PG17 toolchain lock

**Objective:** 在production credential取得前固定CLI、PG17 clients與local Supabase service images。

**Files:**
- Create: `scripts/database-baseline/resolve-toolchain-supply.mjs`
- Create: `scripts/database-baseline/acquire-toolchain-images.mjs`
- Create: `scripts/database-baseline/verify-toolchain-lock.mjs`
- Create: `apps/web/tests/unit/midao-baseline-toolchain-lock.test.mjs`
- Create: `supabase/baselines/v1/toolchain-supply-request.json`
- Create: `supabase/baselines/v1/toolchain-lock.json`
- Create: `scripts/database-baseline/schemas/toolchain-supply-request.schema.json`
- Create: `scripts/database-baseline/schemas/toolchain-lock.schema.json`

**RED**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-toolchain-lock.test.mjs
```

Expected：FAIL，resolver／acquirer／verifier／locks missing；不是import error。Tests涵蓋CLI absolute realpath/version/SHA/uid/gid/mode/nlink、registry metadata將每個required image tag解析成immutable repo digest、owner-approved request exact digest set、禁止mutable tag acquisition、PG17 container image ID、container內`psql/pg_dump/pg_restore`absolute path/exact version、all local service image digests、architecture、PATH/tag/image substitution，以及partial pull/read-back mismatch non-zero。

**GREEN／owner-gated supply**

1. 只接受固定CLI `/root/.hermes/toolchains/supabase/2.87.2/supabase`與既有reviewed SHA。
2. 先只查registry metadata，不下載layers；解析CLI所需PG17及所有local service image tags成immutable `repository@sha256:digest`，每個image逐項寫入request：

```bash
node scripts/database-baseline/resolve-toolchain-supply.mjs \
  --cli /root/.hermes/toolchains/supabase/2.87.2/supabase \
  --registry-metadata-only \
  --output supabase/baselines/v1/toolchain-supply-request.json
```

3. Resolver輸出exact image list、digest、architecture、local-present狀態與estimated missing bytes。若任一image缺失，**停止並向owner展示完整immutable digest清單與下載量取得批准**；未批准不得pull。
4. Owner批准後唯一允許的acquisition command：

```bash
timeout --signal=TERM 570s node scripts/database-baseline/acquire-toolchain-images.mjs \
  --approved-request supabase/baselines/v1/toolchain-supply-request.json \
  --docker /usr/bin/docker
```

Acquirer內部只能執行request逐項列出的`docker pull repository@sha256:digest`；禁止tag、額外image或request drift。若全部已local present，跳過acquisition但仍驗digest。
5. Acquisition後read-back每個image ID／repo digest／architecture，以及container內三個PG17 absolute binaries/version；生成`toolchain-lock.json`。任一identity不符即HOLD。每次後續使用前再次read-back。

**Stage/evidence**

```bash
git add -- \
  scripts/database-baseline/resolve-toolchain-supply.mjs \
  scripts/database-baseline/acquire-toolchain-images.mjs \
  scripts/database-baseline/verify-toolchain-lock.mjs \
  scripts/database-baseline/schemas/toolchain-supply-request.schema.json \
  scripts/database-baseline/schemas/toolchain-lock.schema.json \
  apps/web/tests/unit/midao-baseline-toolchain-lock.test.mjs \
  supabase/baselines/v1/toolchain-supply-request.json \
  supabase/baselines/v1/toolchain-lock.json
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-baseline-toolchain-lock.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `feat: 鎖定 baseline PostgreSQL toolchain`。

## Task 2：凍結cutoff的128支pre-cutoff forward migration bytes

**Objective:** 固定exact 128 pre-cutoff filenames＋SHA；6支Midao post-cutoff不在此集合，且不因repo tree或合法future extra migration失效。

**Files:**
- Create: `scripts/database-baseline/build-frozen-migration-manifest.mjs`
- Create: `apps/web/tests/unit/midao-baseline-frozen-history.test.mjs`
- Create: `supabase/baselines/v1/frozen-migrations.sha256`

**RED**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-frozen-history.test.mjs
```

Expected：FAIL，builder missing。Tests要求：exact 128條pre-cutoff完整filename＋digest、rollback與6支Midao post-cutoff排除、missing/drift/symlink/duplicate拒絕；集合外合法新post-cutoff檔不在本checker FAIL，由source gate處理。Manifest不得綁full repo tree。

**GREEN/stage/evidence**

```bash
git add -- \
  scripts/database-baseline/build-frozen-migration-manifest.mjs \
  apps/web/tests/unit/midao-baseline-frozen-history.test.mjs \
  supabase/baselines/v1/frozen-migrations.sha256
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-baseline-frozen-history.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `test: 凍結cutoff migration bytes`。

## Task 3：唯讀catalog extractor

**Objective:** 以固定SQL完整擷取catalog，從連線建立時即read-only。

**Files:**
- Create: `scripts/database-baseline/catalog-queries.sql`
- Create: `scripts/database-baseline/extract-catalog.mjs`
- Create: `apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs`
- Create: `apps/web/tests/fixtures/database-baseline/catalog-minimal.json`

**RED**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs
```

Expected：FAIL，extractor missing。Tests鎖：

- strict env allowlist；empty runner-owned HOME；清除ambient `PG*`／`DATABASE_URL`；
- absolute locked PG17 client；`psql -X --set=ON_ERROR_STOP=1`；
- `PGOPTIONS=-c default_transaction_read_only=on`；SQL內`BEGIN READ ONLY`及read-back；
- hostile `.psqlrc`、`PGOPTIONS`、`PGSERVICE*`、`PGPASSFILE`、PATH、caller SQL拒絕；
- design catalog matrix全部sections、duplicate／unknown／missing拒絕。

**GREEN/stage/evidence**

```bash
git add -- \
  scripts/database-baseline/catalog-queries.sql \
  scripts/database-baseline/extract-catalog.mjs \
  apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs \
  apps/web/tests/fixtures/database-baseline/catalog-minimal.json
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `feat: 建立唯讀 PostgreSQL catalog extractor`。

## Task 4：catalog normalizer

**Files:**
- Create: `scripts/database-baseline/normalize-catalog.mjs`
- Create: `apps/web/tests/unit/midao-catalog-normalizer.test.mjs`
- Create: `apps/web/tests/fixtures/database-baseline/catalog-unstable-a.json`
- Create: `apps/web/tests/fixtures/database-baseline/catalog-unstable-b.json`

**RED**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-catalog-normalizer.test.mjs
```

Expected：FAIL，normalizer missing。鎖排序、OID/runtime排除、ACL/RLS/default privileges保留、function body digest、fixed JSON keys/LF/terminal newline及同義輸入byte-identical。

**GREEN/stage/evidence**

```bash
git add -- \
  scripts/database-baseline/normalize-catalog.mjs \
  apps/web/tests/unit/midao-catalog-normalizer.test.mjs \
  apps/web/tests/fixtures/database-baseline/catalog-unstable-a.json \
  apps/web/tests/fixtures/database-baseline/catalog-unstable-b.json
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-catalog-normalizer.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `feat: 正規化 database catalog`。

## Task 5：ownership schema、template與validator

**Objective:** capture前只建立規則與fixtures，不假裝已知production inventory。

**Files:**
- Create: `scripts/database-baseline/validate-ownership-boundary.mjs`
- Create: `scripts/database-baseline/schemas/ownership-boundary.schema.json`
- Create: `scripts/database-baseline/schemas/role-map.schema.json`
- Create: `scripts/database-baseline/schemas/exclusions.schema.json`
- Create: `scripts/database-baseline/schemas/platform-prerequisites.schema.json`
- Create: `scripts/database-baseline/schemas/toc-ownership-map.schema.json`
- Create: `apps/web/tests/unit/midao-baseline-ownership.test.mjs`
- Create: `apps/web/tests/fixtures/database-baseline/ownership-template.json`

**RED**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-ownership.test.mjs
```

Expected：FAIL，validator missing。Tests涵蓋每個catalog object與TOC ID exactly once、dependency closure、overlap/missing/unknown、platform object誤建、app overlay整體排除、未批准exclusion。

**GREEN/stage/evidence**

```bash
git add -- \
  scripts/database-baseline/validate-ownership-boundary.mjs \
  scripts/database-baseline/schemas/ownership-boundary.schema.json \
  scripts/database-baseline/schemas/role-map.schema.json \
  scripts/database-baseline/schemas/exclusions.schema.json \
  scripts/database-baseline/schemas/platform-prerequisites.schema.json \
  scripts/database-baseline/schemas/toc-ownership-map.schema.json \
  apps/web/tests/unit/midao-baseline-ownership.test.mjs \
  apps/web/tests/fixtures/database-baseline/ownership-template.json
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-baseline-ownership.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `feat: 定義 baseline object ownership contract`。

## Task 6：catalog exact comparator

**Files:**
- Create: `scripts/database-baseline/compare-catalog.mjs`
- Create: `apps/web/tests/unit/midao-catalog-comparator.test.mjs`

**RED**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-catalog-comparator.test.mjs
```

Expected：FAIL，comparator missing。ACL、policy、function、trigger、index、constraint、extension、default privileges均逐identity比較；exclusion須exact identity＋field＋reason＋approval。

**GREEN/stage/evidence**

```bash
git add -- \
  scripts/database-baseline/compare-catalog.mjs \
  apps/web/tests/unit/midao-catalog-comparator.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-catalog-comparator.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `feat: 建立 database catalog exact comparator`。

## Task 7：secret-safe capture、TOC renderer與transactional publisher

**Objective:** 完成production capture工具，但此Task不連production。

**Files:**
- Create: `.gitattributes`（只為source-derived dry-run fixture保留協議所需的final blank framing）
- Create: `scripts/database-baseline/capture-production-catalog.mjs`
- Create: `scripts/database-baseline/render-baseline-from-archive.mjs`
- Create: `scripts/database-baseline/publish-baseline.mjs`
- Create: `scripts/database-baseline/verify-manifest.mjs`
- Create: `scripts/database-baseline/prepare-capture-publication.mjs`
- Create: `scripts/database-baseline/validate-normalized-catalog.mjs`
- Create: `scripts/database-baseline/schemas/capture-manifest.schema.json`
- Create: `scripts/database-baseline/schemas/baseline-manifest.schema.json`
- Create: `scripts/database-baseline/schemas/baseline-ledger.schema.json`
- Create: `apps/web/tests/integration/midao-baseline-publication.integration.test.mjs`
- Create: `apps/web/tests/unit/midao-production-catalog-capture.test.mjs`
- Create: `apps/web/tests/unit/midao-baseline-publisher.test.mjs`
- Create: `apps/web/tests/unit/midao-baseline-manifest.test.mjs`
- Create: `apps/web/tests/fixtures/database-baseline/supabase-dump-dry-run-redacted.txt`
- Create: `apps/web/tests/fixtures/database-baseline/pg17-toc.txt`
- Modify: `scripts/database-baseline/validate-ownership-boundary.mjs`
- Modify: `scripts/database-baseline/extract-catalog.mjs`
- Modify: `scripts/database-baseline/verify-toolchain-lock.mjs`
- Modify: `scripts/database-baseline/schemas/toolchain-lock.schema.json`
- Modify: `supabase/baselines/v1/toolchain-lock.json`
- Modify: `docs/plans/2026-07-24-as-built-database-baseline-design.md`
- Modify: `scripts/database-baseline/schemas/ownership-boundary.schema.json`
- Modify: `scripts/database-baseline/schemas/role-map.schema.json`
- Modify: `scripts/database-baseline/schemas/toc-ownership-map.schema.json`
- Modify: `apps/web/tests/unit/midao-baseline-ownership.test.mjs`
- Modify: `apps/web/tests/unit/midao-baseline-toolchain-lock.test.mjs`
- Modify: `apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs`
- Modify: `apps/web/tests/fixtures/database-baseline/ownership-template.json`
- Modify: `docs/plans/2026-07-24-as-built-database-baseline-implementation.md`

**RED**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/unit/midao-production-catalog-capture.test.mjs \
  apps/web/tests/unit/midao-baseline-publisher.test.mjs \
  apps/web/tests/unit/midao-baseline-manifest.test.mjs \
  apps/web/tests/unit/midao-baseline-ownership.test.mjs
```

Expected：FAIL，capture／renderer／publisher missing。Tests必須涵蓋：

- dry-run stdout bounded memory pipe，禁止named secret temp file；Buffer lifecycle、max bytes、timeout、shape injection、cross-chunk redaction；fixture grammar須由pinned Supabase CLI v2.87.2 embedded `pkg/migration/scripts/dump_schema.sh`與`noExec` source產生，僅使用synthetic credential values，禁止猜測或保存production output；
- remote strict read-only child env與locked PG17 image；所有`docker run`固定`--pull=never`，image消失只可fail closed，不得在identity check後隱式acquire；
- schema-only custom archive；structured TOC；
- A/B orchestrator同一in-memory unpredictable restrict key，exact `pg_restore --restrict-key` argv；random source回傳的任何Buffer在成功、型別或長度錯誤路徑均清零；
- exact framing parser只移除same-key首尾`\restrict/\unrestrict`，內部SQL bytes不變；
- 每個expected TOC ID exactly once；同一catalog object可對應多個TOC，明確允許的embedded catalog sections可無獨立TOC；`dependency-closure.json`逐entry direct/transitive closure、missing/extra/unknown/duplicate與A/B digest，並由composer衍生、consumer獨立重算`tocEntrySha256`、實際destination SQL digest及aggregate render binding；
- publisher A/B equality、handoff path/dev/inode/owner/mode recheck與symlink-swap拒絕、full output set＋ledger producer、exclusive temps、fsync/read-back；跨目錄publication採transaction-aware contract：固定13-path `payloadDigests`（排除manifest／ledger）、manifest倒數第二、ledger另含`captureManifestSha256`且最後作同`transactionId` commit marker；明確禁止manifest self-digest、ledger self-digest、missing／extra payload path；
- publication先取得repo-common singleton lock再recover journal；lock authority為已驗證git-common directory inode的FD-backed `flock`，不建立／信任／刪除可替換lock pathname，跨worktree與lock-path replacement競爭者仍命中同directory inode；journal採exclusive no-follow 0600 current-owner nlink1 stable inode append-only checksummed records，禁止`.next` rename replacement；截斷尾record回復最後完整record，完整checksum錯誤HOLD，每次append前後核FD/path identity，foreign replacement不覆寫；publisher unit全部在disposable Git repo＋雙worktree執行，禁止讀寫真repo common state；publisher限可信任專用operator／CI UID，惡意same-UID程序明定out of scope，但意外非合作pathname occupation仍fail closed；pre-existing targets以`RENAME_NOREPLACE`直接detach至同目錄durable rollback inode，temp promotion與rollback restore同樣只用NOREPLACE，任何目的pathname占用都不得覆蓋並HOLD；temp／backup／journal及各parent directory在首次mutation前fsync；journal exact `PREPARED/PROMOTING/COMMITTED/CLEANED`，每個record／rename／fsync boundary crash皆idempotent recovery；promotion、normal read-back與COMMITTED recovery逐target綁temp/promoted inode identity再驗digest/semantic，same-content foreign inode仍HOLD；只有exact ledger commit marker加13-payload digest/semantic重驗視為committed，否則identity-safe rollback；ledger basename固定`baseline-ledger.json`並在side effect前拒絕；second-target rename failure、recovery內second crash與partial cleanup保留完整error chain；
- manifest strict schema、digests、secret/restrict-key/raw argv拒絕；SQL statement-state scan拒絕top-level、data-modifying CTE及`EXPLAIN`包裝的COPY/INSERT/UPDATE/DELETE/MERGE，同時不誤拒GRANT UPDATE與FK ON DELETE；transaction verifier拒絕manifest／ledger transaction不一致、13-path集合不完整、unfinished journal與identity/digest mismatch；Task 8＋後續所有consumer在讀payload前必須通過此gate；
- `validate-ownership-boundary.mjs --candidate-handoff` Task 8 caller integration須在本Task以mock handoff RED→GREEN鎖定，不得只保留`--input` CLI。

**Fresh security review gate**

本Task code在任何production capture前需fresh SECURITY review PASS、blocking 0。

**GREEN/stage/evidence**

```bash
git add -- \
  .gitattributes \
  scripts/database-baseline/capture-production-catalog.mjs \
  scripts/database-baseline/render-baseline-from-archive.mjs \
  scripts/database-baseline/publish-baseline.mjs \
  scripts/database-baseline/verify-manifest.mjs \
  scripts/database-baseline/prepare-capture-publication.mjs \
  scripts/database-baseline/validate-normalized-catalog.mjs \
  scripts/database-baseline/extract-catalog.mjs \
  scripts/database-baseline/verify-toolchain-lock.mjs \
  scripts/database-baseline/schemas/toolchain-lock.schema.json \
  supabase/baselines/v1/toolchain-lock.json \
  docs/plans/2026-07-24-as-built-database-baseline-design.md \
  scripts/database-baseline/schemas/capture-manifest.schema.json \
  scripts/database-baseline/schemas/baseline-manifest.schema.json \
  scripts/database-baseline/schemas/baseline-ledger.schema.json \
  scripts/database-baseline/schemas/ownership-boundary.schema.json \
  scripts/database-baseline/schemas/role-map.schema.json \
  scripts/database-baseline/schemas/toc-ownership-map.schema.json \
  apps/web/tests/integration/midao-baseline-publication.integration.test.mjs \
  apps/web/tests/unit/midao-production-catalog-capture.test.mjs \
  apps/web/tests/unit/midao-baseline-publisher.test.mjs \
  apps/web/tests/unit/midao-baseline-manifest.test.mjs \
  apps/web/tests/fixtures/database-baseline/supabase-dump-dry-run-redacted.txt \
  apps/web/tests/fixtures/database-baseline/pg17-toc.txt \
  scripts/database-baseline/validate-ownership-boundary.mjs \
  apps/web/tests/unit/midao-baseline-ownership.test.mjs \
  apps/web/tests/unit/midao-baseline-toolchain-lock.test.mjs \
  apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs \
  apps/web/tests/fixtures/database-baseline/ownership-template.json \
  docs/plans/2026-07-24-as-built-database-baseline-implementation.md
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh \
  apps/web/tests/unit/midao-production-catalog-capture.test.mjs \
  apps/web/tests/unit/midao-baseline-publisher.test.mjs \
  apps/web/tests/unit/midao-baseline-manifest.test.mjs \
  apps/web/tests/unit/midao-baseline-ownership.test.mjs \
  apps/web/tests/unit/midao-baseline-toolchain-lock.test.mjs \
  apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs \
  apps/web/tests/integration/midao-baseline-publication.integration.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `feat: 建立安全的 baseline capture與publisher`。

## Task 8：兩次唯讀production capture與cutoff publication

**Objective:** 取得production cutoff truth、actual ownership、rendered baseline與known drift。本Task不執行production write。

**Generated by one guarded publisher transaction:**
- Create: `supabase/baselines/v1/baseline.sql`
- Create: `supabase/baselines/v1/managed-overlays.sql`
- Create: `supabase/baselines/v1/capture-manifest.json`
- Create: `supabase/baselines/v1/catalog.cutoff.normalized.json`
- Create: `supabase/baselines/v1/toc.normalized.json`
- Create: `supabase/baselines/v1/use-list.txt`
- Create: `supabase/baselines/v1/toc-ownership-map.json`
- Create: `supabase/baselines/v1/dependency-closure.json`
- Create: `supabase/baselines/v1/role-map.json`
- Create: `supabase/baselines/v1/ownership-boundary.json`
- Create: `supabase/baselines/v1/exclusions.json`
- Create: `supabase/baselines/v1/platform-prerequisites.json`
- Create: `supabase/baselines/v1/security-drift.json`
- Create: `supabase/baselines/v1/catalog-cutoff.sha256`
- Create: `docs/operations/baseline-ledger.json`

**Created manually only after successful publication:**
- Create: `apps/web/tests/unit/midao-baseline-cutoff-artifact.test.mjs`

Publisher owns the full baseline-directory output set plus `docs/operations/baseline-ledger.json`. It prepares/fsyncs/read-backs every temp target before promotion；multi-target rename failure必須依captured dev/inode identity rollback已promoted targets，rollback failure保留primary＋cleanup errors並non-zero。Acceptance test不是publisher output。

**Preflight**

- Task 7 exact HEAD SECURITY review PASS。
- Toolchain lock read-back PASS。
- Worktree clean、兩個stash identities read-back、frozen bytes PASS。

**Tracked read-only A/B capture**

以background執行exact command；capture wrapper在`.hermes/tmp`下exclusive建立random candidate dir，將path＋dev/inode＋owner/mode寫入固定handoff，handoff本身exclusive create＋fsync：

```bash
timeout --signal=TERM 570s node scripts/database-baseline/capture-production-catalog.mjs \
  --project-ref pyoderxmpeyqjwkeliiu \
  --captures 2 \
  --output-candidate-root .hermes/tmp \
  --handoff .hermes/tmp/baseline-capture-handoff.json
```

Expected：exit 0；normalized cutoff catalog／TOC A/B byte-identical；raw archives與metadata candidate留在owned temp供review，credential從未落盤；production write count zero。

**Ownership review與atomic publish**

1. 逐物件review candidate `ownership-boundary`、role map、exclusions、platform prerequisites與TOC map；unknown／missing為HOLD。
2. 執行：

```bash
node scripts/database-baseline/validate-ownership-boundary.mjs \
  --candidate-handoff .hermes/tmp/baseline-capture-handoff.json
node scripts/database-baseline/publish-baseline.mjs \
  --candidate-handoff .hermes/tmp/baseline-capture-handoff.json \
  --output supabase/baselines/v1 \
  --ledger docs/operations/baseline-ledger.json
```

3. Publisher才使用reviewed use-list render A/B SQL並要求byte-identical，完成secret/data/syntax scans、fsync/read-back與atomic promotion；成功後刪除raw archives與owned temp。

**Post-implementation artifact acceptance**

Task 7已對publisher行為完成RED→GREEN；本Task的真production artifacts無法在capture前存在，因此不偽造TDD RED。Capture／publish成功後人工建立read-back acceptance test；此test在第一次open任何13-path payload前必須import並呼叫`verify-manifest.mjs` transaction verifier，以open spy證明unfinished journal、ledger／transactionId mismatch、manifest digest或任一payload digest mismatch時payload reads=0。Verifier PASS後才要求actual complete set、`dependency-closure.json`逐entry closure與A/B digest、59-table drift digest、`catalog_equivalent=true`與`security_policy_status=known_drift`分離、baseline ledger不冒充apply。測試失敗即拒絕artifact commit。

**Stage/evidence**

```bash
git add -- \
  supabase/baselines/v1/baseline.sql \
  supabase/baselines/v1/managed-overlays.sql \
  supabase/baselines/v1/capture-manifest.json \
  supabase/baselines/v1/catalog.cutoff.normalized.json \
  supabase/baselines/v1/toc.normalized.json \
  supabase/baselines/v1/use-list.txt \
  supabase/baselines/v1/toc-ownership-map.json \
  supabase/baselines/v1/dependency-closure.json \
  supabase/baselines/v1/role-map.json \
  supabase/baselines/v1/ownership-boundary.json \
  supabase/baselines/v1/exclusions.json \
  supabase/baselines/v1/platform-prerequisites.json \
  supabase/baselines/v1/security-drift.json \
  supabase/baselines/v1/catalog-cutoff.sha256 \
  docs/operations/baseline-ledger.json \
  apps/web/tests/unit/midao-baseline-cutoff-artifact.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-baseline-cutoff-artifact.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `feat: 發布 production cutoff baseline artifacts`。

## Task 9：single-marker fresh materializer

**Objective:** `baseline.sql`＋overlay組成單一synthetic migration，exact history無額外overlay row。

**Files:**
- Create: `scripts/database-baseline/materialize-fresh-workdir.mjs`
- Create: `apps/web/tests/unit/midao-baseline-materializer.test.mjs`

**RED**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-baseline-materializer.test.mjs
```

Expected：FAIL，materializer missing。Tests鎖：

- 在第一次open `baseline.sql`、overlay、capture manifest所列payload或post-cutoff source前，materializer必須import並呼叫`verify-manifest.mjs`驗證capture transaction；unfinished journal、ledger／transactionId mismatch或digest mismatch以open spy證明payload reads=0；
- single synthetic baseline file內固定boundary前後包含兩個artifacts；
- one baseline history marker only；overlay marker／128 fake cutoff rows／extra row拒絕；
- 6支post-cutoff exact filename/digest/order；future manifest selection；
- symlink/hardlink/path replacement、rollback排除、seed分離、cleanup ownership。

**GREEN/stage/evidence**

```bash
git add -- \
  scripts/database-baseline/materialize-fresh-workdir.mjs \
  apps/web/tests/unit/midao-baseline-materializer.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-baseline-materializer.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `feat: 建立single-marker fresh baseline workdir`。

## Task 10：建立expected-terminal truth artifact

**Objective:** 在self-owned pinned local stack將cutoff baseline＋6支Midao materialize，兩次extract後發布terminal右側真相。

**Builder source files:**
- Create: `scripts/database-baseline/build-expected-terminal.mjs`
- Create: `apps/web/tests/unit/midao-expected-terminal-builder.test.mjs`
- Create: `scripts/database-baseline/publish-expected-terminal.mjs`
- Create: `apps/web/tests/unit/midao-expected-terminal-publisher.test.mjs`
- Modify: `scripts/testing/with-midao-local-supabase.mjs`
- Modify: `apps/web/tests/unit/midao-local-supabase-runner.test.mjs`
- Modify: `scripts/database-baseline/materialize-fresh-workdir.mjs`
- Modify: `apps/web/tests/unit/midao-baseline-materializer.test.mjs`
- Modify: `docs/plans/2026-07-24-as-built-database-baseline-implementation.md`（同步實際dependency closure與evidence argv）

**Generated by one guarded local expected-terminal publication transaction:**
- Create: `supabase/baselines/v1/catalog.expected-terminal.normalized.json`
- Create: `supabase/baselines/v1/catalog-expected-terminal.sha256`
- Create: `supabase/baselines/v1/manifest.json`
- Create: `docs/operations/expected-terminal-ledger.json`

`docs/operations/baseline-ledger.json`是Task 8 immutable capture commit marker，Task 10禁止修改。Expected-terminal transaction使用獨立ledger：final manifest與expected-terminal ledger共享exact 2-path `payloadDigests`（catalog＋digest，排除manifest／ledger），expected-terminal ledger另含`manifestSha256`及immutable capture transactionId／captureManifestSha256 reference。它套用Task 7同一套lock-before-recovery、worktree journal、durable rollback copies、file＋parent fsync、四態recovery與foreign replacement HOLD。

**Created manually only after successful publication:**
- Create: `apps/web/tests/unit/midao-expected-terminal-artifact.test.mjs`

Builder owns all four generated/updated targets；先prepare/fsync/read-back temps，再依captured identity promotion；任一rename failure rollback本次已promoted targets，rollback failure non-zero且保留完整error chain。Acceptance test不是builder output。

**RED**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-expected-terminal-builder.test.mjs
```

Expected：FAIL，builder missing。Mock tests要求在第一次open任何capture payload前import `verify-manifest.mjs`並驗immutable capture transaction，invalid journal／ledger／digest時open spy證明payload reads=0；其後才可使用D3a local wrapper、loopback only、拒絕production ref/linked/remote/ambient DB env、每次apply identity recheck、兩個clean local runs terminal bytes一致、final manifest strict digests與exact history set。Expected-terminal publisher另以fault injection鎖同一transaction protocol：lock-before-recovery、2-path payload map、manifest倒二、獨立ledger最後、每個rename/fsync boundary recovery、second-target failure rollback；並證明capture ledger bytes／identity從未被修改。

**Code commit stage/evidence**

```bash
git add -- \
  scripts/database-baseline/build-expected-terminal.mjs \
  scripts/database-baseline/publish-expected-terminal.mjs \
  scripts/testing/with-midao-local-supabase.mjs \
  scripts/database-baseline/materialize-fresh-workdir.mjs \
  apps/web/tests/unit/midao-expected-terminal-builder.test.mjs \
  apps/web/tests/unit/midao-expected-terminal-publisher.test.mjs \
  apps/web/tests/unit/midao-local-supabase-runner.test.mjs \
  apps/web/tests/unit/midao-baseline-materializer.test.mjs \
  docs/plans/2026-07-24-as-built-database-baseline-implementation.md
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh \
    apps/web/tests/unit/midao-expected-terminal-builder.test.mjs \
    apps/web/tests/unit/midao-expected-terminal-publisher.test.mjs \
    apps/web/tests/unit/midao-local-supabase-runner.test.mjs \
    apps/web/tests/unit/midao-baseline-materializer.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
git commit -m "feat: 建立 expected terminal builder"
```

**Heavy local publication**

```bash
timeout --signal=TERM 570s node scripts/database-baseline/build-expected-terminal.mjs \
  --runs 2 \
  --baseline supabase/baselines/v1 \
  --publish-dir supabase/baselines/v1 \
  --capture-ledger docs/operations/baseline-ledger.json \
  --ledger docs/operations/expected-terminal-ledger.json
```

Expected：兩個clean local runs terminal catalog byte-identical，history exact；capture transaction verifier先PASS；同一guarded expected-terminal transaction產生catalog、digest、final manifest與獨立expected-terminal ledger，全部read-back／file＋parent fsync PASS後才promotion；capture ledger byte-identical未變；cleanup PASS。

**Artifact acceptance stage/evidence**

Builder behavior已在前一commit完成RED→GREEN；actual two-run artifact屬post-implementation acceptance，不偽造RED。Publication完成後建立read-back test；在open expected-terminal payload前依序驗immutable capture transaction與expected-terminal transaction，unfinished journal、任一ledger／manifest／digest mismatch時open spy證明兩組payload reads=0；PASS後才驗terminal digest、capture-manifest reference、exact history set與security status。

```bash
git add -- \
  supabase/baselines/v1/catalog.expected-terminal.normalized.json \
  supabase/baselines/v1/catalog-expected-terminal.sha256 \
  supabase/baselines/v1/manifest.json \
  docs/operations/expected-terminal-ledger.json \
  apps/web/tests/unit/midao-expected-terminal-artifact.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-expected-terminal-artifact.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `feat: 發布 expected terminal catalog`。

## Task 11：fresh-install runner與tracked heavy prefix

**Files:**
- Create: `scripts/database-baseline/run-fresh-install.mjs`
- Create: `apps/web/tests/unit/midao-fresh-runner-contract.test.mjs`
- Create: `apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs`
- Modify: `scripts/testing/verify-staged-check-evidence.mjs`
- Modify: `apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs`
- Modify: `docs/plans/2026-07-22-midao-package-01-foundation-shell.md`

**RED 1 — runner lifecycle**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-fresh-runner-contract.test.mjs
```

Expected：FAIL，runner missing。Tests鎖runner在第一次open materialized baseline／manifest payload前import `verify-manifest.mjs`並依序驗capture＋expected-terminal transactions；unfinished任一journal、ledger／transactionId／digest mismatch時open spy證明payload reads=0。Verifier PASS後才允許D3a wrapper、empty-only、loopback/identity、single marker、exact history、expected-terminal compare、cleanup。

**RED 2 — heavy allowlist**

擴充verifier test後立即執行：

```bash
node --test --test-concurrency=1 \
  apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
```

Expected：FAIL，fresh runner exact heavy command尚未allowlist；syntax/import error、0 tests或其他既有assertion failure不算此RED。Minimal GREEN只加入完整literal command：

```text
timeout --signal=TERM 570s node scripts/database-baseline/run-fresh-install.mjs --test apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs
```

拒絕env prefix、alternate node、extra flags、path traversal或其他test path；package全域allowlist同commit同步。

**Stage/ordinary evidence**

```bash
git add -- \
  scripts/database-baseline/run-fresh-install.mjs \
  apps/web/tests/unit/midao-fresh-runner-contract.test.mjs \
  apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs \
  scripts/testing/verify-staged-check-evidence.mjs \
  apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs \
  docs/plans/2026-07-22-midao-package-01-foundation-shell.md
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh \
  apps/web/tests/unit/midao-fresh-runner-contract.test.mjs \
  apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
```

**Heavy acceptance＋check-only**

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s node scripts/database-baseline/run-fresh-install.mjs \
  --test apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

Expected：fresh terminal exact compare expected-terminal；overlay extra history不存在；cleanup PASS。

**Commit:** `test: 驗證 baseline fresh install`。

## Task 12：existing-lane local-only rehearsal

**Files:**
- Create: `scripts/database-baseline/run-existing-upgrade-rehearsal.mjs`
- Create: `apps/web/tests/unit/midao-existing-runner-contract.test.mjs`
- Create: `apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs`
- Modify: `scripts/testing/verify-staged-check-evidence.mjs`
- Modify: `apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs`
- Modify: `docs/plans/2026-07-22-midao-package-01-foundation-shell.md`

**RED 1 — local-only lifecycle**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-existing-runner-contract.test.mjs
```

Expected：FAIL，runner missing。Tests要求runner在第一次open baseline／terminal truth／migration payload前import `verify-manifest.mjs`並依序驗capture＋expected-terminal transactions；unfinished journal、任一ledger／digest mismatch時open spy證明payload reads=0。Verifier PASS後才可由fixture builder建立occupied cutoff-shaped local DB；upgrade runner baseline execution count=0；拒絕empty、baseline marker、production ref、linked、remote host、ambient DB env；每次apply前owned identity read-back。

**RED 2 — exact heavy prefix**

擴充verifier test後立即執行：

```bash
node --test --test-concurrency=1 \
  apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
```

Expected：FAIL，existing runner exact heavy command尚未allowlist；syntax/import error、0 tests或其他既有assertion failure不算此RED。Minimal GREEN只加入：

```text
timeout --signal=TERM 570s node scripts/database-baseline/run-existing-upgrade-rehearsal.mjs --test apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs
```

**Stage/ordinary/heavy evidence**

```bash
git add -- \
  scripts/database-baseline/run-existing-upgrade-rehearsal.mjs \
  apps/web/tests/unit/midao-existing-runner-contract.test.mjs \
  apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs \
  scripts/testing/verify-staged-check-evidence.mjs \
  apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs \
  docs/plans/2026-07-22-midao-package-01-foundation-shell.md
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh \
  apps/web/tests/unit/midao-existing-runner-contract.test.mjs \
  apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s node scripts/database-baseline/run-existing-upgrade-rehearsal.mjs \
  --test apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

Expected：existing terminal獨立exact compare expected-terminal；fresh↔existing exact；upgrade階段baseline execution count=0。

**Commit:** `test: 驗證existing post-cutoff upgrade`。

## Task 13：拆分並接線source／release gates

**Files:**
- Modify: `scripts/check-migration-ledger.mjs`
- Create: `scripts/check-migration-source-gate.mjs`
- Modify: `scripts/preflight-check.sh`
- Modify: `.github/workflows/migration-drift-detect.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs`
- Create: `apps/web/tests/unit/migration-source-gate.test.mjs`
- Create: `apps/web/tests/unit/migration-gate-callers.test.mjs`
- Modify: `docs/operations/migration-apply-ledger-sop.md`

**RED**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs \
  apps/web/tests/unit/migration-source-gate.test.mjs \
  apps/web/tests/unit/migration-gate-callers.test.mjs
```

Expected：FAIL，source gate/caller wiring missing。Tests要求：

- source／verified gates與所有workflow/local callers在第一次open baseline ledger／manifest／payload前import `verify-manifest.mjs`並依序驗capture＋expected-terminal transactions；hostile unfinished journal、ledger／digest mismatch fixture以open spy要求payload reads=0；
- PR與local preflight明確source mode；
- scheduled/manual drift及post-apply明確verified mode；
- workflow path filters包含baseline scripts/artifacts/tests；
- source mode允許new unverified post-cutoff但要求hash/order/source tests；
- verified mode對missing/pending/fake verified FAIL；
- baseline ledger不得冒充production ledger。

**GREEN/stage/evidence**

```bash
git add -- \
  scripts/check-migration-ledger.mjs \
  scripts/check-migration-source-gate.mjs \
  scripts/preflight-check.sh \
  .github/workflows/migration-drift-detect.yml \
  .github/workflows/ci.yml \
  apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs \
  apps/web/tests/unit/migration-source-gate.test.mjs \
  apps/web/tests/unit/migration-gate-callers.test.mjs \
  docs/operations/migration-apply-ledger-sop.md
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh \
  apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs \
  apps/web/tests/unit/migration-source-gate.test.mjs \
  apps/web/tests/unit/migration-gate-callers.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `fix: 接線migration source與release gates`。

## Task 14：接回D3與E4真實驗證

**Files:**
- Modify: `scripts/testing/with-midao-local-supabase.mjs`
- Modify: `apps/web/tests/unit/midao-local-supabase-runner.test.mjs`
- Create from E4 stash path-scoped restore: `scripts/testing/run-midao-e2e.sh`
- Create from E4 stash path-scoped restore: `scripts/testing/run-midao-legacy-e2e-compat.sh`
- Modify from E4 stash only: `apps/web/e2e/helpers.ts`
- Modify from E4 stash only: `apps/web/playwright.config.ts`
- Modify from E4 stash only: `supabase/seed.sql`
- Create from E4 stash: `apps/web/tests/security/midao-e2e-auth-seam.test.mjs`
- Create: `apps/web/e2e/midao-navigation.spec.ts`
- Create: `apps/web/e2e/midao-auth-and-impersonation.spec.ts`

禁止apply/pop D3b stash；E4只path-scoped restore。

**RED**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/unit/midao-local-supabase-runner.test.mjs \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs
```

Expected：runner仍synthetic 6-file／seed disabled、E2E seam未接baseline，或runner在第一次open baseline／seed／E2E payload前未import `verify-manifest.mjs`依序驗capture＋expected-terminal transactions，為真assertion failure。Hostile unfinished journal、ledger／digest mismatch fixtures必以open spy證明payload reads=0；只有雙transaction verifier PASS後才可建立local stack／讀seed／啟E2E。

**GREEN/stage/ordinary evidence**

```bash
git add -- \
  scripts/testing/with-midao-local-supabase.mjs \
  apps/web/tests/unit/midao-local-supabase-runner.test.mjs \
  scripts/testing/run-midao-e2e.sh \
  scripts/testing/run-midao-legacy-e2e-compat.sh \
  apps/web/e2e/helpers.ts \
  apps/web/playwright.config.ts \
  supabase/seed.sql \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs \
  apps/web/e2e/midao-navigation.spec.ts \
  apps/web/e2e/midao-auth-and-impersonation.spec.ts
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/unit/midao-local-supabase-runner.test.mjs \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs
```

**Heavy acceptance**

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
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-legacy-e2e-compat.sh \
  apps/web/e2e/t1-login.spec.ts
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

**Commit:** `test: 以baseline驗證Midao Postgres與E2E`。

## Task 15：Final regression、review與雙寫

**Files:**
- Create: `apps/web/tests/unit/midao-baseline-final-gate.test.mjs`
- Modify: `docs/operations/worklogs/issue1756.md`
- Modify: `docs/plans/2026-07-22-midao-package-01-foundation-shell.md`

### G1 focused baseline union（regression，不冒充staged evidence）

固定Node22執行：

```bash
node --test --test-concurrency=1 \
  apps/web/tests/unit/midao-baseline-final-gate.test.mjs
node --test --test-concurrency=1 \
  apps/web/tests/unit/midao-baseline-toolchain-lock.test.mjs \
  apps/web/tests/unit/midao-baseline-frozen-history.test.mjs \
  apps/web/tests/unit/midao-catalog-extractor-contract.test.mjs \
  apps/web/tests/unit/midao-catalog-normalizer.test.mjs \
  apps/web/tests/unit/midao-baseline-ownership.test.mjs \
  apps/web/tests/unit/midao-catalog-comparator.test.mjs \
  apps/web/tests/unit/midao-production-catalog-capture.test.mjs \
  apps/web/tests/unit/midao-baseline-publisher.test.mjs \
  apps/web/tests/unit/midao-baseline-cutoff-artifact.test.mjs \
  apps/web/tests/unit/midao-baseline-manifest.test.mjs \
  apps/web/tests/unit/midao-baseline-materializer.test.mjs \
  apps/web/tests/unit/midao-expected-terminal-builder.test.mjs \
  apps/web/tests/unit/midao-expected-terminal-artifact.test.mjs \
  apps/web/tests/unit/midao-fresh-runner-contract.test.mjs \
  apps/web/tests/unit/midao-existing-runner-contract.test.mjs \
  apps/web/tests/unit/migration-source-gate.test.mjs \
  apps/web/tests/unit/migration-gate-callers.test.mjs \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs
npm run typecheck
```

Expected：在任何focused test／typecheck open baseline payload前，`midao-baseline-final-gate.test.mjs`先import `verify-manifest.mjs`並依序驗capture＋expected-terminal transactions；hostile unfinished journal、任一ledger／transactionId／digest mismatch時open spy證明payload reads=0。雙transaction PASS後其餘全部exit 0，test counts > 0。

### G2/G3 heavy

重跑Tasks 11、12、14的fresh／existing／D3／Midao E2E／legacy E2E exact commands，各自保存exit與counts。

### G4 full gates

各自tracked background＋570秒：

```bash
timeout --signal=TERM 570s env NODE_ENV=test \
  GUIDE_SESSION_SECRET='midao-local-test-secret-at-least-32-bytes' \
  NODE_OPTIONS='--experimental-strip-types' \
  .claude/hooks/run-checks.sh --all
timeout --signal=TERM 570s node scripts/testing/run-midao-ci-command.mjs lint
timeout --signal=TERM 570s node scripts/testing/run-midao-ci-command.mjs typecheck
timeout --signal=TERM 570s node scripts/testing/run-midao-ci-command.mjs build
```

Integration DB tests不得由ordinary full suite誤當local DB PASS；其權威證據只來自G2專用runner。

### Final staged evidence

先寫`midao-baseline-final-gate.test.mjs`，assert worklog／package plan列出actual digests、commands、exits、counts、review anchors及remaining production apply HOLD；先跑RED，再更新docs至GREEN。

```bash
git add -- \
  apps/web/tests/unit/midao-baseline-final-gate.test.mjs \
  docs/operations/worklogs/issue1756.md \
  docs/plans/2026-07-22-midao-package-01-foundation-shell.md
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-baseline-final-gate.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
```

### Fresh reviews

對同一exact HEAD執行SPEC、QUALITY/SECURITY與EXECUTABILITY／baseline architecture review；timeout為INCONCLUSIVE，blocking非零回修。

### 雙寫

- Worklog：exact argv、Node/CLI/PG versions、tree/SHA、exit/count、cutoff/terminal digests、security drift status、review blocking count。
- GitHub issue：同一里程碑摘要與remaining HOLD。
- 不push／PR／merge／deploy／production apply，除非owner另行授權。

**Commit:** `docs: 完成baseline驗收證據`。

## Definition of Done

只有design v2 §19全部成立，才能宣告baseline v1完成。Production Midao migration apply仍是獨立授權步驟。
