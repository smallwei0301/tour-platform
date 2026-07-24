# Issue #1756 — Midao Foundation + Shell TDD Micro-plan

> **Status:** Active；2026-07-24依owner決策修訂D3b fresh-install架構。Frozen migration replay路線已停止，改採catalog-verified as-built baseline。
>
> **Execution skill:** `subagent-driven-development`; one fresh implementer per task, then independent spec and quality review.
>
> **Parent:** Epic #1755
>
> **Product design:** `docs/superpowers/specs/2026-07-22-midao-backend-design.md`
>
> **As-built baseline design:** `docs/plans/2026-07-24-as-built-database-baseline-design.md`
>
> **As-built baseline implementation plan:** `docs/plans/2026-07-24-as-built-database-baseline-implementation.md`
>
> **Master roadmap:** `docs/plans/2026-07-22-midao-backend-implementation.md`

## Goal

建立 Midao 可安全開工的共同地基與第一個可導航 shell：

- additive backend-mode、outbox、durable idempotency schema；
- atomic admin backend-mode switch；
- guide HMAC session version、canonical runtime DB guard、kill switches；
- signed admin-impersonation actor audit；
- V2 query/command wrapper；
- login/impersonation canonical redirect；
- Brand Book tokens、五項導航、mobile/desktop shell、loading/error skeleton；
- 真實 local Postgres migration/RPC integration gate；
- 能通過 server layout HMAC＋DB guard 的真實 Playwright guide session。

## Architecture

新 `/midao` UI 位於 non-locale route group，page/layout只組裝feature screen；所有安全判斷集中於canonical guide-session boundary，所有新API經V2 query/command wrappers。Shared schema依序建立outbox、scoped durable idempotency與transactional audit，再由單一service-role RPC原子切換backend mode。

Database fresh-install採雙軌：existing production只套cutoff後additive migrations；fresh環境由Supabase platform bootstrap套`supabase/baselines/v1`、再套6支Midao及未來post-cutoff migrations。兩軌使用同一catalog extractor/comparator驗terminal schema；baseline永遠不進production migration discovery。Local Postgres與Playwright共用self-owned Supabase runner，禁止依賴production或前一個gate殘留狀態。

## Tech Stack

Next.js 15 App Router、React 19、TypeScript、Node 22 `node:test`、Supabase/PostgreSQL RPC與RLS、Playwright Chromium、CSS Brand Book tokens、Git worktrees與repo harness evidence。

## Explicit non-goals

- 不實作 home/requests/services/inquiry/calendar/public-page business screens。
- 不加 legacy mutation fences；各領域在對應 package 收斂，#1756 只提供可重用的 mode-fence helper。
- 不改 `apps/web/middleware.ts`；所有 `/midao` page/API guard 走 server boundary。
- 不套 production migration、不執行 production SQL、不切正式 guide mode。
- 不 push、開 PR、merge 或 deploy，除非使用者另行批准。

## Frozen/high-risk boundaries

- 禁止修改：`apps/web/middleware.ts`、既有 migrations、legacy orders/payments、protected E2E、`CLAUDE.md`、`.claude/**`。
- 高風險但本 package 可改：`apps/web/src/lib/guide-auth.ts`、guide login/session、admin impersonation route、Playwright config/helpers。
- 新 migration 時間戳固定且單調：
  - `20260723000000_midao_backend_mode.sql`
  - `20260723001000_midao_notification_outbox.sql`
  - `20260723002000_midao_idempotency_records.sql`
  - `20260723002500_midao_audit_events.sql`
  - `20260723003000_midao_atomic_backend_mode_switch.sql`
  - `20260723003500_midao_service_role_acl_hardening.sql`

## TDD/evidence protocol for every code commit

1. 先只寫test，執行focused RED command。
2. RED必須因需求尚未存在而失敗；syntax/import/path/0 tests不算。
3. 寫最小production change，`git add`本task所有intended files。
4. 用staged-check orchestrator執行task明列的GREEN/harness command：

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
```

5. Orchestrator在child前後驗證相同 `git write-tree`；同一tree hash可由多次 `--run`/`--run-heavy`追加evidence bundle entries，每entry獨立保存exact spawned `childArgv`、covered test paths、derived `expectedEvidenceCmd`（heavy則保存sanitized child exit）與epoch。Tree或staged path/status/blob manifest一變就清空整包。`--check-only`要求bundle內covered paths的union涵蓋全部staged tests；每個bundle至少有一個ordinary entry，heavy不能取代ordinary。一般 `--run`只接受repo `run-checks.sh`＋literal staged test paths；regression/full suite與commit staged evidence分開。

Tracked heavy只允許五個完整literal commands：三個既有Bash runners，以及下列兩個Node runners：

- `timeout --signal=TERM 570s node scripts/database-baseline/run-fresh-install.mjs --test apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs`
- `timeout --signal=TERM 570s node scripts/database-baseline/run-existing-upgrade-rehearsal.mjs --test apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs`

Node prefixes只能帶上述唯一`--test`與exact path；拒絕env prefix、alternate node、extra flags、其他test path、path traversal與其他`database-baseline/*.mjs`。在Tasks 11／12以ordinary staged verifier tests先完成對應allowlist code change後，才可使用各Node heavy command。
6. 它同時拒絕tracked unstaged code與 `git ls-files --others --exclude-standard`列出的untracked code/test/config/script；docs-only例外不得涵蓋 `.ts/.tsx/.mjs/.sql/.sh/.json/.toml`等可執行/config paths。
7. Commit前最後執行：

```bash
node scripts/testing/verify-staged-check-evidence.mjs --check-only
git diff --cached --check
git diff --cached --stat
```

`--check-only`必須確認current tree hash、current staged paths與manifest完全相同、evidence未逾30分鐘、無unstaged/untracked code drift。任何變更後都必須重跑 `--run`，不能只更新manifest。
8. Read-back staged diff，才可commit。這是必要補強，因現有frozen `bash-guard.sh`對code-staged判斷反向，實際會提早放行。

Playwright、Supabase reset、build、full suites一律用 tracked background＋`timeout --signal=TERM 570s`。

---

# Phase A — Preflight and baselines

## Task A1: 建立 fresh implementation worktree與 worklog anchor

**Prerequisite:** 本 micro-plan fresh review PASS；#1756 已成為唯一 `agent:now + status:ready`。

**Commands:**

```bash
timeout --signal=TERM 570s git fetch --prune origin
git worktree add /root/.hermes/worktrees/tour-platform/issue1756-midao-foundation \
  -b feat/issue-1756-midao-foundation origin/main
```

`git fetch/worktree add` 使用 tracked background。確認：

```bash
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor origin/main HEAD
```

**Node/dependency/test-env preflight（每個新 shell session重跑；不得假設 nvm、ambient PATH或parent npm config可信）：** A1無條件從original lock重建dependencies；不得因 `node_modules`或單一dependency已存在而跳過。先要求完整tracked/untracked worktree clean，禁止repo/app `.npmrc` regular file或symlink，保存三個manifest/lock SHA；stale sentinel必須被 `npm ci`移除。`env -i`不繼承parent PATH、HOME、npm config、credentials或proxy；只傳固定allowlist。Cache位於runner-owned git metadata，registry與install flags固定。整個preflight/install/postflight是同一個fail-fast shell block：

```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
NODE22_BIN='/root/.hermes/home/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node'
NPM_ENTRY='/usr/local/lib/node_modules/npm/bin/npm-cli.js'
SUPABASE_BIN='/root/.hermes/toolchains/supabase/2.87.2/supabase'
SUPABASE_SHA256='e325dd50b274e88fd1416f93b9e063902827ae326d356ab7f9dc604c3eba5c59'
MIN_PATH="$(dirname "$NODE22_BIN"):/usr/local/bin:/usr/bin:/bin"

for executable in "$NODE22_BIN" "$NPM_ENTRY" "$SUPABASE_BIN"; do
  test -f "$executable"
  test ! -L "$executable"
  test -x "$executable"
  EXEC_MODE="$(stat -c '%A' "$executable")"
  test "${EXEC_MODE:5:1}" != 'w'
  test "${EXEC_MODE:8:1}" != 'w'
done
test "$($NODE22_BIN -p "process.versions.node")" = '22.23.1'
test "$(PATH="$MIN_PATH" "$NPM_ENTRY" --version)" = '11.9.0'
test "$(sha256sum "$SUPABASE_BIN" | cut -d' ' -f1)" = "$SUPABASE_SHA256"
test "$($SUPABASE_BIN --version 2>/dev/null)" = '2.87.2'

export PATH="$MIN_PATH"
export NODE_ENV=test
export GUIDE_SESSION_SECRET='midao-local-test-secret-at-least-32-bytes'
export NODE_OPTIONS='--experimental-strip-types'
node --version
npm --version

GIT_STATUS_BEFORE="$(git status --porcelain)"
test -z "$GIT_STATUS_BEFORE"
for npmrc in "$REPO_ROOT/.npmrc" "$REPO_ROOT/apps/web/.npmrc"; do
  test ! -e "$npmrc"
  test ! -L "$npmrc"
done
PACKAGE_SHA_BEFORE="$(sha256sum package.json | cut -d' ' -f1)"
LOCK_SHA_BEFORE="$(sha256sum package-lock.json | cut -d' ' -f1)"
YARN_SHA_BEFORE="$(sha256sum yarn.lock | cut -d' ' -f1)"
A1_CACHE="$(git rev-parse --git-path midao-npm-cache)"
mkdir -p node_modules
touch node_modules/.midao-a1-stale-sentinel
A1_HOME="$(mktemp -d)"
chmod 0700 "$A1_HOME"
USER_NPMRC="$A1_HOME/user.npmrc"
GLOBAL_NPMRC="$A1_HOME/global.npmrc"
YARN_BACKUP="$A1_HOME/yarn.lock"
: > "$USER_NPMRC"
: > "$GLOBAL_NPMRC"
chmod 0600 "$USER_NPMRC" "$GLOBAL_NPMRC"
cleanup_a1() {
  cleanup_status=$?
  set +e
  if test -f "$YARN_BACKUP"; then
    mv -fT -- "$YARN_BACKUP" "$REPO_ROOT/yarn.lock" || cleanup_status=1
  fi
  if test -e "$YARN_BACKUP" || test -L "$YARN_BACKUP"; then
    cleanup_status=1
  else
    rm -rf -- "$A1_HOME" || cleanup_status=1
  fi
  return "$cleanup_status"
}
trap cleanup_a1 EXIT
mv -- yarn.lock "$YARN_BACKUP"

mkdir -p "$A1_CACHE"
timeout --signal=TERM 570s env -i \
  HOME="$A1_HOME" \
  PATH="$MIN_PATH" \
  LANG='C.UTF-8' LC_ALL='C.UTF-8' TERM='dumb' NO_COLOR='1' CI='1' NODE_ENV='test' \
  npm_config_userconfig="$USER_NPMRC" \
  npm_config_globalconfig="$GLOBAL_NPMRC" \
  npm_config_cache="$A1_CACHE" \
  npm_config_registry='https://registry.npmjs.org/' \
  npm_config_package_lock='true' \
  npm_config_ignore_scripts='true' \
  npm_config_update_notifier='false' \
  npm_config_fund='false' \
  npm_config_audit='false' \
  "$NPM_ENTRY" ci --ignore-scripts --include=dev --package-lock=true --fund=false --audit=false

test ! -e yarn.lock
test ! -L yarn.lock
mv -T -- "$YARN_BACKUP" yarn.lock
test ! -e "$YARN_BACKUP"
test ! -e node_modules/.midao-a1-stale-sentinel
test "$(sha256sum package.json | cut -d' ' -f1)" = "$PACKAGE_SHA_BEFORE"
test "$(sha256sum package-lock.json | cut -d' ' -f1)" = "$LOCK_SHA_BEFORE"
test "$(sha256sum yarn.lock | cut -d' ' -f1)" = "$YARN_SHA_BEFORE"
git diff --exit-code -- package.json package-lock.json yarn.lock
test -d node_modules/typescript
test "$(sha256sum "$SUPABASE_BIN" | cut -d' ' -f1)" = "$SUPABASE_SHA256"
test "$($SUPABASE_BIN --version 2>/dev/null)" = '2.87.2'
GIT_STATUS_AFTER="$(git status --porcelain)"
test -z "$GIT_STATUS_AFTER"
```

**2026-07-23 A1 corrections:** Node 22搭配host npm 11.9.0實跑 `npm install --ignore-scripts`雖完成368 packages，卻自動刪除 `package-lock.json`內一筆nested optional-peer entry，正確觸發lock drift gate；owner明確核准改用推薦方案 `npm ci --ignore-scripts`。Focused review確認npm package的Supabase 2.87.2只靠postinstall下載binary，因此禁止後續 `npm exec` seam；已由既有verified cache供應固定standalone artifact至 `$SUPABASE_BIN`。第一次exact `npm ci` runtime完成661 packages後，package/package-lock、sentinel、TypeScript與Supabase gates皆PASS，但npm 11 Arborist因既有 `yarn.lock`而重寫205 additions/12 deletions（drift SHA-256 `4e12b9d08811e8a1308ad025ac795650d95b52e0ff45749472f2170dcdcf23d1`），A1正確FAIL。npm source `shrinkwrap.js:369-381,1175-1176`證實其會載入並重寫Yarn lock；因此install期間由0700 temp HOME quarantine original Yarn lock，先設EXIT trap保證normal failure/timeout恢復，再要求npm未新建Yarn lock並原樣移回。若任一固定toolchain path/version/digest/mode、clean-state、quarantine restore或install gate不符，立即HOLD；不得沿用舊tree後restore lock假綠、不得執行 `npm audit fix`、不得下載floating CLI。Local-only secret只用於非production test process，不寫入 `.env`、log、worklog或commit。

**Files:**
- Modify: `docs/operations/worklogs/issue1755.md`
- Create: `docs/operations/worklogs/issue1756.md`

Worklog 記錄 issue、branch、base SHA、plan path、non-goals、current task。Docs-only checkpoint commit：

```bash
git add docs/operations/worklogs/issue1755.md docs/operations/worklogs/issue1756.md
git diff --cached --check
git commit -m "docs: 建立 Midao foundation 工作紀錄"
```

## Task A2: 執行既有 auth/flag/impersonation baseline

**No code changes.**

```bash
NODE22_BIN="$(npx --yes node@22 -p 'process.execPath')"
export PATH="$(dirname "$NODE22_BIN"):$PATH"
export NODE_ENV=test
export GUIDE_SESSION_SECRET='midao-local-test-secret-at-least-32-bytes'
export NODE_OPTIONS='--experimental-strip-types'
node --test --test-concurrency=1 \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/security/guide-auth-env.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs
```

Expected：38 tests PASS。此精確命令已於 design worktree實跑 38/38 PASS；fresh implementation worktree仍必須重跑。若 baseline red，停止並先回報，不把既有失敗混入本 package。

## Task A3: 建立 staged evidence verifier（補強 frozen hook）

**Files:**
- Create: `scripts/testing/verify-staged-check-evidence.mjs`
- Create: `apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs`

**RED:** pure validator與mocked child/git adapters覆蓋：Node非22、child/evidence exit非0、manifest `childArgv`不等於actual spawned argv、`evidence.cmd`不等於derived `expectedEvidenceCmd`、literal path含glob metacharacters、evidence早於child start、>30分鐘、before/after `git write-tree`不同、staged deletion/rename、tree變更後舊bundle未清、bundle covered-path union漏任一staged test、只跑無關passing test、non-allowlisted `--run-heavy` child、tracked unstaged code、untracked `.ts/.tsx/.mjs/.sql/.sh/.json/.toml`、evidence後新增/修改test、stdout/stderr含secret。Docs-only untracked可列出但不能讓code-like例外。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
```

Expected RED：module missing。

**Minimal GREEN:** `--run --`模式先確認Node22與clean code state，驗證child argv只含literal tracked test paths/允許flags，再取得 `git write-tree`和staged path/status/blob manifest；先保存actual spawned `childArgv`與按frozen `run-checks.sh:16-64`規則derived的 `expectedEvidenceCmd`，spawn exact child後read `.claude/state/last-checks.json`，只拿其cmd與derived semantic command比較並驗exit/epoch；重算tree/state後依相同tree hash append entry至 `.git/midao-last-verified.json` evidence bundle。`--check-only`核對bundle schema、current index/tree、所有entries年齡與covered-path union，並以current `.claude/state/last-checks.json`重驗latest ordinary entry的semantic command/exit/epoch；較早entries已在append當下驗過且只在相同tree bundle內有效。不可自行刷新manifest或沿用不同tree entries。Untracked用 `git ls-files --others --exclude-standard -z`；tracked unstaged與staged rename/delete使用NUL-safe porcelain/raw parsing。所有輸出redact token/key/password/secret，不修改frozen hook。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
git add \
  scripts/testing/verify-staged-check-evidence.mjs \
  apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
```

Expected GREEN：unit/adversarial cases與exact harness child都exit 0；manifest tree hash等於current `git write-tree`，沒有raw secret輸出。

**Commit:** `test: 補強 staged code evidence驗證`。

## Task A4: secret-safe CI command evidence runner

**Files:**
- Create: `scripts/testing/run-midao-ci-command.mjs`
- Create: `apps/web/tests/unit/midao-ci-command-runner.test.mjs`

**RED:** mocked spawn/crypto/fs/git adapters覆蓋唯一三個modes與fixed children：`lint → npm run lint`、`typecheck → npm run typecheck`、`build → npm run build`；任何其他mode/extra argv拒絕。Child env不得spread/inherit `process.env`：runner先以filesystem API解析 `process.execPath`與npm executable；npm candidate只可位於同Node toolchain dir、`/usr/local/bin/npm`或`/usr/bin/npm`；resolve realpath後target必須是regular executable且非group/world-writable，spawn使用該validated realpath。Child `PATH`只由Node/npm directories＋固定 `/usr/local/bin:/usr/bin:/bin`重建；`LANG=C.UTF-8`、`LC_ALL=C.UTF-8`、`TERM=dumb`、`NO_COLOR=1`固定，不複製parent values。

`HOME`為runner-owned isolated temp dir。Runner先保存原process umask並暫設`0o077`；外層cleanup `try/finally`涵蓋一旦建立的HOME，內層同步setup `try/finally`則在安全umask下依序完成`mkdtemp`、HOME FD驗證、cache exclusive mkdir＋FD驗證、兩個npmrc exclusive create＋FD驗證，任一步成功／失敗後都無條件精確恢復原umask。安全umask尚未恢復前禁止任何`await`、child spawn或其他非同步工作；恢復完成後才可進child/log/postflight。若HOME已建立，setup或umask restore錯誤都必須進外層cleanup；原始錯誤優先保存，cleanup錯誤可附加但不得掩蓋原始錯誤，任一錯誤皆final nonzero且不得發布success evidence。HOME以directory FD `fchmod(0o700)`與`fstat`，path `lstat`必須非symlink、directory、mode exact0700且dev/inode與FD一致；npm cache以exclusive `mkdir`建立後同樣透過directory FD `fchmod/fstat`＋path `lstat`驗directory、exact0700、same dev/inode。Runner以`open(..., 'wx', 0o600)`／`O_CREAT|O_EXCL`建立不同的`path.join(tempHome, 'user.npmrc')`與`path.join(tempHome, 'global.npmrc')`，在仍開啟的FD上`fchmod(0o600)`，再以FD `fstat`驗regular、size 0、mode exact0600；path `lstat`必須非symlink、regular、mode0600，且dev/inode與FD一致。兩path必須不同且皆非`/dev/null`，分別設為`npm_config_userconfig`與`npm_config_globalconfig`；`npm_config_cache`指向已驗證的cache path，update-notifier/fund/audit固定false。Adversarial tests必須從restrictive process umask `0o777`開始，證明完整同步setup期間umask維持安全值、HOME/cache/npmrc exact modes、原umask在`mkdtemp`與每個setup成功／失敗路徑都精確恢復且在spawn前已恢復，並讓exact strict child env local `npm --version` no-network probe成功回pinned npm 11.9.0，不得把setup fail-closed當作通過；另注入umask restore、exclusive mkdir/open、directory/file fchmod/fstat/lstat失敗、path replacement、第二個npmrc或cache partial-setup失敗，證明其他異常fail closed且已建立HOME仍cleanup。

Build mode另在process內產生兩個>=32-byte random secrets，設 `NODE_ENV=production`、`GUIDE_SESSION_SECRET`、`ADMIN_ACCESS_TOKEN`；三個modes都不得帶入parent `DATABASE_URL`、任何 `*_TOKEN`/`*_SECRET`/`*_PASSWORD`、private key、SMTP/cloud credentials或 `SUPABASE_SERVICE_ROLE_KEY`。Spawn前以lstat檢查repo root與 `apps/web`：任何 `.env`、`.env.*`或 `.npmrc` regular file/symlink（dotenv僅 `*.example`可存在）都fail closed，避免Next/npm自行載入ignored secrets。Adversarial tests放secret於parent global npmrc path/config、`LANG`、`LC_ALL`、`TERM`、`PATH`、credentials vars及repo `.env.local`/symlink/`.npmrc`，並讓mock lifecycle child列出全部 `npm_config_*`；必須證明child/console/log/evidence無任何raw hostile value。

Cleanup tests涵蓋成功、第一／第二npmrc建立失敗、cache/setup失敗、spawn throw、child nonzero、postflight、log/evidence write失敗；所有路徑temp HOME最後都不存在。Cleanup failure不得被吞掉，必須使final result nonzero；runner每次開始先移除該mode舊success evidence（失敗即停止），新success evidence只能在child/postflight成功且temp HOME cleanup成功後以atomic replacement提交，cleanup失敗不得留下或沿用success evidence。

每mode各寫0600 `.git/midao-ci-${mode}-evidence.json`與sanitized log，只保存exact wrapper argv、mode、allowlisted env names（不含values）、sanitized fixed child argv、exit、HEAD SHA、`git write-tree`、log path與SHA-256 digest。執行前後 `git status --porcelain`都空、index tree等於HEAD tree且HEAD不變；child非0、dirty/untracked source、tree/HEAD變化、raw secret或log/evidence write失敗都FAIL。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-ci-command-runner.test.mjs
```

Expected RED：runner/test target missing。

**Minimal GREEN:** 使用Node `crypto.randomBytes()`在build mode內生成secrets，不透過shell argv；以mode allowlist選fixed npm child，strictly constructed env spawn。外層cleanup `try/finally`包住HOME lifecycle；保存原umask、暫設0077，在內層純同步`try/finally`完成HOME/cache/npmrc建立與全部FD/path驗證後才恢復原umask，期間不得`await`或spawn。Directory helper以FD `fchmod/fstat`＋path `lstat` identity把HOME與cache強制為exact0700；file helper以exclusive FD create→`fchmod`→`fstat`→path `lstat` identity建立兩個不同empty0600 npmrc，且所有FD在spawn前關閉。Stream輸出先redact寫入mode-specific sanitized log；先移除舊success evidence，child/postflight完成後保存待提交evidence內容，只有temp HOME cleanup成功才以same-directory temp file＋fsync/close＋chmod0600＋atomic rename發布success evidence。任一setup/spawn/log/postflight/cleanup/evidence步驟失敗都final nonzero、不得留下success evidence；cleanup failure不得掩蓋原始失敗。Runner不得接受任意command、env override或secret值參數。

**2026-07-23 A4 executable correction:** exact Node `22.23.1`／npm `11.9.0` probe with isolated HOME and both npm config env vars set to `/dev/null` returned exit 1 before config resolution: `double-loading config "/dev/null" as "global", previously loaded as "user"`。因此同一路徑不是可執行的npm isolation；A4必須使用runner-owned兩個不同0600 empty files，且unit adapters與真npm child都驗證其distinct/regular/empty/mode contract。不得回退parent/global npmrc或省略任一config seam。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-ci-command-runner.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/unit/midao-ci-command-runner.test.mjs
```

**Commit:** `test: 建立secret-safe CI command evidence runner`。

---

# Phase B — Foundation schema

## Task B1: backend_mode migration — RED/GREEN source contract

**Files:**
- Create: `apps/web/tests/api/midao-backend-mode-migration.test.mjs`
- Create: `supabase/migrations/20260723000000_midao_backend_mode.sql`

**RED test assertions:**

```js
assert.match(sql, /ADD COLUMN IF NOT EXISTS backend_mode TEXT NOT NULL DEFAULT 'legacy'/i);
assert.match(sql, /backend_mode IN \('legacy', 'midao'\)/i);
assert.match(sql, /CREATE INDEX IF NOT EXISTS/i);
assert.match(sql, /COMMENT ON COLUMN guide_profiles\.backend_mode/i);
```

**RED command:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-migration.test.mjs
```

Expected RED：migration file missing。

**Minimal GREEN:** additive column、named check constraint、mode index、comment。不得修改 `guide_session_version` 或既有 migration。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-migration.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/api/midao-backend-mode-migration.test.mjs
```

**Commit:** `feat: 新增 Midao 後台模式欄位`；依global protocol先 `--check-only`再commit。

## Task B2: notification outbox migration — RED/GREEN source contract

**Files:**
- Create: `apps/web/tests/api/midao-notification-outbox-migration.test.mjs`
- Create: `supabase/migrations/20260723001000_midao_notification_outbox.sql`

**Contract:**

```text
event_name
aggregate_type
aggregate_id
payload
status pending|processing|delivered|failed
attempt_count
next_attempt_at
last_error_code
created_at
delivered_at
```

Migration同時建立claim index、`ENABLE ROW LEVEL SECURITY`＋`FORCE ROW LEVEL SECURITY`、`REVOKE ALL ON TABLE ... FROM PUBLIC, anon, authenticated`、只grant預期privileges給service_role。Payload comment明記不存完整PII／payment secrets。

**RED:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-notification-outbox-migration.test.mjs
```

Expected RED：migration missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-notification-outbox-migration.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/api/midao-notification-outbox-migration.test.mjs
```

**Commit:** `feat: 建立 Midao 通知 outbox schema`。

## Task B3: durable idempotency migration — RED/GREEN source contract

**Files:**
- Create: `apps/web/tests/api/midao-idempotency-migration.test.mjs`
- Create: `supabase/migrations/20260723002000_midao_idempotency_records.sql`

**RED assertions:** actor/command/scope/key/request hash、state `processing|completed`、nullable response直到completed、CHECK確保completed時response status/body皆非空、resource、created/locked/completed/expires、scoped unique key、expiry/stale-processing indexes、`ENABLE/FORCE RLS`、`REVOKE ALL FROM PUBLIC, anon, authenticated`、只grant預期privileges給service_role。不同guide scope可重用相同key；concurrent replay可等待claim owner完成，不讀placeholder response。

**RED:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-idempotency-migration.test.mjs
```

Expected RED：migration missing。

**Minimal GREEN:** response snapshot comment 必須禁止 raw confirmation token、cookie、secret 與不必要 PII。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-idempotency-migration.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/api/midao-idempotency-migration.test.mjs
```

**Commit:** `feat: 建立 Midao durable idempotency schema`。

## Task B4: transactional audit migration — RED/GREEN source contract

**Files:**
- Create: `apps/web/tests/api/midao-audit-events-migration.test.mjs`
- Create: `supabase/migrations/20260723002500_midao_audit_events.sql`

**RED assertions:** `midao_audit_events`含 actor type/ID、guide、action、resource、request ID、reason、metadata、created_at；action/request與guide時間indexes；`ENABLE/FORCE RLS`；`REVOKE ALL ON TABLE ... FROM PUBLIC, anon, authenticated`；只grant最小預期privileges給service_role；metadata comment禁止token/cookie/payment/完整旅客PII。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-audit-events-migration.test.mjs
```

Expected RED：migration missing。

**Minimal GREEN:** 建立專用 transactional table；既有 `audit_logs`為 order-centric schema，缺 actor type、guide、resource與request ID，不得硬塞或把 transaction audit委託給 best-effort app helper。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-audit-events-migration.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/api/midao-audit-events-migration.test.mjs
```

**Commit:** `feat: 建立 Midao transactional audit schema`。

---

# Phase C — Session, actor and runtime access

## Task C1: 抽離 shared guide-session crypto且保持行為零變更

**Files:**
- Create: `apps/web/src/lib/guide-session-crypto.ts`
- Modify: `apps/web/src/lib/guide-auth.ts`
- Create: `apps/web/tests/api/guide-session-crypto.test.mjs`
- Reuse: `apps/web/tests/guide-auth.test.mjs`
- Reuse: `apps/web/tests/security/guide-auth-env.test.mjs`
- Reuse: `apps/web/tests/api/guide-auth-session-post-bounded.test.mjs`

**RED:** guide session legacy compatibility必須鎖死：`signGuideSession(guideId, version)`精確維持現有 HMAC message bytes `${guideId}:${sessionVersion}`；production secret少於32 chars fail closed，non-production configured secret deterministic。另提供 domain-separated signer只給新用途，guide token不得套 prefix。

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/guide-session-crypto.test.mjs \
  apps/web/tests/guide-auth.test.mjs
```

Expected RED：shared module missing；既有 `apps/web/tests/guide-auth.test.mjs`仍須GREEN，不得以使舊token失效換取抽離。

**Minimal GREEN:** 將既有 secret resolution與 guide HMAC搬進 shared module，簽章bytes/token format逐字不變；新增 `signDomainSeparatedValue('midao:impersonation-actor:v1', payload)`與verify供actor使用，其HMAC message bytes固定為UTF-8 `domain + NUL + byteLength(payload) + ':' + payload`，不得用裸字串拼接。Actor signature不能驗成guide token，guide signature不能驗成actor。不匯出raw secret。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/guide-session-crypto.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/security/guide-auth-env.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/guide-session-crypto.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/security/guide-auth-env.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
```

**Commit:** `refactor: 抽離導遊 session 簽章工具`。

## Task C2: verifyGuideSession 回傳 signed sessionVersion

**Files:**
- Modify: `apps/web/src/lib/guide-auth.ts`
- Create: `apps/web/tests/api/midao-guide-session-version.test.mjs`

**RED:** valid token version=7 must yield `session.sessionVersion===7`; tampered version/signature returns null；token仍三段。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-session-version.test.mjs
```

Expected RED：payload 尚無 sessionVersion。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs
```

**Commit:** `feat: 暴露導遊 signed session version`。

## Task C3: Midao feature flags default-off

**Files:**
- Modify: `apps/web/src/config/feature-flags.mjs`
- Create: `apps/web/tests/unit/midao-feature-flags.test.mjs`

**RED:** `isMidaoBackendEnabled()`、`isMidaoBackendMutationsEnabled()`、`isMidaoBackendModeSwitchEnabled()`皆default false，只接受existing truthy contract；三者互不隱含。Forward `legacy→midao`之後必須同時要求 backend＋mode-switch gates；rollback `midao→legacy`不得被mode-switch或mutation flag擋住。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-feature-flags.test.mjs
```

Expected RED：exports missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-feature-flags.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/unit/midao-feature-flags.test.mjs
```

**Commit:** `feat: 新增 Midao 後台 kill switches`。

## Task C4: signed impersonation actor codec/cookie

**Files:**
- Create: `apps/web/src/lib/midao/impersonation-actor.ts`
- Create: `apps/web/tests/api/midao-impersonation-actor.test.mjs`

**RED:** cookie name固定 `midao_impersonation_actor`；normalized admin email、target guide ID、issued/expiry的HMAC-signed HttpOnly cookie round-trip；target mismatch/tamper/expiry拒絕；`Path=/`、host-only且禁止 `Domain`、production Secure、all env SameSite=Lax。Payload expiry與cookie `Max-Age/Expires`一致且不得晚於guide session expiry；clear helper使用完全相同name/path/host-only scope並同時設 `Max-Age=0`＋past `Expires`。Actor domain不能驗成guide token，反向亦然；payload不含admin token。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-impersonation-actor.test.mjs
```

Expected RED：module/cookie codec missing。

**Minimal GREEN:** 重用shared domain-separated signer，不重複secret resolver；export create/verify/clear cookie helpers，不匯出raw secret。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-impersonation-actor.test.mjs \
  apps/web/tests/api/guide-session-crypto.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-impersonation-actor.test.mjs \
  apps/web/tests/api/guide-session-crypto.test.mjs
```

**Commit:** `feat: 建立可驗證的管理員代入actor cookie`。

## Task C4A: admin impersonation route signs canonical actor

**Files:**
- Modify: `apps/web/app/api/v2/admin/guides/[guideId]/impersonate/route.ts`
- Create: `apps/web/tests/api/midao-impersonation-route-actor.test.mjs`
- Reuse: `apps/web/tests/api/admin-guide-impersonation.test.mjs`

**RED:** actor只取 `pickAdminCredentials(request).email`後 `trim().toLowerCase()`；禁止body actor；成功同時下發signed actor與visible banner cookie；target/version仍canonical；existing admin middleware/CSRF/approved gate不變。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-impersonation-route-actor.test.mjs
```

Expected RED：route尚未簽actor cookie。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-impersonation-route-actor.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-impersonation-route-actor.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
```

**Commit:** `feat: 代入route保存canonical admin actor`。

## Task C4B: ordinary login/logout clears impersonation identity

**Files:**
- Modify: `apps/web/app/api/guide/auth/session/route.ts`
- Create: `apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs`
- Reuse: `apps/web/tests/api/guide-auth-session-post-bounded.test.mjs`

**RED:** invite、regular email/password、legacy guideId三條non-impersonation成功登入，以及DELETE logout，都逐條read-back兩個 `Set-Cookie` clear headers：signed actor使用相同name/`Path=/`/host-only scope＋`Max-Age=0`＋past `Expires`，visible banner亦以原scope清除。測「同target有效actor→未logout→普通登入」後只能建立guide actor。Error paths不誤清現有session。F10再以browser context cookies確認兩顆實際不存在，不只比對header字串。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs
```

Expected RED：普通登入尚未清actor/banner cookies。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
```

**Commit:** `fix: 普通導遊登入清除代入身份`。

## Task C5: canonical guide runtime access gateway

**Files:**
- Create: `apps/web/src/lib/db-midao-runtime-access.mjs`
- Create: `apps/web/src/lib/midao/canonical-guide-session.ts`
- Create: `apps/web/tests/api/midao-runtime-access-gateway.test.mjs`

**RED cases:**

- DB projection明列 `display_name, backend_mode, guide_session_version, verification_status`；canonical `guideName`只取DB `display_name`，禁止從可改寫的 `guide_name` cookie建立route/audit context。
- HMAC invalid → 401。
- token version != DB version → `SESSION_STALE` 401。
- verification != approved → `GUIDE_NOT_ACTIVE` 403。
- backend flag off → `MIDAO_DISABLED` 404/503（page/API由 caller映射）。
- mode != midao → `BACKEND_MODE_MISMATCH` 409。
- valid signed impersonation → actorType admin／actorId verified email。
- forged actor cookie → 401；不能退回 guide actor。
- normal guide → actorType guide／actorId guide ID。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-runtime-access-gateway.test.mjs
```

Expected RED：modules missing。

**Minimal GREEN exports:**

```text
getGuideRuntimeAccessDb({ guideId })
verifyCanonicalGuideSession(request, { requireMode })
assertMidaoRuntimeAccess({ session, runtime, flags, impersonation })
```

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
```

**Commit:** `feat: 建立 canonical Midao session guard`。

## Task C6: V2 guide query/command wrappers

**Files:**
- Create: `apps/web/src/lib/midao/with-guide-route.ts`
- Create: `apps/web/src/lib/midao/route-errors.ts`
- Create: `apps/web/src/lib/midao/idempotency.ts`
- Create: `apps/web/tests/api/midao-guide-route-wrapper.test.mjs`
- Reuse: `apps/web/src/lib/api-response.ts`
- Reuse: `apps/web/src/lib/route-error.ts`
- Reuse: `apps/web/src/lib/csrf.mjs`

**RED cases:**

- Query runs canonical guard before handler。
- Command additionally validates CSRF and `MIDAO_BACKEND_MUTATIONS_ENABLED` before handler。
- Required `Idempotency-Key`：ASCII trim後1–128 bytes，拒絕control characters與空字串；missing/invalid 422。
- `hashIdempotentRequest()` canonical JSON hash deterministic。
- Context contains guideId、canonical DB guideName、sessionVersion、actorType/actorId、requestId、idempotencyKey、requestHash；不得傳遞public cookie guideName。
- ownership maps 404；mode conflict 409；mutation kill switch 503；unexpected error sanitized。
- response exclusively `jsonOk/jsonError` V2 envelope。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-route-wrapper.test.mjs
```

Expected RED：wrapper missing。

**Minimal GREEN:** wrappers only establish boundary；actual durable record is written inside each future command RPC，not in route memory。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-route-wrapper.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck apps/web/tests/api/midao-guide-route-wrapper.test.mjs
```

**Commit:** `feat: 建立 Midao V2 route boundary`。

---

# Phase D — Atomic backend mode switch and real SQL gate

## Task D1: atomic backend-mode switch RPC source contract

**Files:**
- Create: `apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs`
- Create: `supabase/migrations/20260723003000_midao_atomic_backend_mode_switch.sql`

**RED assertions:**

- function identity固定為 `public.midao_switch_guide_backend_mode(uuid,text,text,text,text,uuid,text,text)`，參數依序為guide ID、target mode、reason、actor type、actor ID、request ID、idempotency key、request hash，returns canonical jsonb；若用 `SECURITY DEFINER`，固定安全 `search_path`並schema-qualify所有objects。
- `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`；`GRANT EXECUTE ... TO service_role`。
- transaction順序固定：validate mode/reason/canonical actor/key/hash，設定 `scope_type='guide'`、`scope_id=targetGuideId` → claim/lock `midao_idempotency_records` → same-hash replay或different-hash deterministic conflict → `SELECT ... FOR UPDATE` guide profile → conditional mode/version update → audit → outbox →寫去敏response snapshot並把idempotency state改completed → commit。
- mode changed：`guide_session_version`恰加一，audit/outbox各一。
- fresh-key same-mode：不bump、不audit、不outbox，只保存canonical idempotent response；同key replay不產生任何side effect。
- unknown/inactive guide deterministic error，且idempotency狀態不留下半成品。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs
```

Expected RED：migration missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs
```

**Commit:** `feat: 新增原子導遊後台模式切換 RPC`。

## Task D2: admin mode-switch gateway/API

**Files:**
- Create: `apps/web/src/lib/db-midao-backend-mode.mjs`
- Create: `apps/web/app/api/v2/admin/guides/[guideId]/backend-mode/route.ts`
- Create: `apps/web/tests/api/midao-backend-mode-switch.test.mjs`

**RED cases:** admin actor from verified credentials且normalized；body only backendMode/reason；`Idempotency-Key` required；invalid UUID/mode/reason；route只呼叫RPC gateway。`legacy→midao`要求 `MIDAO_BACKEND_ENABLED=true`且 `MIDAO_BACKEND_MODE_SWITCH_ENABLED=true`，default-off回503；`midao→legacy` rollback即使backend/mutation/mode-switch flags全關仍允許。Same key/same body replay，same key/different body 409；fresh same-mode no version bump/audit/outbox；returns mode/version/redirectTo；CSRF remains admin middleware realm。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-backend-mode-switch.test.mjs
```

Expected RED：route/gateway missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-backend-mode-switch.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-backend-mode-switch.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs
```

**Commit:** `feat: 建立原子導遊後台模式切換 API`。

## Task D3a: self-owned local Supabase runner

**Files:**
- Create: `apps/web/tests/unit/midao-local-supabase-runner.test.mjs`
- Create: `scripts/testing/with-midao-local-supabase.mjs`
- Create: `scripts/testing/run-midao-foundation-postgres.sh`

**RED:** mocked process/fs adapters覆蓋：全repo lock競爭只有一個winner；fixed-port project已running時fail closed；`status`只在stderr有exact pinned-2.87.2整行、且escaped project ID完全相符時判定not-running：`^failed to inspect container health: Error response from daemon: No such container: supabase_db_${escapedExpectedProjectId}\r?$`。Parser逐行處理CRLF；stderr nonempty lines必須exact等於兩行序列：先上述container error，再 `Try rerunning the command with --debug to troubleshoot the error.`；缺行、加行、換序或其他exit 1一律abort。Unit test必須使用這份實測two-line fixture `failed to inspect container health: Error response from daemon: No such container: supabase_db_midao-backend-design`，另測wrong project ID、prefix/尾碼注入與unknown error拒絕；start成功前signal不記ownership/不stop foreign stack；expectedProjectId為canonical repo root basename（只允許CLI合法字元），start後以 project-scoped `docker ps --filter label=com.supabase.cli.project=${expectedProjectId} --format`只枚舉expected-project containers，核對所有names以 `_${expectedProjectId}`結尾並capture IDs，才記ownership；cleanup前IDs/names任一變更即拒絕stop；reset failure、child failure與TERM/INT都只cleanup已確認owned stack；stdout/stderr/JSON中的anon/service-role/DB credentials全部redact。兩個concurrent runners、stale lock PID、reset failure、reused stack、keys出現在stdout/stderr都要測。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-local-supabase-runner.test.mjs
```

Expected RED：runner/lock module missing。

**Minimal GREEN:** 因 `supabase/config.toml`固定ports，使用atomic filesystem lock `/tmp/tour-platform-local-supabase.lock`序列化所有repo local Supabase runs。Wrapper每次從 `package-lock.json`解析exact Supabase version，所有CLI calls固定經 `npm exec --offline --yes --package="supabase@$SUPABASE_PIN" -- supabase`，禁止PATH上不同版本或network fallback。Lock metadata含PID、`/proc` process start ticks、repo root；只在PID不存在或start ticks不符時回收stale lock。持鎖順序為preflight→classified status→start→identity confirmation→reset→readiness→child→owned cleanup→unlock；不提供reuse mode。Identity confirmation與cleanup只使用expected-project label filter；stop固定帶 `--project-id ${expectedProjectId}`，cleanup前captured IDs/names/labels任一drift就HOLD且不得stop。`status -o json`逐鍵映射local env，`pg`重試 `SELECT 1`，所有CLI raw output先redact再顯示。Shell runner將其後integration test paths交給wrapper，wrapper在local env內執行 `node --test --test-concurrency=1`；無paths時列入D3b–D3d三支integration files。Caller必須由A3 `--run-heavy`包住整個570s shell command，將DB test exit/argv與staged tree直接綁定，不得事後用無關harness evidence覆蓋。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-local-supabase-runner.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck apps/web/tests/unit/midao-local-supabase-runner.test.mjs
```

**Commit:** `test: 建立排他的local Supabase runner`。

## Gate D3b: catalog-verified as-built baseline＋foundation schema verification

> **2026-07-24 owner decision:** 舊的「從空DB重播全部134支historical migrations＋seed」路線已停止。既有migration byte-for-byte凍結；不得恢復D3b stash內8支歷史修改。完整設計與執行順序以：
>
> - `docs/plans/2026-07-24-as-built-database-baseline-design.md`
> - `docs/plans/2026-07-24-as-built-database-baseline-implementation.md`
>
> 為權威。若本文其餘命令仍暗示全歷史重播，以新baseline plan為準並修正文檔後再執行。

**Cutoff contract:** baseline v1代表active production project `pyoderxmpeyqjwkeliiu`於capture當下的catalog；6支`2026072300*` Midao migrations全部post-cutoff。Fresh history exact set只記一支`baseline_v1` synthetic marker＋post-cutoff history；`baseline.sql`與`managed-overlays.sql`必須組成同一支synthetic migration，禁止額外overlay row或134筆fake history。

**Catalog truth contract:** `catalog.cutoff.normalized.json`只描述production cutoff；`catalog.expected-terminal.normalized.json`描述baseline＋6支Midao後的reviewed terminal truth。Fresh與existing rehearsal各自獨立exact compare expected-terminal，另彼此等價，不能拿cutoff catalog當terminal右側或只讓兩lane互比。

**Runner identity:** fresh／expected-terminal／existing rehearsal全部走D3a self-owned local wrapper，只接受loopback與owned container/project/port/database identity；拒絕production ref、`--linked`、remote URL及ambient DB env。Existing upgrade階段baseline execution count必為0。

**Managed-schema contract:** Supabase platform bootstrap擁有`auth/storage`內部物件；App自有跨schema policy／trigger／grant由object-level overlay管理。Unknown ownership、missing catalog section、unexpected diff或credential residue一律HOLD。

**Files:**
- Create: `supabase/baselines/v1/**`
- Create: `scripts/database-baseline/**`
- Create: `apps/web/tests/unit/midao-baseline-*.test.mjs`
- Create: `apps/web/tests/unit/midao-catalog-*.test.mjs`
- Create: `apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs`
- Create: `apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs`
- Retain: `apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs`

**Required sequence:**

1. 凍結134支historical migration hashes。
2. 建secret-safe production catalog capture、normalizer、ownership validator與exact comparator，通過fresh security review。
3. 以唯讀production capture兩次取得byte-identical catalog；raw dump不直接當真相。
4. Materialize pinned Supabase/Postgres empty stack：platform→baseline marker→overlay→6支Midao→seed。
5. Fresh terminal catalog exact compare；另跑existing-lane rehearsal，證明baseline execution count為零且terminal catalog等價。
6. 再跑foundation ACL/RLS/exact function identity、D3c rollback與D3d concurrency。

**Heavy evidence入口：**

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s node scripts/database-baseline/run-fresh-install.mjs \
  --test apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
```

Expected：baseline＋post-cutoff＋seed exit 0、fresh/existing terminal catalog exact、ACL/RLS/RPC gates PASS、ownership-safe cleanup PASS。普通全歷史`db reset`成功或失敗均不得冒充此gate證據。

**Commit:** `test: 驗證 catalog-verified baseline與 Midao foundation schema`。

## Gate D3c: RPC success, same-mode and fault rollback

**Files:**
- Create: `apps/web/tests/integration/midao-mode-switch-postgres.test.mjs`

**Fixture:** disposable DB明建兩個approved legacy guides與known versions，不依賴Andy seed。

**Exact assertions:**

- 單次legacy→midao：version恰加一，audit/outbox/idempotency各一，response snapshot去敏且state=completed。
- fresh-key same-mode：不bump、不audit、不outbox，只新增canonical completed idempotency response。
- unknown/inactive/invalid reason deterministic error，沒有processing殘留。
- Fault test以 `test.after()`＋`try/finally`保證drop trigger：在outbox INSERT raise後呼叫mode-changing RPC，profile/version、audit、outbox、idempotency全部等於before snapshot；assertion中途失敗亦清trigger。

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-foundation-postgres.sh \
  apps/web/tests/integration/midao-mode-switch-postgres.test.mjs
```

Expected：exit 0；任何partial write或cleanup failure都HOLD。Runner已由 `--run-heavy`直接綁定DB child exit/argv與staged tree；cleanup後執行 `node scripts/testing/verify-staged-check-evidence.mjs --check-only`。

**Commit:** `test: 驗證 Midao mode switch原子rollback`。

## Gate D3d: RPC concurrency and scoped idempotency

**Files:**
- Create: `apps/web/tests/integration/midao-mode-switch-concurrency-postgres.test.mjs`

每case重置fixture/counts，兩個獨立pg clients使用barrier與local `statement_timeout`：

- same guide＋same key/hash：responses完全相同，version/audit/outbox/idempotency business effect各一次。
- same guide＋same key/different hash：一成功、一個 `IDEMPOTENCY_KEY_REUSED`，只有winner effects。
- same guide＋different keys＋same target：final midao、version只加一、audit/outbox各一、兩筆completed idempotency responses；same-mode loser無business effects。
- different guides＋same client key：因scope不同各自成功。
- 全case無deadlock、無processing殘留、response snapshots與final rows一致。

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-foundation-postgres.sh \
  apps/web/tests/integration/midao-mode-switch-concurrency-postgres.test.mjs
```

Expected：exit 0；精確counts/response不符即FAIL。Runner已由 `--run-heavy`直接綁定DB child exit/argv與staged tree；cleanup後執行 `node scripts/testing/verify-staged-check-evidence.mjs --check-only`。

**Commit:** `test: 驗證 Midao mode switch concurrency`。

---

# Phase E — Login redirects and E2E-auth infrastructure

## Task E1: guide session API canonical redirect

**Files:**
- Modify: `apps/web/src/lib/guide-auth-session-supabase.ts`
- Modify: `apps/web/app/api/guide/auth/session/route.ts`
- Create: `apps/web/tests/api/midao-guide-login-api-redirect.test.mjs`

**RED:** invite、regular email/password、legacy guideId三條success path都從DB取canonical `backend_mode/display_name/guide_session_version`，回 `redirectTo`，並清殘留actor/banner cookies。Existing error/rate-limit/CSRF/password-upgrade不變。Midao new/returning guide皆回 `/midao`；legacy new/returning分別維持 `/guide/profile`、`/guide/dashboard`。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-guide-login-api-redirect.test.mjs
```

Expected RED：backend_mode/redirectTo/cookie clear尚不存在。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-login-api-redirect.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/guide-auth.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-guide-login-api-redirect.test.mjs \
  apps/web/tests/api/guide-auth-session-post-bounded.test.mjs \
  apps/web/tests/guide-auth.test.mjs
```

**Commit:** `feat: 回傳 canonical導遊登入入口`。

## Task E2: guide login UI consumes server redirect

**Files:**
- Modify: `apps/web/app/(non-locale)/guide/login/page.tsx`
- Create: `apps/web/tests/ui/midao-guide-login-ui-redirect.test.mjs`

**RED:** success一律優先使用V2 response `data.redirectTo`；URL `next`只可在server redirect所屬realm內覆蓋，跨 `/guide`↔`/midao`、absolute、protocol-relative、backslash、raw/percent-encoded separator、double-decode ambiguity、malformed percent encoding都拒絕並fail closed。UI不可自行以invite硬編 `/guide/profile`。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-guide-login-ui-redirect.test.mjs
```

Expected RED：UI仍忽略redirectTo。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-guide-login-ui-redirect.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-guide-login-ui-redirect.test.mjs
```

Browser-observable redirect在F10真實Playwright驗證。

**Commit:** `feat: 由server導向導遊登入後入口`。

## Task E3: admin impersonation canonical redirect＋UI consumer

**Files:**
- Modify: `apps/web/app/api/v2/admin/guides/[guideId]/impersonate/route.ts`
- Modify: `apps/web/app/(non-locale)/admin/guides/[guideId]/page.tsx`
- Modify: `apps/web/tests/api/admin-guide-impersonation.test.mjs`
- Create: `apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs`
- Create: `apps/web/tests/ui/midao-admin-impersonation-ui-redirect.test.mjs`

**RED:** approved target的canonical mode/version/display_name決定cookies與redirect；admin email normalized signed actor；legacy→`/guide/dashboard`，midao→`/midao`；既有admin middleware/CSRF/404/approved gate不變。Admin page成功後必須consume `json.data.redirectTo`，只允許exact `/midao`、`/midao/**`或`/guide/**`的same-origin relative path；missing、`//host`、backslash、encoded separator或其他path都fail closed至 `/guide/dashboard`，不得形成open redirect。

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/ui/midao-admin-impersonation-ui-redirect.test.mjs
```

Expected RED：canonical API redirect/actor cookie與UI consumer尚未存在，live UI仍硬編legacy route。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/ui/midao-admin-impersonation-ui-redirect.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/ui/midao-admin-impersonation-ui-redirect.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs
```

**Commit:** `feat: 依canonical mode代入導遊後台`。

## Task E4: 建立真實 Midao E2E guide session helper

**Problem fixed:** existing `setGuideSession()` only has fake 64-char signature and cannot pass server layout HMAC/DB guard。

**Files:**
- Modify: `supabase/seed.sql`（local-only second guide fixture）
- Modify: `apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs`
- Modify: `apps/web/e2e/helpers.ts`
- Modify: `apps/web/playwright.config.ts`
- Create: `scripts/testing/run-midao-e2e.sh`
- Create: `scripts/testing/run-midao-legacy-e2e-compat.sh`
- Create: `apps/web/tests/security/midao-e2e-auth-seam.test.mjs`

**Fixture:** 在 `supabase/seed.sql`新增local-only user `88888888-8888-4888-8888-888888888888`與guide `99999999-9999-4999-8999-999999999999`，slug `midao-e2e-guide`、email `midao-e2e@example.invalid`、`backend_mode='midao'`、`guide_session_version=1`、approved。`guide_password_hash`使用既有可驗證的deterministic legacy salt/hash，對應明確標註的non-production test password；首次普通登入可在disposable DB透明升級scrypt。不得改Andy fixture mode，不得使用真帳密。

**RED cases:**

- `setMidaoGuideSession()`直接重用shared `signGuideSession()`，維持legacy guide HMAC bytes，不複製演算法，也不使用 `'a'.repeat(64)`。
- 新增 `setMidaoImpersonationSession()`，重用actor cookie factory，建立真guide token＋真signed actor＋visible banner cookies。
- `playwright.config.ts`只在runner child顯式設 `MIDAO_E2E_LOCAL=1`時啟Midao managed webServer：`command: 'npm run dev'`＋explicit `env`，傳入local Supabase URL/anon/service role、同一>=32-char guide test secret、local-only >=32-char `ADMIN_ACCESS_TOKEN`、`ADMIN_EMAIL`＋matching `ADMIN_EMAIL_ALLOWLIST`與runner分配的非3333 port；此lane固定 `reuseExistingServer:false`。未設Midao flag時維持現有legacy config/default port行為，`PLAYWRIGHT_NO_WEBSERVER=1`仍完全關閉managed server；不得要求runner-only env或重用外部Next server，移除hardcoded fake anon key。
- `run-midao-e2e.sh`只接受repo-root `apps/web/e2e/*.spec.ts` paths，逐項驗證後安全strip `apps/web/`再傳給workspace Playwright，child env固定設 `MIDAO_E2E_LOCAL=1`；透過排他 `with-midao-local-supabase.mjs`獨立start/reset/seed/map env/readiness/cleanup；取得free port後立刻啟managed server，port競爭只能fail，不能fallback/reuse。Playwright child/server及Supabase stdout/stderr先redact keys再輸出。
- Legacy compat script只接受exact repo-root `apps/web/e2e/t1-login.spec.ts`，先確認3333 port空閒，再不信任parent URL/port env：child固定unset `MIDAO_E2E_LOCAL`、`PLAYWRIGHT_NO_WEBSERVER`，強制 `CI=1`、`PORT=3333`、`NEXT_PUBLIC_BASE_URL=http://127.0.0.1:3333`、`NEXT_PUBLIC_APP_URL=http://127.0.0.1:3333`及local-only admin token/email/allowlist與nonsecret public Supabase placeholders。Legacy config branch的Playwright `use.baseURL`、`webServer.url`與explicit server env都必須由同一fixed local origin取得，`reuseExistingServer:false`；任何外部origin或port競爭只能FAIL。它跑真browser/spec，不能用 `PLAYWRIGHT_NO_WEBSERVER`、外部server或source-only assertion代替，並redact local admin token。
- production config不能啟用test bypass；本方案沒有runtime bypass cookie、production key或 `page.route()` auth繞過。
- security test round-trip helper token經 `verifyGuideSession()`成功，actor/guide cross-protocol signatures互斥；source、Playwright reporter、webServer startup error與runner stdout/stderr都不得列出local anon/service-role/DB/admin values。Config matrix另驗：Midao flag→dynamic server/no reuse；`PLAYWRIGHT_NO_WEBSERVER=1`→無server；兩旗皆無＋legacy compat env→legacy config可載入。Unit/source contract並驗legacy script exact-spec allowlist、flags unset、CI no-reuse、occupied port fail與token redaction；hostile parent預設external `NEXT_PUBLIC_BASE_URL`/`NEXT_PUBLIC_APP_URL`、其他 `PORT`與 `PLAYWRIGHT_NO_WEBSERVER=1`時，captured child env/config仍只能是 `127.0.0.1:3333`且managed server不可被關閉。
- schema integration test在reset後read-back fixture exact user/guide IDs、slug、email、`backend_mode='midao'`、`guide_session_version=1`、`verification_status='approved'`，並用明列的non-production password通過既有password verifier；FK/duplicate/seed failure都必須使DB command非0。

```bash
node --test --test-concurrency=1 apps/web/tests/security/midao-e2e-auth-seam.test.mjs
timeout --signal=TERM 570s bash scripts/testing/run-midao-foundation-postgres.sh \
  apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs
```

Expected RED：source test因helper/config/seed尚未提供真實session；DB test因exact seeded fixture尚未存在。Runner/path missing不算需求RED。

**Minimal GREEN:** 保留既有 `setGuideSession()`供legacy browser tests；新增兩個Midao helpers，改managed webServer env，runner重用共用local Supabase wrapper。不得新增全域Playwright projects或production bypass。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs \
  apps/web/tests/unit/midao-local-supabase-runner.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs \
  apps/web/tests/unit/midao-local-supabase-runner.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-foundation-postgres.sh \
  apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-legacy-e2e-compat.sh \
  apps/web/e2e/t1-login.spec.ts
node scripts/testing/verify-staged-check-evidence.mjs --check-only
```

Expected GREEN：Node/source contract、reset/seed/schema read-back與legacy managed-server browser spec都exit 0；evidence bundle union涵蓋兩支staged tests且tree hash不變，既有local-runner unit與legacy t1為reused regression coverage，不虛報成staged。

**Commit:** `test: 建立真實 Midao E2E guide session`。

---

# Phase F — Responsive shell

## Task F1: Brand Book tokens

**Files:**
- Create: `apps/web/src/features/midao/styles/tokens.css`
- Create: `apps/web/src/features/midao/styles/shell.css`
- Create: `apps/web/tests/ui/midao-brand-tokens.test.mjs`

**RED assertions:** Brand Book colors、Noto Serif TC headings、safe-area vars、44px target、focus-visible、reduced-motion。禁止 reference screenshot blue作主色。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-brand-tokens.test.mjs
```

Expected RED：files missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-brand-tokens.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh apps/web/tests/ui/midao-brand-tokens.test.mjs
```

**Commit:** `feat: 建立 Midao 品牌 token`。

## Task F2: five-item navigation model

**Files:**
- Create: `apps/web/src/features/midao/shell/nav-items.ts`
- Create: `apps/web/tests/unit/midao-nav-items.test.mjs`

**RED:** exact five labels/routes；nested matching；only one active；no secondary features in bottom nav。

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-nav-items.test.mjs
```

Expected RED：module missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/unit/midao-nav-items.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck apps/web/tests/unit/midao-nav-items.test.mjs
```

**Commit:** `feat: 定義 Midao 五項導航`。

## Task F3: mobile bottom navigation

**Files:**
- Create: `apps/web/src/features/midao/shell/MidaoBottomNav.tsx`
- Create: `apps/web/tests/ui/midao-bottom-nav-contract.test.mjs`

**RED:** exactly five nav items、semantic nav/labels、`aria-current`、44px targets、safe-area bottom padding、nested active state。Node test只鎖結構/props/CSS wiring；實際viewport/keyboard在F9 Playwright。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-bottom-nav-contract.test.mjs
```

Expected RED：component missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-bottom-nav-contract.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-bottom-nav-contract.test.mjs
```

**Commit:** `feat: 建立 Midao手機主導航`。

## Task F4: desktop sidebar and page header

**Files:**
- Create: `apps/web/src/features/midao/shell/MidaoDesktopSidebar.tsx`
- Create: `apps/web/src/features/midao/shell/MidaoPageHeader.tsx`
- Create: `apps/web/tests/ui/midao-desktop-navigation-contract.test.mjs`

**RED:** same nav model、semantic landmark、active state、header title/action slots；不得另建第二份routes。Responsive visibility只做CSS wiring contract，實際layout在F9。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-desktop-navigation-contract.test.mjs
```

Expected RED：components missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-desktop-navigation-contract.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-desktop-navigation-contract.test.mjs
```

**Commit:** `feat: 建立 Midao桌面導航`。

## Task F5: verified impersonation banner

**Files:**
- Create: `apps/web/src/features/midao/shell/MidaoImpersonationBanner.tsx`
- Create: `apps/web/tests/ui/midao-impersonation-banner-contract.test.mjs`

**RED:** only verified actor state renders；顯示代入狀態、target guide、結束代入action；不顯完整admin email/token；normal guide無banner。Browser truth/forgery在F10。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-impersonation-banner-contract.test.mjs
```

Expected RED：component missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-impersonation-banner-contract.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-impersonation-banner-contract.test.mjs
```

**Commit:** `feat: 顯示可信管理員代入狀態`。

## Task F6: shell composition and basic states

**Files:**
- Create: `apps/web/src/features/midao/shell/MidaoShell.tsx`
- Create: `apps/web/src/features/midao/ui/LoadingSkeleton.tsx`
- Create: `apps/web/src/features/midao/ui/InlineError.tsx`
- Create: `apps/web/tests/ui/midao-shell-composition.test.mjs`

**RED:** shell組合desktop/mobile nav、header、verified banner、main landmark與mobile content bottom padding；loading有`aria-busy`；error保留retry action。不要在本package預做SegmentedTabs、ConflictRecoverySheet或其他未使用primitives。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-shell-composition.test.mjs
```

Expected RED：components missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-shell-composition.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck apps/web/tests/ui/midao-shell-composition.test.mjs
```

**Commit:** `feat: 組合 Midao responsive shell`。

## Task F7: page-session guard pure boundary

**Files:**
- Create: `apps/web/src/lib/midao/page-session.ts`
- Create: `apps/web/tests/api/midao-page-session.test.mjs`

**RED:** no HMAC/session、stale version、inactive guide、legacy mode、backend flag off、valid Midao、valid/forged impersonation的deterministic outcomes；guideName只來自DB。此task不建立React layout。

```bash
node --test --test-concurrency=1 apps/web/tests/api/midao-page-session.test.mjs
```

Expected RED：helper missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs
```

**Commit:** `feat: 建立 Midao page session boundary`。

## Task F8: server layout and five route skeletons

**Files:**
- Create: `apps/web/app/(non-locale)/midao/layout.tsx`
- Create: `apps/web/app/(non-locale)/midao/loading.tsx`
- Create: `apps/web/app/(non-locale)/midao/error.tsx`
- Create: `apps/web/app/(non-locale)/midao/not-found.tsx`
- Create: `apps/web/app/(non-locale)/midao/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/requests/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/calendar/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/services/page.tsx`
- Create: `apps/web/app/(non-locale)/midao/me/page.tsx`
- Create: `apps/web/tests/ui/midao-layout-wiring.test.mjs`

**RED:** layout唯一呼叫page-session boundary並組shell；pages只組placeholder screen，不查Supabase；loading/error/not-found使用basic states；safe login next；無frozen middleware改動。Browser outcomes不由source test宣稱PASS。

```bash
node --test --test-concurrency=1 apps/web/tests/ui/midao-layout-wiring.test.mjs
```

Expected RED：routes/layout missing。

**GREEN/evidence:**

```bash
node --test --test-concurrency=1 \
  apps/web/tests/ui/midao-layout-wiring.test.mjs \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/ui/midao-shell-composition.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/ui/midao-layout-wiring.test.mjs \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/ui/midao-shell-composition.test.mjs
```

**Commit:** `feat: 建立 Midao五頁入口`。

## Gate F9: real-auth responsive navigation Playwright

**Files:**
- Create: `apps/web/e2e/midao-navigation.spec.ts`

這是F3–F8完成後的post-implementation browser acceptance，不宣稱TDD RED。Focused component/layout tasks已各自保存RED；此gate只證明真viewport、keyboard、focus與server-auth整合。

**Behavior:** 使用 `setMidaoGuideSession()`與真DB guide。單一spec兩個describe blocks，分別390×844與1440×1000；不新增全域projects。驗五route、active item、mobile/desktop visibility、no horizontal overflow、safe-area spacing、keyboard navigation、focus-visible與normal guide無banner。不得用`page.route()`繞過server auth。

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-e2e.sh \
  apps/web/e2e/midao-navigation.spec.ts
```

Expected：browser spec exit 0，Playwright實際啟動runner-owned server；cleanup後 `--check-only` PASS。

**Commit:** `test: 驗證 Midao responsive navigation`。

## Gate F10: auth, redirect and impersonation Playwright

**Files:**
- Create: `apps/web/e2e/midao-auth-and-impersonation.spec.ts`

這是C4–C6/E1–E4/F5/F7–F8完成後的post-implementation browser acceptance，不宣稱TDD RED。

**Behavior:** no cookie→guide login＋safe next；legacy fake64-char signature不能通過；valid Midao HMAC通過；forged/expired actor cookie拒絕。先用existing `adminLogin()`建立local admin session，進入真 `apps/web/app/(non-locale)/admin/guides/[guideId]/page.tsx`並操作代入按鈕；不得用 `setMidaoImpersonationSession()`跳過此positive case，positive impersonation API不得mock。真API response須讓browser落到 `/midao`，signed actor＋visible banner存在且banner顯示。接著結束代入，再重建signed actor、GET真CSRF並用seeded local test account走真session POST普通登入；read browser context cookies確認 `midao_impersonation_actor`與visible banner cookie都不存在，banner消失。C5/C6 Node contracts另證明後續canonical context為 `actorType=guide`；本package沒有guide business command，因此不宣稱audit row。

同一spec另有**必跑browser redirect matrix**，不可寫成optional：guide login用seeded account走真API/UI，safe same-realm relative `next`必須導向；admin positive仍用真API。Negative UI sanitizer cases可mock各自API response但不得mock `/midao` server auth，逐項涵蓋absolute URL、`//host`、backslash、raw `%2f`/`%5c`、double-encoded `%252f`/`%255c`、malformed `%` encoding及cross-realm `/guide`↔`/midao`。Guide hostile `next`全部落回canonical server `redirectTo`；admin hostile response全部fail closed至 `/guide/dashboard`。每case都assert browser origin始終為runner-owned localhost，無external request/navigation。

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-e2e.sh \
  apps/web/e2e/midao-auth-and-impersonation.spec.ts
```

Expected：browser spec exit 0，無auth bypass、無殘留actor/banner cookies；safe redirect與全部hostile/malformed/cross-realm matrix assertions PASS，browser origin從未離開runner-owned localhost；cleanup後 `--check-only` PASS。

**Commit:** `test: 驗證 Midao登入與代入邊界`。

---

# Package gates

## Gate G1: focused Node/typecheck evidence

```bash
test "$(node -p "process.versions.node.split('.')[0]")" = "22"
node scripts/testing/verify-staged-check-evidence.mjs --run -- \
  .claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/unit/midao-staged-evidence-verifier.test.mjs \
  apps/web/tests/unit/midao-ci-command-runner.test.mjs \
  apps/web/tests/unit/midao-local-supabase-runner.test.mjs \
  apps/web/tests/api/midao-backend-mode-migration.test.mjs \
  apps/web/tests/api/midao-notification-outbox-migration.test.mjs \
  apps/web/tests/api/midao-idempotency-migration.test.mjs \
  apps/web/tests/api/midao-audit-events-migration.test.mjs \
  apps/web/tests/api/guide-session-crypto.test.mjs \
  apps/web/tests/guide-auth.test.mjs \
  apps/web/tests/security/guide-auth-env.test.mjs \
  apps/web/tests/api/midao-guide-session-version.test.mjs \
  apps/web/tests/unit/midao-feature-flags.test.mjs \
  apps/web/tests/api/midao-impersonation-actor.test.mjs \
  apps/web/tests/api/midao-impersonation-route-actor.test.mjs \
  apps/web/tests/api/midao-guide-login-clears-impersonation.test.mjs \
  apps/web/tests/api/admin-guide-impersonation.test.mjs \
  apps/web/tests/api/midao-runtime-access-gateway.test.mjs \
  apps/web/tests/api/midao-guide-route-wrapper.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch-migration.test.mjs \
  apps/web/tests/api/midao-backend-mode-switch.test.mjs \
  apps/web/tests/api/midao-guide-login-api-redirect.test.mjs \
  apps/web/tests/ui/midao-guide-login-ui-redirect.test.mjs \
  apps/web/tests/api/midao-guide-impersonation-redirect.test.mjs \
  apps/web/tests/ui/midao-admin-impersonation-ui-redirect.test.mjs \
  apps/web/tests/security/midao-e2e-auth-seam.test.mjs \
  apps/web/tests/ui/midao-brand-tokens.test.mjs \
  apps/web/tests/unit/midao-nav-items.test.mjs \
  apps/web/tests/ui/midao-bottom-nav-contract.test.mjs \
  apps/web/tests/ui/midao-desktop-navigation-contract.test.mjs \
  apps/web/tests/ui/midao-impersonation-banner-contract.test.mjs \
  apps/web/tests/ui/midao-shell-composition.test.mjs \
  apps/web/tests/api/midao-page-session.test.mjs \
  apps/web/tests/ui/midao-layout-wiring.test.mjs
```

Expected：exit 0、tests > 0、typecheck exit 0、evidence timestamp fresh。

## Gate G2: catalog-verified local Postgres runtime

Tracked background，分開保存fresh、existing與foundation evidence：

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s node scripts/database-baseline/run-fresh-install.mjs \
  --test apps/web/tests/integration/midao-baseline-fresh-postgres.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s node scripts/database-baseline/run-existing-upgrade-rehearsal.mjs \
  --test apps/web/tests/integration/midao-baseline-existing-postgres.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-foundation-postgres.sh \
  apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs \
  apps/web/tests/integration/midao-mode-switch-postgres.test.mjs \
  apps/web/tests/integration/midao-mode-switch-concurrency-postgres.test.mjs
node scripts/testing/verify-staged-check-evidence.mjs --check-only
```

Expected：baseline＋post-cutoff＋seed、fresh/existing terminal catalog exact、ACL/RLS/RPC/rollback/concurrency全部PASS；baseline在existing lane execution count為零；ownership-safe cleanup PASS。普通134支historical replay不屬於此gate。

## Gate G3: real-auth Playwright

Tracked background：

```bash
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-e2e.sh \
  apps/web/e2e/midao-navigation.spec.ts \
  apps/web/e2e/midao-auth-and-impersonation.spec.ts
node scripts/testing/verify-staged-check-evidence.mjs --run-heavy -- \
  timeout --signal=TERM 570s bash scripts/testing/run-midao-legacy-e2e-compat.sh \
  apps/web/e2e/t1-login.spec.ts
node scripts/testing/verify-staged-check-evidence.mjs --check-only
```

Expected：Midao responsive＋auth/impersonation與unflagged legacy managed-server login spec全部PASS；不是fake middleware-only signature/runtime bypass，也不reuse外部server；cleanup後 `--check-only` PASS。

## Gate G4: full regression, lint, typecheck and build

確認Node 22後，各自以tracked background執行，底層都有timeout：

```bash
timeout --signal=TERM 570s env NODE_ENV=test \
  GUIDE_SESSION_SECRET='midao-local-test-secret-at-least-32-bytes' \
  NODE_OPTIONS='--experimental-strip-types' \
  .claude/hooks/run-checks.sh --all
timeout --signal=TERM 570s node scripts/testing/run-midao-ci-command.mjs lint
timeout --signal=TERM 570s node scripts/testing/run-midao-ci-command.mjs typecheck
timeout --signal=TERM 570s node scripts/testing/run-midao-ci-command.mjs build
```

Expected：四個commands皆exit 0。第一條保存repo harness evidence；lint/typecheck/build三條各保存exact wrapper argv、mode、allowlisted env names、sanitized fixed child argv、HEAD/tree SHA、exit與sanitized log digest。任何生成後secret、parent credential values或含值的expanded env argv都不得進child/console/log/evidence。不能合併成單一「G4 PASS」；若570秒不足，視為HOLD並診斷，不得把timeout報成PASS。

## Gate G5: independent review

Fresh spec reviewer逐條核對#1756 AC、read-back migration/runtime guard/actor/E2E seam，並重跑G1–G4。Fresh quality reviewer檢查security、PII、duplication、test quality、no bypass。任一FAIL回實作者修正，之後由fresh reviewer重驗。

## Definition of Done for #1756

- [ ] 134支historical migrations SHA-256 manifest PASS；stash內8支frozen修改未恢復、未提交。
- [ ] Baseline v1由兩次production read-only capture建立，normalized catalog／TOC／rendered SQL byte-identical；artifact無business rows／credentials，ownership manifest零unknown objects。
- [ ] Fresh lane成功套platform→單一baseline marker（含managed overlay）→6支post-cutoff→seed；fresh與existing各自對expected-terminal exact compare，existing upgrade baseline execution count為零。
- [ ] PR source gate與production release verified gate分離；baseline ledger不冒充production apply ledger。
- [ ] Six post-cutoff foundation migrations source-contract＋local runtime PASS。
- [ ] backend mode switch atomically updates mode/version/audit/outbox；fresh same-mode無business side effect；function只授權service_role。
- [ ] durable idempotency schema exists and is service-role-only。
- [ ] canonical guard checks HMAC/DB display_name/version/status/mode/flags。
- [ ] signed impersonation actor survives into route context；cross-protocol/forgery denied；普通登入與logout清cookies。
- [ ] forward mode switch default-off且受獨立gate；rollback不受flags阻擋。
- [ ] guide login與admin impersonation `redirectTo`都由real UI consume，safe same-realm與hostile/malformed/encoded/cross-realm browser matrix必跑；unsafe paths fail closed且browser origin不離開runner-owned localhost。
- [ ] `/midao` server layout does not depend on frozen middleware。
- [ ] E2E uses real HMAC and seeded local DB row，no production bypass；Midao specs與unflagged legacy managed-server `t1-login.spec.ts`真browser gate都PASS。
- [ ] five routes work on mobile/desktop with accessible shell。
- [ ] G1–G4 actual commands exit 0，包含full suite與CI-recorder lint/typecheck/build；每條有獨立sanitized evidence，CI child使用rebuilt PATH/fixed locale/empty HOME且user/global npmrc disabled。
- [ ] Staged evidence orchestrator分離exact child argv與derived semantic command；同tree evidence bundle覆蓋所有staged tests，拒絕untracked/unstaged code、unrelated-only tests與manifest drift。
- [ ] Local Supabase runner持全repo排他lock、核對owned identity、redact logs且只stop owned stack；Playwright不reuse existing server。
- [ ] ACL catalog、RLS policy catalog與temporary probe DML三層runtime驗證PASS。
- [ ] Independent spec＋quality reviews PASS。
- [ ] Worklog/issue contain exact commands、exit codes、commit SHA、remaining blockers。
- [ ] No push/PR/merge/deploy/production mutation without separate authorization。
