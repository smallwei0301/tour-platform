# midao2 後端（M1–M3）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 midao2 接案 CRM 的完整後端——2 個 migration、3 個領域資料檔、LINE 通知模組、13 支 v2 API，全部以 `node --test` 綠燈驗證。

**Architecture:** 服務＝既有 `activities`（加 midao 欄位，雙軌可見度）；需求單/可用時間為新表；領域檔走 strangler 模式（不碰 `db.mjs`，`hasSupabaseEnv()` in-memory fallback 供測試）；API 分導遊端（`verifyGuideSession`＋CSRF）與公開端（rate-limit＋honeypot）。

**Tech Stack:** Next.js 15 App Router route handlers、Supabase JS（service-role）、zod（`parseBody`）、Node 22 內建 test runner（`.mjs`）。

**Spec:** `docs/superpowers/specs/2026-07-22-midao2-guide-backend-design.md`（§4 資料模型、§5 API 契約、§6–§9 安全/通知/錯誤/測試）。

## Global Constraints

- Node 22；fresh container 先 `npm install --ignore-scripts`，裝完丟棄 `yarn.lock` 改動（`git checkout -- yarn.lock`）。
- **commit 前必須**：`.claude/hooks/run-checks.sh <本任務 test 檔…>` 綠燈（bash-guard 強制）。`git add` 與 `git commit` 分開兩次 Bash 呼叫（hook 在執行前檢查 staged 區）。
- migration 只增不改，檔名時間戳（`20260722…_slug.sql`）；不動既有 `supabase/migrations/**`。
- 新資料存取函式**禁止**寫進 `db.mjs`；一律落 `db-midao-*.mjs` 領域檔，`import { hasSupabaseEnv, getSupabase } from './db.mjs'`。
- API 回應 envelope 用 `jsonOk(data)` / `jsonError(code, message, status)`（`src/lib/api-response.ts`；`{success:true,data}` 形狀，勿手刻——有 ratchet guard）。catch 用 `handleRouteError(err, { route })`（`src/lib/route-error.ts`）。
- 錯誤碼英文大寫蛇底、message 繁體中文。程式註解繁中（跟隨 codebase）。
- 凍結區零接觸：不改 `apps/web/middleware.ts`、`app/api/{orders,payments}/**`、既有 migrations、受保護 e2e。
- 所有導遊端查詢強制 `guide_id = session.guideId`；公開端不回傳導遊私人資料（email/LINE 綁定/銀行）。
- log 與錯誤上報不落旅客 `lineId`/`email`。
- 每個任務結尾 commit；branch：`claude/superpowers-midao-backend-x90czx`。

---

### Task 1: Migration A — midao 新表（需求單＋可用時間）

**Files:**
- Create: `supabase/migrations/20260722100000_midao2_requests_availability.sql`
- Test: `apps/web/tests/unit/midao2-migration-contract.test.mjs`

**Interfaces:**
- Produces: 資料表 `midao_requests`、`midao_availability_defaults`、`midao_day_overrides`（欄位如下 SQL）。後續領域檔（Task 3/4）的 Supabase 路徑依賴這些表。

- [ ] **Step 1: 寫 migration SQL**

```sql
-- 20260722100000_midao2_requests_availability.sql
-- midao2 接案 CRM（spec: docs/superpowers/specs/2026-07-22-midao2-guide-backend-design.md §4.2/§4.4）
-- 新表 ×3：旅客需求單、週可用時間預設、單日覆寫。只增不改。

CREATE TABLE IF NOT EXISTS midao_requests (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no              text        UNIQUE NOT NULL,
  guide_id                uuid        NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  activity_id             uuid        REFERENCES activities(id) ON DELETE SET NULL,
  activity_title_snapshot text,
  traveler_name           text        NOT NULL,
  traveler_line_id        text,
  traveler_email          text,
  preferred_date          date        NOT NULL,
  backup_date             date,
  preferred_period        text        CHECK (preferred_period IN ('morning','afternoon','evening')),
  start_time              time,
  end_time                time,
  participants_count      integer     NOT NULL DEFAULT 1,
  participants_note       text,
  language                text,
  need_pickup             boolean     NOT NULL DEFAULT false,
  special_note            text,
  answers                 jsonb       NOT NULL DEFAULT '[]',
  status                  text        NOT NULL DEFAULT 'new'
                            CHECK (status IN ('new','pending_reply','replied','closed_won','closed_done')),
  source                  text        NOT NULL DEFAULT 'public_page'
                            CHECK (source IN ('public_page','manual')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  status_changed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_midao_requests_guide_status ON midao_requests(guide_id, status);
CREATE INDEX IF NOT EXISTS idx_midao_requests_guide_date   ON midao_requests(guide_id, preferred_date);

CREATE TABLE IF NOT EXISTS midao_availability_defaults (
  id       uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid     NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  weekday  smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  period   text     NOT NULL CHECK (period IN ('morning','afternoon','evening')),
  is_open  boolean  NOT NULL DEFAULT false,
  UNIQUE (guide_id, weekday, period)
);

CREATE TABLE IF NOT EXISTS midao_day_overrides (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id     uuid        NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  date         date        NOT NULL,
  period       text        NOT NULL CHECK (period IN ('morning','afternoon','evening','custom')),
  is_open      boolean     NOT NULL DEFAULT true,
  custom_start time,
  custom_end   time,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 非 custom 時段每日唯一（custom 可多筆）
CREATE UNIQUE INDEX IF NOT EXISTS uq_midao_day_overrides_period
  ON midao_day_overrides(guide_id, date, period) WHERE period <> 'custom';
CREATE INDEX IF NOT EXISTS idx_midao_day_overrides_guide_date ON midao_day_overrides(guide_id, date);

-- server 端一律走 service-role；RLS 開啟＋不建 policy＝anon/authenticated 預設拒絕
ALTER TABLE midao_requests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE midao_availability_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE midao_day_overrides         ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: 寫 migration 契約測試（守住檔名與關鍵 DDL，防手滑改壞）**

```js
// apps/web/tests/unit/midao2-migration-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

test('midao2 migration A：三張新表＋索引＋RLS 齊備', async () => {
  const sql = await readFile(
    path.join(MIGRATIONS, '20260722100000_midao2_requests_availability.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS midao_requests/);
  assert.match(sql, /request_no\s+text\s+UNIQUE NOT NULL/);
  assert.match(sql, /CHECK \(status IN \('new','pending_reply','replied','closed_won','closed_done'\)\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS midao_availability_defaults/);
  assert.match(sql, /UNIQUE \(guide_id, weekday, period\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS midao_day_overrides/);
  assert.match(sql, /WHERE period <> 'custom'/);
  assert.match(sql, /ALTER TABLE midao_requests\s+ENABLE ROW LEVEL SECURITY/);
});
```

- [ ] **Step 3: 跑測試確認綠燈**

Run: `node --test apps/web/tests/unit/midao2-migration-contract.test.mjs`
Expected: PASS（1 test）

- [ ] **Step 4: 取得 commit 證據並 commit（add 與 commit 分兩次呼叫）**

```bash
.claude/hooks/run-checks.sh apps/web/tests/unit/midao2-migration-contract.test.mjs
git add supabase/migrations/20260722100000_midao2_requests_availability.sql apps/web/tests/unit/midao2-migration-contract.test.mjs
```
然後：
```bash
git commit -m "feat(midao2): migration A — 需求單與可用時間三新表"
```

**注意**：本 migration 只 commit 進 repo，**不在本階段套用到生產**（`apply_migration` 需 SQL-OVERRIDE 授權＋ledger 流程，見 CLAUDE.md 鐵律 2；套用時機＝PR merge 後由使用者授權）。

---

### Task 2: Migration B — activities/guide_profiles 加欄位

**Files:**
- Create: `supabase/migrations/20260722100500_midao2_activity_showcase_columns.sql`
- Modify: `apps/web/tests/unit/midao2-migration-contract.test.mjs`（追加一個 test）

**Interfaces:**
- Produces: `activities.midao_status/midao_deal_mode/midao_questions/languages/midao_sort_order`、`guide_profiles.experience_years`。Task 5 的 Supabase 路徑依賴。

- [ ] **Step 1: 寫 migration SQL**

```sql
-- 20260722100500_midao2_activity_showcase_columns.sql
-- midao2 雙軌可見度＋精靈欄位（spec §4.1/§4.5）。只增不改。
ALTER TABLE activities ADD COLUMN IF NOT EXISTS midao_status text
  CHECK (midao_status IN ('draft','published'));
ALTER TABLE activities ADD COLUMN IF NOT EXISTS midao_deal_mode text NOT NULL DEFAULT 'confirm_first'
  CHECK (midao_deal_mode IN ('instant_booking','confirm_first','line_inquiry'));
ALTER TABLE activities ADD COLUMN IF NOT EXISTS midao_questions jsonb NOT NULL DEFAULT '[]';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS languages jsonb NOT NULL DEFAULT '[]';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS midao_sort_order integer;

ALTER TABLE guide_profiles ADD COLUMN IF NOT EXISTS experience_years integer;
```

- [ ] **Step 2: 追加契約測試**

```js
test('midao2 migration B：activities/guide_profiles 加欄齊備', async () => {
  const sql = await readFile(
    path.join(MIGRATIONS, '20260722100500_midao2_activity_showcase_columns.sql'), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS midao_status text/);
  assert.match(sql, /CHECK \(midao_deal_mode IN \('instant_booking','confirm_first','line_inquiry'\)\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS midao_questions jsonb NOT NULL DEFAULT '\[\]'/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS languages jsonb/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS midao_sort_order integer/);
  assert.match(sql, /ALTER TABLE guide_profiles ADD COLUMN IF NOT EXISTS experience_years integer/);
});
```

- [ ] **Step 3: 跑測試**

Run: `node --test apps/web/tests/unit/midao2-migration-contract.test.mjs`
Expected: PASS（2 tests）

- [ ] **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/unit/midao2-migration-contract.test.mjs
git add supabase/migrations/20260722100500_midao2_activity_showcase_columns.sql apps/web/tests/unit/midao2-migration-contract.test.mjs
```
```bash
git commit -m "feat(midao2): migration B — activities 雙軌可見度與精靈欄位、guide_profiles.experience_years"
```

---

### Task 3: `db-midao-requests.mjs` 領域檔（TDD）

**Files:**
- Create: `apps/web/src/lib/db-midao-requests.mjs`
- Test: `apps/web/tests/unit/db-midao-requests.test.mjs`

**Interfaces（Produces；Task 7/10 的 route 依賴這些簽名）:**
- `MIDAO_REQUEST_STATUSES: string[]`
- `isValidRequestTransition(from: string, to: string): boolean`
- `normalizeRequestInput(input: any): {ok:true, value:any} | {ok:false, code:string, message:string}`
- `createMidaoRequestDb({guideId, activityId, activityTitle, value, source}): Promise<Request形>`（產 `request_no`）
- `listMidaoRequestsDb(guideId, {status?: 'all'|'new'|'pending_reply'|'replied'|'closed', sort?: 'unreplied_first'|'newest'}): Promise<{items: Request形[], tabCounts: {new,pendingReply,replied,closed}}>`
- `getMidaoRequestDb(guideId, id): Promise<Request形|null>`
- `updateMidaoRequestStatusDb(guideId, id, status): Promise<{ok:true, request:Request形}|{ok:false, code:'NOT_FOUND'|'INVALID_TRANSITION', message:string}>`
- `getMidaoSummaryDb(guideId): Promise<{counts:{newRequests,pendingReply}, topRequest:Request形|null, recentRequests:Request形[]}>`
- 測試 seam：`__resetMemMidaoRequests()`、`__seedMemMidaoRequests(rows)`
- **Request形（camelCase）**：`{id, requestNo, travelerName, travelerLineId, travelerEmail, activityId, activityTitle, preferredDate, backupDate, preferredPeriod, startTime, endTime, participantsCount, participantsNote, language, needPickup, specialNote, answers, status, source, createdAt, statusChangedAt}`

- [ ] **Step 1: 寫失敗測試**

```js
// apps/web/tests/unit/db-midao-requests.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIDAO_REQUEST_STATUSES, isValidRequestTransition, normalizeRequestInput,
  createMidaoRequestDb, listMidaoRequestsDb, getMidaoRequestDb,
  updateMidaoRequestStatusDb, getMidaoSummaryDb, __resetMemMidaoRequests,
} from '../../src/lib/db-midao-requests.mjs';

const G = 'guide-1';
function baseInput(over = {}) {
  return {
    travelerName: '王小姐', travelerLineId: 'wang123', travelerEmail: '',
    preferredDate: '2026-08-15', backupDate: '2026-08-16', preferredPeriod: 'morning',
    participantsCount: 4, participantsNote: '含 1 位 8 歲兒童', language: '中文',
    needPickup: false, specialNote: '膝蓋曾受傷', answers: [], ...over,
  };
}
async function create(over = {}) {
  const norm = normalizeRequestInput(baseInput(over));
  assert.equal(norm.ok, true, JSON.stringify(norm));
  return createMidaoRequestDb({
    guideId: G, activityId: 'act-1', activityTitle: '柴山私人秘境導覽',
    value: norm.value, source: 'public_page',
  });
}

test.beforeEach(() => __resetMemMidaoRequests());

test('狀態機：合法/非法轉換', () => {
  assert.deepEqual(MIDAO_REQUEST_STATUSES,
    ['new', 'pending_reply', 'replied', 'closed_won', 'closed_done']);
  assert.equal(isValidRequestTransition('new', 'pending_reply'), true);
  assert.equal(isValidRequestTransition('pending_reply', 'replied'), true);
  assert.equal(isValidRequestTransition('replied', 'closed_won'), true);
  assert.equal(isValidRequestTransition('closed_won', 'closed_done'), true);
  assert.equal(isValidRequestTransition('new', 'closed_done'), true);      // 直接結案
  assert.equal(isValidRequestTransition('closed_won', 'replied'), true);   // 允許回退
  assert.equal(isValidRequestTransition('replied', 'new'), false);         // 不可回到 new
  assert.equal(isValidRequestTransition('replied', 'replied'), false);     // 同狀態非轉換
  assert.equal(isValidRequestTransition('new', 'bogus'), false);
});

test('normalizeRequestInput：聯絡方式至少一種、長度上限', () => {
  const r1 = normalizeRequestInput(baseInput({ travelerLineId: '', travelerEmail: '' }));
  assert.equal(r1.ok, false); assert.equal(r1.code, 'CONTACT_REQUIRED');
  const r2 = normalizeRequestInput(baseInput({ specialNote: 'x'.repeat(501) }));
  assert.equal(r2.ok, false); assert.equal(r2.code, 'NOTE_TOO_LONG');
  const r3 = normalizeRequestInput(baseInput({ travelerName: '' }));
  assert.equal(r3.ok, false); assert.equal(r3.code, 'INVALID_NAME');
  const r4 = normalizeRequestInput(baseInput({ preferredDate: 'not-a-date' }));
  assert.equal(r4.ok, false); assert.equal(r4.code, 'INVALID_DATE');
  const r5 = normalizeRequestInput(baseInput());
  assert.equal(r5.ok, true);
});

test('request_no：R+日期+3位流水，同日遞增', async () => {
  const a = await create(); const b = await create();
  assert.match(a.requestNo, /^R20260815\d{3}$/);
  assert.equal(Number(b.requestNo.slice(-3)), Number(a.requestNo.slice(-3)) + 1);
});

test('list：分頁計數與未回覆優先排序', async () => {
  const a = await create(); // new
  const b = await create(); // new → replied
  await updateMidaoRequestStatusDb(G, b.id, 'pending_reply');
  await updateMidaoRequestStatusDb(G, b.id, 'replied');
  const c = await create(); // new → closed_won
  await updateMidaoRequestStatusDb(G, c.id, 'closed_won');

  const all = await listMidaoRequestsDb(G, { status: 'all', sort: 'unreplied_first' });
  assert.deepEqual(all.tabCounts, { new: 1, pendingReply: 0, replied: 1, closed: 1 });
  assert.equal(all.items[0].id, a.id); // 未回覆（new）排最前
  const closed = await listMidaoRequestsDb(G, { status: 'closed' });
  assert.deepEqual(closed.items.map((r) => r.id), [c.id]);
  // 越權隔離：其他 guide 看不到
  const other = await listMidaoRequestsDb('guide-2', {});
  assert.equal(other.items.length, 0);
});

test('狀態更新：合法轉換過、非法擋、NOT_FOUND', async () => {
  const a = await create();
  const ok = await updateMidaoRequestStatusDb(G, a.id, 'pending_reply');
  assert.equal(ok.ok, true); assert.equal(ok.request.status, 'pending_reply');
  const bad = await updateMidaoRequestStatusDb(G, a.id, 'new');
  assert.equal(bad.ok, false); assert.equal(bad.code, 'INVALID_TRANSITION');
  const miss = await updateMidaoRequestStatusDb(G, 'nope', 'replied');
  assert.equal(miss.ok, false); assert.equal(miss.code, 'NOT_FOUND');
  // 越權：guide-2 動不了 guide-1 的單
  const foreign = await updateMidaoRequestStatusDb('guide-2', a.id, 'replied');
  assert.equal(foreign.ok, false); assert.equal(foreign.code, 'NOT_FOUND');
});

test('summary：counts/topRequest/recentRequests', async () => {
  const a = await create();
  const b = await create();
  await updateMidaoRequestStatusDb(G, b.id, 'pending_reply');
  const s = await getMidaoSummaryDb(G);
  assert.deepEqual(s.counts, { newRequests: 1, pendingReply: 1 });
  assert.equal(s.topRequest.id, a.id); // 最舊的 new 優先
  assert.equal(Array.isArray(s.recentRequests), true);
  assert.equal(s.recentRequests.some((r) => r.id === a.id), false); // 不含 topRequest
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test apps/web/tests/unit/db-midao-requests.test.mjs`
Expected: FAIL（`Cannot find module … db-midao-requests.mjs`）

- [ ] **Step 3: 實作領域檔**

```js
// apps/web/src/lib/db-midao-requests.mjs
// @ts-check
/**
 * midao2 旅客需求單資料存取（strangler 領域檔，不進 db.mjs）。
 * spec: docs/superpowers/specs/2026-07-22-midao2-guide-backend-design.md §4.2/§4.3
 * 狀態機：new → pending_reply → replied → closed_won → closed_done；允許回退、不可回到 new。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';

export const MIDAO_REQUEST_STATUSES = ['new', 'pending_reply', 'replied', 'closed_won', 'closed_done'];
const PERIODS = ['morning', 'afternoon', 'evening'];
const SELECT_COLS = 'id, request_no, guide_id, activity_id, activity_title_snapshot, traveler_name, traveler_line_id, traveler_email, preferred_date, backup_date, preferred_period, start_time, end_time, participants_count, participants_note, language, need_pickup, special_note, answers, status, source, created_at, status_changed_at';

/** in-memory fallback（測試 seam） */
const _mem = [];
let _memSeq = 0;
export function __resetMemMidaoRequests() { _mem.length = 0; _memSeq = 0; }
export function __seedMemMidaoRequests(rows) { _mem.push(...rows); }

/** @param {string} from @param {string} to */
export function isValidRequestTransition(from, to) {
  if (!MIDAO_REQUEST_STATUSES.includes(from) || !MIDAO_REQUEST_STATUSES.includes(to)) return false;
  if (to === 'new') return false; // new 只在建立時出現
  return from !== to;
}

/** row(snake) → API 形（camel） @param {any} r */
function shape(r) {
  return {
    id: r.id, requestNo: r.request_no,
    travelerName: r.traveler_name, travelerLineId: r.traveler_line_id ?? null, travelerEmail: r.traveler_email ?? null,
    activityId: r.activity_id ?? null, activityTitle: r.activity_title_snapshot ?? null,
    preferredDate: r.preferred_date, backupDate: r.backup_date ?? null,
    preferredPeriod: r.preferred_period ?? null, startTime: r.start_time ?? null, endTime: r.end_time ?? null,
    participantsCount: r.participants_count, participantsNote: r.participants_note ?? null,
    language: r.language ?? null, needPickup: !!r.need_pickup, specialNote: r.special_note ?? null,
    answers: Array.isArray(r.answers) ? r.answers : [],
    status: r.status, source: r.source, createdAt: r.created_at, statusChangedAt: r.status_changed_at,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 正規化並驗證需求單輸入（公開送單/手動建單共用）。
 * @param {any} input
 * @returns {{ok:true, value:any}|{ok:false, code:string, message:string}}
 */
export function normalizeRequestInput(input) {
  const name = String(input?.travelerName ?? '').trim();
  if (!name || name.length > 60) return { ok: false, code: 'INVALID_NAME', message: '請填寫稱呼（60 字內）' };
  const lineId = String(input?.travelerLineId ?? '').trim();
  const email = String(input?.travelerEmail ?? '').trim();
  if (!lineId && !email) return { ok: false, code: 'CONTACT_REQUIRED', message: '請至少留下 LINE ID 或 Email 其中一種聯絡方式' };
  if (lineId.length > 120) return { ok: false, code: 'INVALID_CONTACT', message: 'LINE ID 過長' };
  if (email && (email.length > 254 || !email.includes('@'))) return { ok: false, code: 'INVALID_CONTACT', message: 'Email 格式不正確' };
  const preferredDate = String(input?.preferredDate ?? '').trim();
  if (!DATE_RE.test(preferredDate)) return { ok: false, code: 'INVALID_DATE', message: '請選擇希望日期' };
  const backupDate = String(input?.backupDate ?? '').trim();
  if (backupDate && !DATE_RE.test(backupDate)) return { ok: false, code: 'INVALID_DATE', message: '備用日期格式不正確' };
  const period = String(input?.preferredPeriod ?? '').trim();
  if (period && !PERIODS.includes(period)) return { ok: false, code: 'INVALID_PERIOD', message: '時段不正確' };
  const participants = Math.trunc(Number(input?.participantsCount));
  if (!Number.isFinite(participants) || participants < 1 || participants > 99) {
    return { ok: false, code: 'INVALID_PARTICIPANTS', message: '人數需為 1–99' };
  }
  const specialNote = String(input?.specialNote ?? '').trim();
  if (specialNote.length > 500) return { ok: false, code: 'NOTE_TOO_LONG', message: '特殊需求最多 500 字' };
  const participantsNote = String(input?.participantsNote ?? '').trim().slice(0, 200);
  const answers = Array.isArray(input?.answers) ? input.answers.slice(0, 20).map((a) => ({
    questionId: String(a?.questionId ?? ''), label: String(a?.label ?? '').slice(0, 120),
    answer: String(a?.answer ?? '').slice(0, 300),
  })) : [];
  if (JSON.stringify(answers).length > 10240) return { ok: false, code: 'ANSWERS_TOO_LONG', message: '回答內容過長' };
  return {
    ok: true,
    value: {
      traveler_name: name, traveler_line_id: lineId || null, traveler_email: email || null,
      preferred_date: preferredDate, backup_date: backupDate || null,
      preferred_period: period || null,
      start_time: input?.startTime || null, end_time: input?.endTime || null,
      participants_count: participants, participants_note: participantsNote || null,
      language: String(input?.language ?? '').trim().slice(0, 40) || null,
      need_pickup: input?.needPickup === true, special_note: specialNote || null,
      answers,
    },
  };
}

/** 產當日流水 request_no（衝突重試 3 次後改隨機尾碼） @param {string} preferredDate */
async function nextRequestNo(preferredDate, attempt = 0) {
  const ymd = preferredDate.replaceAll('-', '');
  if (!hasSupabaseEnv()) {
    const prefix = `R${ymd}`;
    const seq = _mem.filter((r) => String(r.request_no).startsWith(prefix)).length + 1 + attempt;
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }
  const supabase = await getSupabase();
  const { count } = await supabase.from('midao_requests')
    .select('id', { count: 'exact', head: true }).like('request_no', `R${ymd}%`);
  if (attempt >= 3) return `R${ymd}${String(Math.floor(1000 + Math.random() * 9000))}`;
  return `R${ymd}${String((count ?? 0) + 1 + attempt).padStart(3, '0')}`;
}

/**
 * 建立需求單。value 需先過 normalizeRequestInput。
 * @param {{guideId:string, activityId?:string|null, activityTitle?:string|null, value:any, source?:'public_page'|'manual'}} input
 */
export async function createMidaoRequestDb({ guideId, activityId = null, activityTitle = null, value, source = 'public_page' }) {
  const now = new Date().toISOString();
  for (let attempt = 0; attempt <= 3; attempt++) {
    const requestNo = await nextRequestNo(value.preferred_date, attempt);
    const row = {
      request_no: requestNo, guide_id: guideId, activity_id: activityId,
      activity_title_snapshot: activityTitle, ...value,
      status: 'new', source, created_at: now, updated_at: now, status_changed_at: now,
    };
    if (!hasSupabaseEnv()) {
      if (_mem.some((r) => r.request_no === requestNo)) continue;
      const created = { id: `mreq_${String(++_memSeq).padStart(6, '0')}`, ...row };
      _mem.push(created);
      return shape(created);
    }
    const supabase = await getSupabase();
    const { data, error } = await supabase.from('midao_requests').insert(row).select(SELECT_COLS).single();
    if (!error) return shape(data);
    if (error.code === '23505') continue; // request_no 撞號 → 重試
    throw new Error(error.message);
  }
  throw new Error('REQUEST_NO_EXHAUSTED');
}

async function fetchGuideRows(guideId) {
  if (!hasSupabaseEnv()) return _mem.filter((r) => r.guide_id === guideId);
  const supabase = await getSupabase();
  const { data } = await supabase.from('midao_requests').select(SELECT_COLS)
    .eq('guide_id', guideId).order('created_at', { ascending: false }).limit(200);
  return Array.isArray(data) ? data : [];
}

const UNREPLIED = ['new', 'pending_reply'];
const TAB_FILTERS = {
  all: () => true,
  new: (r) => r.status === 'new',
  pending_reply: (r) => r.status === 'pending_reply',
  replied: (r) => r.status === 'replied',
  closed: (r) => r.status === 'closed_won' || r.status === 'closed_done',
};

/**
 * 需求列表＋分頁計數。冷啟動量級（≤200 筆/導遊）在 JS 端排序。
 * @param {string} guideId
 * @param {{status?:string, sort?:'unreplied_first'|'newest'}} [opts]
 */
export async function listMidaoRequestsDb(guideId, opts = {}) {
  const rows = await fetchGuideRows(guideId);
  const tabCounts = {
    new: rows.filter(TAB_FILTERS.new).length,
    pendingReply: rows.filter(TAB_FILTERS.pending_reply).length,
    replied: rows.filter(TAB_FILTERS.replied).length,
    closed: rows.filter(TAB_FILTERS.closed).length,
  };
  const filter = TAB_FILTERS[opts.status ?? 'all'] ?? TAB_FILTERS.all;
  let items = rows.filter(filter);
  items = items.sort((a, b) => {
    if ((opts.sort ?? 'unreplied_first') === 'unreplied_first') {
      const ua = UNREPLIED.includes(a.status) ? 0 : 1;
      const ub = UNREPLIED.includes(b.status) ? 0 : 1;
      if (ua !== ub) return ua - ub;
    }
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return { items: items.map(shape), tabCounts };
}

/** @param {string} guideId @param {string} id */
export async function getMidaoRequestDb(guideId, id) {
  if (!hasSupabaseEnv()) {
    const row = _mem.find((r) => r.id === id && r.guide_id === guideId);
    return row ? shape(row) : null;
  }
  const supabase = await getSupabase();
  const { data } = await supabase.from('midao_requests').select(SELECT_COLS)
    .eq('id', id).eq('guide_id', guideId).maybeSingle();
  return data ? shape(data) : null;
}

/**
 * 狀態更新（含合法轉換驗證與 ownership）。
 * @param {string} guideId @param {string} id @param {string} status
 * @returns {Promise<{ok:true, request:any}|{ok:false, code:string, message:string}>}
 */
export async function updateMidaoRequestStatusDb(guideId, id, status) {
  const current = await getMidaoRequestDb(guideId, id);
  if (!current) return { ok: false, code: 'NOT_FOUND', message: '需求單不存在' };
  if (!isValidRequestTransition(current.status, status)) {
    return { ok: false, code: 'INVALID_TRANSITION', message: `無法從 ${current.status} 轉為 ${status}` };
  }
  const now = new Date().toISOString();
  if (!hasSupabaseEnv()) {
    const row = _mem.find((r) => r.id === id && r.guide_id === guideId);
    Object.assign(row, { status, updated_at: now, status_changed_at: now });
    return { ok: true, request: shape(row) };
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('midao_requests')
    .update({ status, updated_at: now, status_changed_at: now })
    .eq('id', id).eq('guide_id', guideId).select(SELECT_COLS).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ok: true, request: shape(data) } : { ok: false, code: 'NOT_FOUND', message: '需求單不存在' };
}

/** 首頁摘要。 @param {string} guideId */
export async function getMidaoSummaryDb(guideId) {
  const rows = await fetchGuideRows(guideId);
  const news = rows.filter((r) => r.status === 'new')
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const pendings = rows.filter((r) => r.status === 'pending_reply')
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const top = news[0] ?? pendings[0] ?? null;
  const recent = rows.filter((r) => !top || r.id !== top.id)
    .sort((a, b) => String(b.status_changed_at).localeCompare(String(a.status_changed_at)))
    .slice(0, 3);
  return {
    counts: { newRequests: news.length, pendingReply: pendings.length },
    topRequest: top ? shape(top) : null,
    recentRequests: recent.map(shape),
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test apps/web/tests/unit/db-midao-requests.test.mjs`
Expected: PASS（6 tests）

- [ ] **Step 5: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/unit/db-midao-requests.test.mjs
git add apps/web/src/lib/db-midao-requests.mjs apps/web/tests/unit/db-midao-requests.test.mjs
```
```bash
git commit -m "feat(midao2): db-midao-requests 領域檔（狀態機/request_no/列表/摘要）"
```

---

### Task 4: `db-midao-availability.mjs` 領域檔（TDD）

**Files:**
- Create: `apps/web/src/lib/db-midao-availability.mjs`
- Test: `apps/web/tests/unit/db-midao-availability.test.mjs`

**Interfaces（Produces；Task 9/10 依賴）:**
- `MIDAO_PERIODS = ['morning','afternoon','evening']`
- `resolveEffectiveDay(defaults: {morning,afternoon,evening}|null, overrides: Array<{period,is_open,custom_start,custom_end}>): {morning:boolean, afternoon:boolean, evening:boolean, custom: Array<{start,end,isOpen}>}`（純函式）
- `getWeeklyDefaultsDb(guideId): Promise<Array<{weekday, morning, afternoon, evening}>>`（固定 7 筆，缺值補 false）
- `setWeeklyDefaultsDb(guideId, weekdays: Array<{weekday, morning, afternoon, evening}>): Promise<void>`（整組 upsert）
- `setDayOverrideDb(guideId, date, patch: {morning?, afternoon?, evening?, custom?: Array<{start,end,isOpen}>}): Promise<void>`
- `getMonthEffectiveDb(guideId, month: 'YYYY-MM'): Promise<Array<{date, morning, afternoon, evening, custom[]}>>`
- 測試 seam：`__resetMemMidaoAvailability()`

- [ ] **Step 1: 寫失敗測試**

```js
// apps/web/tests/unit/db-midao-availability.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIDAO_PERIODS, resolveEffectiveDay, getWeeklyDefaultsDb, setWeeklyDefaultsDb,
  setDayOverrideDb, getMonthEffectiveDb, __resetMemMidaoAvailability,
} from '../../src/lib/db-midao-availability.mjs';

const G = 'guide-1';
test.beforeEach(() => __resetMemMidaoAvailability());

test('resolveEffectiveDay：覆寫 > 預設 > 關閉', () => {
  // 無預設無覆寫 → 全關
  assert.deepEqual(resolveEffectiveDay(null, []),
    { morning: false, afternoon: false, evening: false, custom: [] });
  // 預設開下午 → 下午開
  const d = { morning: false, afternoon: true, evening: false };
  assert.equal(resolveEffectiveDay(d, []).afternoon, true);
  // 覆寫關下午、開晚上 → 覆寫勝
  const eff = resolveEffectiveDay(d, [
    { period: 'afternoon', is_open: false }, { period: 'evening', is_open: true },
    { period: 'custom', is_open: true, custom_start: '10:00', custom_end: '12:00' },
  ]);
  assert.equal(eff.afternoon, false);
  assert.equal(eff.evening, true);
  assert.deepEqual(eff.custom, [{ start: '10:00', end: '12:00', isOpen: true }]);
});

test('週預設：整組寫入後讀回固定 7 筆', async () => {
  await setWeeklyDefaultsDb(G, [{ weekday: 6, morning: false, afternoon: true, evening: true }]);
  const rows = await getWeeklyDefaultsDb(G);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[6], { weekday: 6, morning: false, afternoon: true, evening: true });
  assert.deepEqual(rows[0], { weekday: 0, morning: false, afternoon: false, evening: false });
});

test('月生效展開：預設＋單日覆寫', async () => {
  // 2026-08-15 是週六（weekday 6）
  await setWeeklyDefaultsDb(G, [{ weekday: 6, morning: true, afternoon: true, evening: false }]);
  await setDayOverrideDb(G, '2026-08-15', { morning: false, evening: true });
  const month = await getMonthEffectiveDb(G, '2026-08');
  assert.equal(month.length, 31);
  const d15 = month.find((d) => d.date === '2026-08-15');
  assert.deepEqual({ m: d15.morning, a: d15.afternoon, e: d15.evening },
    { m: false, a: true, e: true }); // morning 覆寫關、afternoon 用預設、evening 覆寫開
  const d22 = month.find((d) => d.date === '2026-08-22'); // 另一個週六，純預設
  assert.deepEqual({ m: d22.morning, a: d22.afternoon, e: d22.evening },
    { m: true, a: true, e: false });
  // 越權隔離
  const other = await getMonthEffectiveDb('guide-2', '2026-08');
  assert.equal(other.every((d) => !d.morning && !d.afternoon && !d.evening), true);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test apps/web/tests/unit/db-midao-availability.test.mjs`
Expected: FAIL（module not found）

- [ ] **Step 3: 實作**

```js
// apps/web/src/lib/db-midao-availability.mjs
// @ts-check
/**
 * midao2 可用時間（週預設＋單日覆寫；spec §4.4）。獨立輕量，不碰 availability-v2。
 * 生效邏輯：單日覆寫 > 週預設 > 預設關閉。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';

export const MIDAO_PERIODS = ['morning', 'afternoon', 'evening'];

const _memDefaults = [];  // {guide_id, weekday, period, is_open}
const _memOverrides = []; // {guide_id, date, period, is_open, custom_start, custom_end}
export function __resetMemMidaoAvailability() { _memDefaults.length = 0; _memOverrides.length = 0; }

/**
 * 純函式：套用覆寫到預設。
 * @param {{morning:boolean,afternoon:boolean,evening:boolean}|null} defaults
 * @param {Array<{period:string,is_open:boolean,custom_start?:string|null,custom_end?:string|null}>} overrides
 */
export function resolveEffectiveDay(defaults, overrides) {
  const eff = {
    morning: defaults?.morning ?? false,
    afternoon: defaults?.afternoon ?? false,
    evening: defaults?.evening ?? false,
    custom: /** @type {Array<{start:string,end:string,isOpen:boolean}>} */ ([]),
  };
  for (const o of overrides ?? []) {
    if (o.period === 'custom') {
      if (o.custom_start && o.custom_end) {
        eff.custom.push({ start: o.custom_start, end: o.custom_end, isOpen: !!o.is_open });
      }
    } else if (MIDAO_PERIODS.includes(o.period)) {
      eff[o.period] = !!o.is_open;
    }
  }
  return eff;
}

/** @param {string} guideId */
export async function getWeeklyDefaultsDb(guideId) {
  let rows;
  if (!hasSupabaseEnv()) {
    rows = _memDefaults.filter((r) => r.guide_id === guideId);
  } else {
    const supabase = await getSupabase();
    const { data } = await supabase.from('midao_availability_defaults')
      .select('weekday, period, is_open').eq('guide_id', guideId);
    rows = Array.isArray(data) ? data : [];
  }
  return Array.from({ length: 7 }, (_, weekday) => {
    const day = { weekday, morning: false, afternoon: false, evening: false };
    for (const r of rows.filter((x) => x.weekday === weekday)) {
      if (MIDAO_PERIODS.includes(r.period)) day[r.period] = !!r.is_open;
    }
    return day;
  });
}

/**
 * 整組 upsert 週預設（只寫有給的 weekday）。
 * @param {string} guideId
 * @param {Array<{weekday:number, morning?:boolean, afternoon?:boolean, evening?:boolean}>} weekdays
 */
export async function setWeeklyDefaultsDb(guideId, weekdays) {
  const rows = [];
  for (const w of weekdays ?? []) {
    const weekday = Math.trunc(Number(w?.weekday));
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    for (const period of MIDAO_PERIODS) {
      rows.push({ guide_id: guideId, weekday, period, is_open: w?.[period] === true });
    }
  }
  if (!rows.length) return;
  if (!hasSupabaseEnv()) {
    for (const row of rows) {
      const i = _memDefaults.findIndex((r) =>
        r.guide_id === guideId && r.weekday === row.weekday && r.period === row.period);
      if (i >= 0) _memDefaults[i] = row; else _memDefaults.push(row);
    }
    return;
  }
  const supabase = await getSupabase();
  const { error } = await supabase.from('midao_availability_defaults')
    .upsert(rows, { onConflict: 'guide_id,weekday,period' });
  if (error) throw new Error(error.message);
}

/**
 * 單日覆寫 upsert。custom 給整組（先清後寫）。
 * @param {string} guideId @param {string} date
 * @param {{morning?:boolean, afternoon?:boolean, evening?:boolean, custom?:Array<{start:string,end:string,isOpen?:boolean}>}} patch
 */
export async function setDayOverrideDb(guideId, date, patch) {
  const upserts = [];
  for (const period of MIDAO_PERIODS) {
    if (typeof patch?.[period] === 'boolean') {
      upserts.push({ guide_id: guideId, date, period, is_open: patch[period], custom_start: null, custom_end: null });
    }
  }
  const customRows = Array.isArray(patch?.custom)
    ? patch.custom.filter((c) => c?.start && c?.end).map((c) => ({
        guide_id: guideId, date, period: 'custom',
        is_open: c.isOpen !== false, custom_start: c.start, custom_end: c.end,
      }))
    : null;
  if (!hasSupabaseEnv()) {
    for (const row of upserts) {
      const i = _memOverrides.findIndex((r) =>
        r.guide_id === guideId && r.date === date && r.period === row.period);
      if (i >= 0) _memOverrides[i] = row; else _memOverrides.push(row);
    }
    if (customRows) {
      for (let i = _memOverrides.length - 1; i >= 0; i--) {
        const r = _memOverrides[i];
        if (r.guide_id === guideId && r.date === date && r.period === 'custom') _memOverrides.splice(i, 1);
      }
      _memOverrides.push(...customRows);
    }
    return;
  }
  const supabase = await getSupabase();
  if (upserts.length) {
    const { error } = await supabase.from('midao_day_overrides')
      .upsert(upserts, { onConflict: 'guide_id,date,period' });
    if (error) throw new Error(error.message);
  }
  if (customRows) {
    await supabase.from('midao_day_overrides').delete()
      .eq('guide_id', guideId).eq('date', date).eq('period', 'custom');
    if (customRows.length) {
      const { error } = await supabase.from('midao_day_overrides').insert(customRows);
      if (error) throw new Error(error.message);
    }
  }
}

/** 該月每天的生效可用時段。 @param {string} guideId @param {string} month 'YYYY-MM' */
export async function getMonthEffectiveDb(guideId, month) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const defaults = await getWeeklyDefaultsDb(guideId);
  let overrides;
  if (!hasSupabaseEnv()) {
    overrides = _memOverrides.filter((r) => r.guide_id === guideId && String(r.date).startsWith(month));
  } else {
    const supabase = await getSupabase();
    const { data } = await supabase.from('midao_day_overrides')
      .select('date, period, is_open, custom_start, custom_end')
      .eq('guide_id', guideId)
      .gte('date', `${month}-01`).lte('date', `${month}-${String(daysInMonth).padStart(2, '0')}`);
    overrides = Array.isArray(data) ? data : [];
  }
  const out = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    // getUTCDay(): 0=Sun…6=Sat → 對映我們的 weekday 0=Mon…6=Sun（跟隨行事曆 UI 一→日排序）
    const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekday = (jsDay + 6) % 7;
    const dayOverrides = overrides.filter((o) => String(o.date) === date);
    out.push({ date, ...resolveEffectiveDay(defaults[weekday], dayOverrides) });
  }
  return out;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test apps/web/tests/unit/db-midao-availability.test.mjs`
Expected: PASS（3 tests）

- [ ] **Step 5: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/unit/db-midao-availability.test.mjs
git add apps/web/src/lib/db-midao-availability.mjs apps/web/tests/unit/db-midao-availability.test.mjs
```
```bash
git commit -m "feat(midao2): db-midao-availability 領域檔（週預設/單日覆寫/月生效展開）"
```

---

### Task 5: `db-midao-showcase.mjs` 領域檔（TDD）

**Files:**
- Create: `apps/web/src/lib/db-midao-showcase.mjs`
- Test: `apps/web/tests/unit/db-midao-showcase.test.mjs`

**Interfaces（Produces；Task 8/10 依賴）:**
- `MIDAO_DEAL_MODES = ['instant_booking','confirm_first','line_inquiry']`
- `isShowcaseVisible({midaoStatus, status}): boolean`（純函式；雙軌矩陣）
- `normalizeServiceInput(input, partial?): {ok:true,value}|{ok:false,code,message}`
- `listMidaoServicesDb(guideId): Promise<Array<{activityId,title,tagline,coverImageUrl,durationMinutes,minParticipants,maxParticipants,region,languages,priceTwd,dealMode,questions,showcasePublished,mainSiteStatus,midaoSortOrder}>>`
- `createMidaoServiceDb(guideId, value, {publish:boolean}): Promise<服務形>`（建 `activities` row：`status='draft'`、`midao_status='published'|'draft'`、slug 自動產生）
- `updateMidaoServiceDb(guideId, activityId, patch): Promise<服務形|null>`（ownership 內建；`midaoStatus` 可上/下架）
- `getPublicMidaoPageDb(slug): Promise<{guide:{displayName,headline,bio,languages,regions,experienceYears,photoUrl,heroUrl}, services:服務形[]}|null>`（approved＋≥1 可見服務，否則 null）
- 測試 seam：`__resetMemMidaoShowcase()`、`__seedMemMidaoGuide(profile)`、`__seedMemMidaoActivities(rows)`

- [ ] **Step 1: 寫失敗測試**

```js
// apps/web/tests/unit/db-midao-showcase.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIDAO_DEAL_MODES, isShowcaseVisible, normalizeServiceInput,
  listMidaoServicesDb, createMidaoServiceDb, updateMidaoServiceDb, getPublicMidaoPageDb,
  __resetMemMidaoShowcase, __seedMemMidaoGuide, __seedMemMidaoActivities,
} from '../../src/lib/db-midao-showcase.mjs';

const G = 'guide-1';
function guideProfile(over = {}) {
  return {
    id: G, slug: 'andy-lee', display_name: 'Andy Lee', headline: '高雄在地導覽',
    bio: '自然與文化探索', languages: ['中文', 'English'], regions: ['高雄', '台南'],
    experience_years: 5, profile_photo_url: 'p.jpg', hero_image_url: 'h.jpg',
    verification_status: 'approved', ...over,
  };
}
function serviceInput(over = {}) {
  return {
    title: '柴山私人秘境導覽', tagline: '半日祕境路線', durationMinutes: 300,
    minParticipants: 2, maxParticipants: 6, region: '高雄', languages: ['中文'],
    priceTwd: 4800, dealMode: 'confirm_first',
    questions: [{ id: 'q1', label: '是否需要接送', type: 'yes_no', options: [], required: true }],
    ...over,
  };
}

test.beforeEach(() => __resetMemMidaoShowcase());

test('isShowcaseVisible：雙軌矩陣全組合', () => {
  // midao_status 明確值優先
  assert.equal(isShowcaseVisible({ midaoStatus: 'published', status: 'draft' }), true);
  assert.equal(isShowcaseVisible({ midaoStatus: 'draft', status: 'published' }), false);
  // NULL＝跟隨主站
  assert.equal(isShowcaseVisible({ midaoStatus: null, status: 'published' }), true);
  assert.equal(isShowcaseVisible({ midaoStatus: null, status: 'draft' }), false);
  assert.equal(isShowcaseVisible({ midaoStatus: null, status: 'archived' }), false);
});

test('normalizeServiceInput：必填與範圍', () => {
  assert.equal(normalizeServiceInput(serviceInput()).ok, true);
  assert.equal(normalizeServiceInput(serviceInput({ title: '' })).code, 'INVALID_TITLE');
  assert.equal(normalizeServiceInput(serviceInput({ tagline: 'x'.repeat(61) })).code, 'TAGLINE_TOO_LONG');
  assert.equal(normalizeServiceInput(serviceInput({ dealMode: 'bogus' })).code, 'INVALID_DEAL_MODE');
  assert.equal(normalizeServiceInput(serviceInput({ priceTwd: -1 })).code, 'INVALID_PRICE');
  assert.equal(normalizeServiceInput(serviceInput({ minParticipants: 5, maxParticipants: 2 })).code, 'INVALID_PARTICIPANTS');
  // partial：只驗有給的欄
  assert.equal(normalizeServiceInput({ tagline: '新的一句話' }, true).ok, true);
});

test('精靈建立＋列表＋上下架', async () => {
  const norm = normalizeServiceInput(serviceInput());
  const created = await createMidaoServiceDb(G, norm.value, { publish: true });
  assert.equal(created.showcasePublished, true);
  assert.equal(created.mainSiteStatus, 'draft'); // 主站不受影響
  assert.match(created.activityId, /.+/);

  const items = await listMidaoServicesDb(G);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '柴山私人秘境導覽');

  // 下架接案頁
  const updated = await updateMidaoServiceDb(G, created.activityId, { midaoStatus: 'draft' });
  assert.equal(updated.showcasePublished, false);
  // 越權：其他 guide 更新不到
  const foreign = await updateMidaoServiceDb('guide-2', created.activityId, { midaoStatus: 'published' });
  assert.equal(foreign, null);
});

test('公開接案頁：approved＋≥1 可見服務才回資料', async () => {
  __seedMemMidaoGuide(guideProfile());
  // 尚無可見服務 → null
  assert.equal(await getPublicMidaoPageDb('andy-lee'), null);
  const norm = normalizeServiceInput(serviceInput());
  await createMidaoServiceDb(G, norm.value, { publish: true });
  const page = await getPublicMidaoPageDb('andy-lee');
  assert.equal(page.guide.displayName, 'Andy Lee');
  assert.equal(page.guide.experienceYears, 5);
  assert.equal(page.services.length, 1);
  assert.equal(page.services[0].dealMode, 'confirm_first');
  // 未 approved → null
  __resetMemMidaoShowcase();
  __seedMemMidaoGuide(guideProfile({ verification_status: 'pending' }));
  __seedMemMidaoActivities([{ id: 'a1', guide_id: G, title: 'x', slug: 'x', status: 'published',
    midao_status: null, midao_deal_mode: 'confirm_first', midao_questions: [], languages: [], price_twd: 100 }]);
  assert.equal(await getPublicMidaoPageDb('andy-lee'), null);
  // 不存在的 slug → null
  assert.equal(await getPublicMidaoPageDb('nope'), null);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test apps/web/tests/unit/db-midao-showcase.test.mjs`
Expected: FAIL（module not found）

- [ ] **Step 3: 實作**

```js
// apps/web/src/lib/db-midao-showcase.mjs
// @ts-check
/**
 * midao2 服務（＝既有 activities）雙軌可見度與精靈建立（spec §4.1）。
 * 接案頁可見 = midao_status='published' OR (midao_status IS NULL AND status='published')。
 * 主站可見度只看既有 status（審核流不動）。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';

export const MIDAO_DEAL_MODES = ['instant_booking', 'confirm_first', 'line_inquiry'];
const QUESTION_TYPES = ['text', 'single_choice', 'multi_choice', 'yes_no'];
const ACT_COLS = 'id, guide_id, title, slug, tagline, cover_image_url, duration_minutes, min_participants, max_participants, region, languages, price_twd, midao_status, midao_deal_mode, midao_questions, midao_sort_order, status, created_at';

const _memActivities = [];
const _memGuides = [];
let _memSeq = 0;
export function __resetMemMidaoShowcase() { _memActivities.length = 0; _memGuides.length = 0; _memSeq = 0; }
export function __seedMemMidaoGuide(profile) { _memGuides.push(profile); }
export function __seedMemMidaoActivities(rows) { _memActivities.push(...rows); }

/** 雙軌可見度矩陣（純函式）。 @param {{midaoStatus:string|null, status:string}} a */
export function isShowcaseVisible({ midaoStatus, status }) {
  if (midaoStatus === 'published') return true;
  if (midaoStatus === 'draft') return false;
  return status === 'published'; // NULL＝跟隨主站
}

/** @param {any} a */
function serviceShape(a) {
  return {
    activityId: a.id, title: a.title, tagline: a.tagline ?? null,
    coverImageUrl: a.cover_image_url ?? null, durationMinutes: a.duration_minutes ?? null,
    minParticipants: a.min_participants ?? 1, maxParticipants: a.max_participants ?? 10,
    region: a.region ?? null, languages: Array.isArray(a.languages) ? a.languages : [],
    priceTwd: a.price_twd ?? 0,
    dealMode: a.midao_deal_mode ?? 'confirm_first',
    questions: Array.isArray(a.midao_questions) ? a.midao_questions : [],
    showcasePublished: isShowcaseVisible({ midaoStatus: a.midao_status ?? null, status: a.status }),
    mainSiteStatus: a.status, midaoSortOrder: a.midao_sort_order ?? null,
  };
}

/**
 * 精靈/編輯輸入驗證。partial=true 只驗有給的欄（PATCH 用）。
 * @param {any} input @param {boolean} [partial]
 */
export function normalizeServiceInput(input, partial = false) {
  const out = /** @type {any} */ ({});
  const has = (/** @type {string} */ k) => input && Object.prototype.hasOwnProperty.call(input, k);
  if (!partial || has('title')) {
    const title = String(input?.title ?? '').trim();
    if (!title || title.length > 80) return { ok: false, code: 'INVALID_TITLE', message: '請填寫服務名稱（80 字內）' };
    out.title = title;
  }
  if (!partial || has('tagline')) {
    const tagline = String(input?.tagline ?? '').trim();
    if (tagline.length > 60) return { ok: false, code: 'TAGLINE_TOO_LONG', message: '一句話介紹最多 60 字' };
    out.tagline = tagline || null;
  }
  if (has('coverImageUrl')) out.cover_image_url = String(input.coverImageUrl ?? '').trim() || null;
  if (!partial || has('durationMinutes')) {
    const d = Math.trunc(Number(input?.durationMinutes));
    if (!Number.isFinite(d) || d < 30 || d > 1440) return { ok: false, code: 'INVALID_DURATION', message: '服務時間需為 30–1440 分鐘' };
    out.duration_minutes = d;
  }
  if (!partial || has('minParticipants') || has('maxParticipants')) {
    const min = Math.trunc(Number(input?.minParticipants ?? 1));
    const max = Math.trunc(Number(input?.maxParticipants ?? 10));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min || max > 99) {
      return { ok: false, code: 'INVALID_PARTICIPANTS', message: '適合人數範圍不正確' };
    }
    out.min_participants = min; out.max_participants = max;
  }
  if (!partial || has('region')) out.region = String(input?.region ?? '').trim().slice(0, 40) || null;
  if (!partial || has('languages')) {
    out.languages = Array.isArray(input?.languages)
      ? input.languages.map((l) => String(l).trim()).filter(Boolean).slice(0, 8) : [];
  }
  if (!partial || has('priceTwd')) {
    const price = Math.trunc(Number(input?.priceTwd));
    if (!Number.isFinite(price) || price < 0) return { ok: false, code: 'INVALID_PRICE', message: '參考價格需為 ≥0 整數' };
    out.price_twd = price;
  }
  if (!partial || has('dealMode')) {
    const mode = String(input?.dealMode ?? '').trim();
    if (!MIDAO_DEAL_MODES.includes(mode)) return { ok: false, code: 'INVALID_DEAL_MODE', message: '成交方式不正確' };
    out.midao_deal_mode = mode;
  }
  if (!partial || has('questions')) {
    const qs = Array.isArray(input?.questions) ? input.questions : [];
    if (qs.length > 10) return { ok: false, code: 'TOO_MANY_QUESTIONS', message: '需求問題最多 10 題' };
    out.midao_questions = qs.map((q, i) => ({
      id: String(q?.id ?? `q${i + 1}`), label: String(q?.label ?? '').trim().slice(0, 120),
      type: QUESTION_TYPES.includes(q?.type) ? q.type : 'text',
      options: Array.isArray(q?.options) ? q.options.map((o) => String(o).slice(0, 60)).slice(0, 10) : [],
      required: q?.required === true,
    })).filter((q) => q.label);
  }
  if (has('midaoSortOrder')) out.midao_sort_order = Math.trunc(Number(input.midaoSortOrder) || 0);
  if (has('midaoStatus')) {
    const s = input.midaoStatus;
    if (s !== 'draft' && s !== 'published' && s !== null) {
      return { ok: false, code: 'INVALID_MIDAO_STATUS', message: '上架狀態不正確' };
    }
    out.midao_status = s;
  }
  return { ok: true, value: out };
}

/** title → slug（中文安全：random 尾碼保 unique）。 @param {string} title */
function slugify(title) {
  const base = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'midao';
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @param {string} guideId */
export async function listMidaoServicesDb(guideId) {
  let rows;
  if (!hasSupabaseEnv()) {
    rows = _memActivities.filter((a) => a.guide_id === guideId && a.status !== 'archived');
  } else {
    const supabase = await getSupabase();
    const { data } = await supabase.from('activities').select(ACT_COLS)
      .eq('guide_id', guideId).neq('status', 'archived')
      .order('created_at', { ascending: false });
    rows = Array.isArray(data) ? data : [];
  }
  return rows.map(serviceShape);
}

/**
 * 精靈建立：真 activities row，主站恆為 draft。
 * @param {string} guideId @param {any} value @param {{publish?:boolean}} [opts]
 */
export async function createMidaoServiceDb(guideId, value, opts = {}) {
  const row = {
    guide_id: guideId, slug: slugify(value.title), status: 'draft',
    midao_status: opts.publish ? 'published' : 'draft',
    midao_questions: value.midao_questions ?? [], languages: value.languages ?? [],
    ...value,
  };
  if (!hasSupabaseEnv()) {
    const created = { id: `mact_${String(++_memSeq).padStart(6, '0')}`, created_at: new Date().toISOString(), ...row };
    _memActivities.push(created);
    return serviceShape(created);
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('activities').insert(row).select(ACT_COLS).single();
  if (error) throw new Error(error.message);
  return serviceShape(data);
}

/**
 * 編輯/上下架（ownership 內建：查無 = null）。patch 需先過 normalizeServiceInput(…, true)。
 * @param {string} guideId @param {string} activityId @param {any} patch
 */
export async function updateMidaoServiceDb(guideId, activityId, patch) {
  const norm = normalizeServiceInput(patch, true);
  if (!norm.ok) return norm; // route 端負責分辨 {ok:false} 與 null
  if (!hasSupabaseEnv()) {
    const row = _memActivities.find((a) => a.id === activityId && a.guide_id === guideId);
    if (!row) return null;
    Object.assign(row, norm.value);
    return serviceShape(row);
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('activities').update(norm.value)
    .eq('id', activityId).eq('guide_id', guideId).select(ACT_COLS).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? serviceShape(data) : null;
}

/**
 * 公開接案頁資料。條件：guide approved＋≥1 可見服務；否則 null（route 統一回 404）。
 * @param {string} slug
 */
export async function getPublicMidaoPageDb(slug) {
  let profile, activities;
  if (!hasSupabaseEnv()) {
    profile = _memGuides.find((g) => g.slug === slug) ?? null;
    activities = profile ? _memActivities.filter((a) => a.guide_id === profile.id) : [];
  } else {
    const supabase = await getSupabase();
    const { data: g } = await supabase.from('guide_profiles')
      .select('id, slug, display_name, headline, bio, languages, regions, region, experience_years, profile_photo_url, hero_image_url, verification_status')
      .eq('slug', slug).maybeSingle();
    profile = g ?? null;
    if (profile) {
      const { data: acts } = await supabase.from('activities').select(ACT_COLS)
        .eq('guide_id', profile.id).neq('status', 'archived');
      activities = Array.isArray(acts) ? acts : [];
    } else {
      activities = [];
    }
  }
  if (!profile || profile.verification_status !== 'approved') return null;
  const visible = activities
    .filter((a) => isShowcaseVisible({ midaoStatus: a.midao_status ?? null, status: a.status }))
    .sort((a, b) => (a.midao_sort_order ?? 999) - (b.midao_sort_order ?? 999));
  if (!visible.length) return null;
  return {
    guide: {
      displayName: profile.display_name, headline: profile.headline ?? null,
      bio: profile.bio ?? null,
      languages: Array.isArray(profile.languages) ? profile.languages : [],
      regions: Array.isArray(profile.regions) ? profile.regions : (profile.region ? [profile.region] : []),
      experienceYears: profile.experience_years ?? null,
      photoUrl: profile.profile_photo_url ?? null, heroUrl: profile.hero_image_url ?? null,
    },
    services: visible.map(serviceShape),
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test apps/web/tests/unit/db-midao-showcase.test.mjs`
Expected: PASS（4 tests）

- [ ] **Step 5: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/unit/db-midao-showcase.test.mjs
git add apps/web/src/lib/db-midao-showcase.mjs apps/web/tests/unit/db-midao-showcase.test.mjs
```
```bash
git commit -m "feat(midao2): db-midao-showcase 領域檔（雙軌可見度/精靈建立/公開接案頁查詢）"
```

---

### Task 6: `midao-request-notify.mjs` LINE 推播模組

**Files:**
- Create: `apps/web/src/lib/midao-request-notify.mjs`
- Test: `apps/web/tests/unit/midao-request-notify.test.mjs`

**Interfaces（Produces；Task 10 依賴）:**
- `notifyGuideNewMidaoRequest({guideId, requestNo, travelerName, activityTitle, preferredDate, participantsCount}): Promise<{status:'sent'|'skipped'|'failed', reason?:string}>`——永不 throw（fire-and-forget 友善）。
- `buildMidaoRequestPushText(input): string`（純函式，供測試斷言文案；**不含**旅客 lineId/email）。

- [ ] **Step 1: 寫失敗測試**

```js
// apps/web/tests/unit/midao-request-notify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMidaoRequestPushText, notifyGuideNewMidaoRequest } from '../../src/lib/midao-request-notify.mjs';

test('推播文案：含編號/稱呼/服務/日期/人數，不含聯絡資訊', () => {
  const text = buildMidaoRequestPushText({
    requestNo: 'R20260815001', travelerName: '王小姐',
    activityTitle: '柴山私人秘境導覽', preferredDate: '2026-08-15', participantsCount: 4,
  });
  assert.match(text, /R20260815001/);
  assert.match(text, /王小姐/);
  assert.match(text, /柴山私人秘境導覽/);
  assert.match(text, /2026-08-15/);
  assert.match(text, /4/);
});

test('notify：無綁定時回 skipped，永不 throw', async () => {
  const r = await notifyGuideNewMidaoRequest({
    guideId: 'guide-without-binding', requestNo: 'R20260815001',
    travelerName: '王小姐', activityTitle: '柴山', preferredDate: '2026-08-15', participantsCount: 4,
  });
  assert.equal(r.status, 'skipped');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test apps/web/tests/unit/midao-request-notify.test.mjs`
Expected: FAIL（module not found）

- [ ] **Step 3: 實作**

```js
// apps/web/src/lib/midao-request-notify.mjs
// @ts-check
/**
 * midao2 新需求 → 導遊 LINE 推播（spec §7）。
 * 沿用 guide-line-binding 解析 line_user_id；fire-and-forget：永不 throw、失敗只回狀態。
 * 文案不落旅客聯絡資訊（PII 原則，spec §6）。
 */
import { getLineUserIdForGuide } from './guide-line-binding.mjs';
import { pushMessage } from './line-messaging.ts';

/** @param {{requestNo:string, travelerName:string, activityTitle?:string|null, preferredDate:string, participantsCount:number}} i */
export function buildMidaoRequestPushText(i) {
  const service = i.activityTitle ? `・${i.activityTitle}` : '';
  return `🔔 新需求 #${i.requestNo}：${i.travelerName}${service}・${i.preferredDate}・${i.participantsCount} 位。請開啟 midao2 後台查看並回覆。`;
}

/**
 * @param {{guideId:string, requestNo:string, travelerName:string, activityTitle?:string|null, preferredDate:string, participantsCount:number}} input
 * @returns {Promise<{status:'sent'|'skipped'|'failed', reason?:string}>}
 */
export async function notifyGuideNewMidaoRequest(input) {
  try {
    const lineUserId = await getLineUserIdForGuide(input.guideId);
    if (!lineUserId) return { status: 'skipped', reason: 'no_guide_binding' };
    const result = await pushMessage(lineUserId, [{ type: 'text', text: buildMidaoRequestPushText(input) }]);
    return result?.status === 'sent' ? { status: 'sent' } : { status: result?.status ?? 'failed', reason: result?.reason };
  } catch {
    return { status: 'failed', reason: 'push_error' };
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test apps/web/tests/unit/midao-request-notify.test.mjs`
Expected: PASS（2 tests）

- [ ] **Step 5: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/unit/midao-request-notify.test.mjs
git add apps/web/src/lib/midao-request-notify.mjs apps/web/tests/unit/midao-request-notify.test.mjs
```
```bash
git commit -m "feat(midao2): 新需求 LINE 推播模組（fire-and-forget）"
```

---

### Task 7: 導遊端 API — summary＋requests（4 route 檔）

**Files:**
- Create: `apps/web/app/api/v2/guide/midao/summary/route.ts`
- Create: `apps/web/app/api/v2/guide/midao/requests/route.ts`
- Create: `apps/web/app/api/v2/guide/midao/requests/[requestId]/route.ts`
- Test: `apps/web/tests/api/v2-midao-guide-requests-contract.test.mjs`

**Interfaces:**
- Consumes: Task 3 全部函式。
- Produces: `GET /api/v2/guide/midao/summary`、`GET/POST …/requests`（POST＝手動建單 `source:'manual'`）、`GET/PATCH …/requests/[requestId]`。envelope `{success:true,data}`。

- [ ] **Step 1: 寫 route 檔**

`summary/route.ts`：
```ts
/**
 * GET /api/v2/guide/midao/summary — midao2 首頁摘要。
 * Auth: guide session（HMAC cookie）。
 */
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { getMidaoSummaryDb } from '../../../../../../src/lib/db-midao-requests.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  try {
    const summary = await getMidaoSummaryDb(session.guideId);
    return jsonOk({ guideName: session.guideName, ...summary });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/summary' });
  }
}
```

`requests/route.ts`：
```ts
/**
 * GET/POST /api/v2/guide/midao/requests — 需求列表／手動建單。
 * Auth: guide session；POST 需 CSRF。
 */
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import {
  listMidaoRequestsDb, createMidaoRequestDb, normalizeRequestInput,
} from '../../../../../../src/lib/db-midao-requests.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';

const STATUSES = ['all', 'new', 'pending_reply', 'replied', 'closed'];
const SORTS = ['unreplied_first', 'newest'];

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'all';
  const sort = url.searchParams.get('sort') ?? 'unreplied_first';
  if (!STATUSES.includes(status)) return jsonError('INVALID_STATUS', '狀態分頁不正確', 400);
  if (!SORTS.includes(sort)) return jsonError('INVALID_SORT', '排序方式不正確', 400);
  try {
    return jsonOk(await listMidaoRequestsDb(session.guideId, { status, sort }));
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/requests:list' });
  }
}

export async function POST(request: Request) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  let body: unknown = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  const norm = normalizeRequestInput(body);
  if (!norm.ok) return jsonError(norm.code, norm.message, 400);
  try {
    const b = body as { activityId?: string; activityTitle?: string };
    const created = await createMidaoRequestDb({
      guideId: session.guideId,
      activityId: b.activityId ?? null, activityTitle: b.activityTitle ?? null,
      value: norm.value, source: 'manual',
    });
    return jsonOk({ request: created });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/requests:create' });
  }
}
```

`requests/[requestId]/route.ts`：
```ts
/**
 * GET/PATCH /api/v2/guide/midao/requests/[requestId] — 需求詳情／狀態更新。
 * Auth: guide session（ownership 由領域檔以 guide_id 過濾內建）；PATCH 需 CSRF。
 */
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import {
  getMidaoRequestDb, updateMidaoRequestStatusDb, MIDAO_REQUEST_STATUSES,
} from '../../../../../../../src/lib/db-midao-requests.mjs';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';

export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const { requestId } = await params;
  try {
    const found = await getMidaoRequestDb(session.guideId, requestId);
    if (!found) return jsonError('NOT_FOUND', '需求單不存在', 404);
    return jsonOk({ request: found });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/requests:detail' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const { requestId } = await params;
  let body: { status?: string } = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  if (!body.status || !MIDAO_REQUEST_STATUSES.includes(body.status)) {
    return jsonError('INVALID_STATUS', '狀態不正確', 400);
  }
  try {
    const result = await updateMidaoRequestStatusDb(session.guideId, requestId, body.status);
    if (!result.ok) {
      return jsonError(result.code, result.message, result.code === 'NOT_FOUND' ? 404 : 409);
    }
    return jsonOk({ request: result.request });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/requests:patch' });
  }
}
```

- [ ] **Step 2: 寫 contract 測試（repo 慣用 source-smoke 風格）**

```js
// apps/web/tests/api/v2-midao-guide-requests-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao summary route：auth＋envelope', async () => {
  const src = await read('app/api/v2/guide/midao/summary/route.ts');
  assert.match(src, /verifyGuideSession\(request\)/);
  assert.match(src, /jsonError\('UNAUTHORIZED'/);
  assert.match(src, /getMidaoSummaryDb\(session\.guideId\)/);
  assert.match(src, /handleRouteError/);
});

test('midao requests collection route：list 驗證 query、create 走 CSRF＋manual source', async () => {
  const src = await read('app/api/v2/guide/midao/requests/route.ts');
  assert.match(src, /export\s+async\s+function\s+GET/);
  assert.match(src, /export\s+async\s+function\s+POST/);
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /jsonError\('INVALID_STATUS'/);
  assert.match(src, /listMidaoRequestsDb\(session\.guideId/);
  assert.match(src, /source: 'manual'/);
});

test('midao request item route：詳情 404＋狀態 PATCH 驗證轉換', async () => {
  const src = await read('app/api/v2/guide/midao/requests/[requestId]/route.ts');
  assert.match(src, /export\s+async\s+function\s+GET/);
  assert.match(src, /export\s+async\s+function\s+PATCH/);
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /MIDAO_REQUEST_STATUSES\.includes\(body\.status\)/);
  assert.match(src, /getMidaoRequestDb\(session\.guideId, requestId\)/);
  assert.match(src, /updateMidaoRequestStatusDb\(session\.guideId, requestId, body\.status\)/);
  assert.match(src, /'NOT_FOUND' \? 404 : 409/);
});
```

- [ ] **Step 3: 跑測試（先失敗後通過的節奏：先跑 → 建檔 → 再跑）**

Run: `node --test apps/web/tests/api/v2-midao-guide-requests-contract.test.mjs`
Expected: PASS（3 tests；若 FAIL 依訊息修 route 原始碼）

- [ ] **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/v2-midao-guide-requests-contract.test.mjs apps/web/tests/unit/db-midao-requests.test.mjs
git add apps/web/app/api/v2/guide/midao apps/web/tests/api/v2-midao-guide-requests-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 導遊端 API — summary/requests 列表/詳情/狀態更新"
```

---

### Task 8: 導遊端 API — services（2 route 檔）

**Files:**
- Create: `apps/web/app/api/v2/guide/midao/services/route.ts`
- Create: `apps/web/app/api/v2/guide/midao/services/[activityId]/route.ts`
- Test: `apps/web/tests/api/v2-midao-guide-services-contract.test.mjs`

**Interfaces:**
- Consumes: Task 5 的 `listMidaoServicesDb`/`createMidaoServiceDb`/`updateMidaoServiceDb`/`normalizeServiceInput`。
- Produces: `GET/POST …/services`、`PATCH …/services/[activityId]`。封面上傳與「發佈到祕島」不在此（直接用既有 `/api/guide/activities/[id]/upload-image` 與 `/api/guide/activities/[id]/submit`）。

- [ ] **Step 1: 寫 route 檔**

`services/route.ts`：
```ts
/**
 * GET/POST /api/v2/guide/midao/services — 服務列表／精靈建立（服務＝既有 activities）。
 * Auth: guide session；POST 需 CSRF。主站 status 恆為 draft（發佈到祕島走既有 submit API）。
 */
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import {
  listMidaoServicesDb, createMidaoServiceDb, normalizeServiceInput,
} from '../../../../../../src/lib/db-midao-showcase.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  try {
    return jsonOk({ items: await listMidaoServicesDb(session.guideId) });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/services:list' });
  }
}

export async function POST(request: Request) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  let body: { publish?: boolean } = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  const norm = normalizeServiceInput(body);
  if (!norm.ok) return jsonError(norm.code, norm.message, 400);
  try {
    const service = await createMidaoServiceDb(session.guideId, norm.value, { publish: body.publish === true });
    return jsonOk({ service });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/services:create' });
  }
}
```

`services/[activityId]/route.ts`：
```ts
/**
 * PATCH /api/v2/guide/midao/services/[activityId] — 編輯服務 midao 欄位／接案頁上下架。
 * Auth: guide session＋CSRF；ownership 由領域檔以 guide_id 過濾內建（查無回 404）。
 */
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import { updateMidaoServiceDb } from '../../../../../../../src/lib/db-midao-showcase.mjs';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';

export async function PATCH(request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const { activityId } = await params;
  let body: unknown = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  try {
    const result = await updateMidaoServiceDb(session.guideId, activityId, body);
    if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
      return jsonError(result.code, result.message, 400);
    }
    if (!result) return jsonError('NOT_FOUND', '服務不存在', 404);
    return jsonOk({ service: result });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/services:patch' });
  }
}
```

- [ ] **Step 2: 寫 contract 測試**

```js
// apps/web/tests/api/v2-midao-guide-services-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao services collection route：list auth＋create 驗證與 publish 旗標', async () => {
  const src = await read('app/api/v2/guide/midao/services/route.ts');
  assert.match(src, /verifyGuideSession\(request\)/);
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /listMidaoServicesDb\(session\.guideId\)/);
  assert.match(src, /createMidaoServiceDb\(session\.guideId, norm\.value, \{ publish: body\.publish === true \}\)/);
});

test('midao services item route：PATCH ownership＋404', async () => {
  const src = await read('app/api/v2/guide/midao/services/[activityId]/route.ts');
  assert.match(src, /export\s+async\s+function\s+PATCH/);
  assert.match(src, /updateMidaoServiceDb\(session\.guideId, activityId, body\)/);
  assert.match(src, /jsonError\('NOT_FOUND', '服務不存在', 404\)/);
});
```

- [ ] **Step 3: 跑測試**

Run: `node --test apps/web/tests/api/v2-midao-guide-services-contract.test.mjs`
Expected: PASS（2 tests）

- [ ] **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/v2-midao-guide-services-contract.test.mjs apps/web/tests/unit/db-midao-showcase.test.mjs
git add apps/web/app/api/v2/guide/midao/services apps/web/tests/api/v2-midao-guide-services-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 導遊端 API — 服務列表/精靈建立/編輯上下架"
```

---

### Task 9: 導遊端 API — calendar＋availability（3 route 檔）

**Files:**
- Create: `apps/web/app/api/v2/guide/midao/calendar/route.ts`
- Create: `apps/web/app/api/v2/guide/midao/availability/defaults/route.ts`
- Create: `apps/web/app/api/v2/guide/midao/availability/days/[date]/route.ts`
- Test: `apps/web/tests/api/v2-midao-guide-calendar-contract.test.mjs`

**Interfaces:**
- Consumes: Task 3 `listMidaoRequestsDb`、Task 4 全部函式。
- Produces: `GET …/calendar?month=`、`GET/PUT …/availability/defaults`、`PUT …/availability/days/[date]`。

- [ ] **Step 1: 寫 route 檔**

`calendar/route.ts`：
```ts
/**
 * GET /api/v2/guide/midao/calendar?month=YYYY-MM — 月曆聚合。
 * 可用時段（獨立輕量表）＋需求單點色＋既有 bookings 唯讀疊加（查詢失敗 degrade，不整頁 500）。
 * 點色：橘=未結案需求（new/pending_reply/replied）、綠=closed_won 或既有 confirmed 訂單。
 */
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { getMonthEffectiveDb } from '../../../../../../src/lib/db-midao-availability.mjs';
import { listMidaoRequestsDb } from '../../../../../../src/lib/db-midao-requests.mjs';
import { hasSupabaseEnv, getSupabase } from '../../../../../../src/lib/db.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';

const MONTH_RE = /^\d{4}-\d{2}$/;
const OPEN_REQ = ['new', 'pending_reply', 'replied'];

async function fetchBookingsOverlay(guideId: string, month: string) {
  // 既有站內訂單唯讀疊加；失敗回空（degrade，spec §8）
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.from('bookings')
      .select('id, start_at, end_at, participants, status, customer_note')
      .eq('guide_id', guideId)
      .in('status', ['pending_confirmation', 'confirmed'])
      .gte('start_at', `${month}-01T00:00:00Z`)
      .lt('start_at', nextMonthStart(month));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01T00:00:00Z`;
}

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? '';
  if (!MONTH_RE.test(month)) return jsonError('INVALID_MONTH', '月份格式需為 YYYY-MM', 400);
  try {
    const [availability, requests, bookings] = await Promise.all([
      getMonthEffectiveDb(session.guideId, month),
      listMidaoRequestsDb(session.guideId, { status: 'all', sort: 'newest' }),
      fetchBookingsOverlay(session.guideId, month),
    ]);
    const days = availability.map((day) => {
      const dayRequests = requests.items.filter((r) => r.preferredDate === day.date);
      const dayBookings = bookings.filter((b) => String(b.start_at).slice(0, 10) === day.date);
      return {
        date: day.date,
        availability: { morning: day.morning, afternoon: day.afternoon, evening: day.evening, custom: day.custom },
        hasPending: dayRequests.some((r) => OPEN_REQ.includes(r.status)),
        hasConfirmed: dayRequests.some((r) => r.status === 'closed_won') || dayBookings.length > 0,
        items: [
          ...dayRequests.map((r) => ({
            type: 'midao_request' as const, id: r.id, travelerName: r.travelerName,
            title: r.activityTitle, status: r.status,
            timeRange: r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : null,
            participantsCount: r.participantsCount,
          })),
          ...dayBookings.map((b) => ({
            type: 'booking' as const, id: b.id, travelerName: null,
            title: '站內訂單', status: b.status,
            timeRange: `${String(b.start_at).slice(11, 16)}–${String(b.end_at).slice(11, 16)}`,
            participantsCount: b.participants,
          })),
        ],
      };
    });
    return jsonOk({ month, days });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/calendar' });
  }
}
```

`availability/defaults/route.ts`：
```ts
/**
 * GET/PUT /api/v2/guide/midao/availability/defaults — 週可用時間預設。
 * Auth: guide session；PUT 需 CSRF。
 */
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import { getWeeklyDefaultsDb, setWeeklyDefaultsDb } from '../../../../../../../src/lib/db-midao-availability.mjs';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  try {
    return jsonOk({ weekdays: await getWeeklyDefaultsDb(session.guideId) });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/availability/defaults:get' });
  }
}

export async function PUT(request: Request) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  let body: { weekdays?: unknown } = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  if (!Array.isArray(body.weekdays)) return jsonError('INVALID_REQUEST', 'weekdays 需為陣列', 400);
  try {
    await setWeeklyDefaultsDb(session.guideId, body.weekdays);
    return jsonOk({ weekdays: await getWeeklyDefaultsDb(session.guideId) });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/availability/defaults:put' });
  }
}
```

`availability/days/[date]/route.ts`：
```ts
/**
 * PUT /api/v2/guide/midao/availability/days/[date] — 單日時段覆寫（三格開關＋自訂時段）。
 * Auth: guide session＋CSRF。
 */
import { validateCsrf } from '../../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../../src/lib/guide-auth';
import { setDayOverrideDb, getMonthEffectiveDb } from '../../../../../../../../src/lib/db-midao-availability.mjs';
import { jsonOk, jsonError } from '../../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../../src/lib/route-error';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PUT(request: Request, { params }: { params: Promise<{ date: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const { date } = await params;
  if (!DATE_RE.test(date)) return jsonError('INVALID_DATE', '日期格式需為 YYYY-MM-DD', 400);
  let body: unknown = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  try {
    await setDayOverrideDb(session.guideId, date, body as Record<string, unknown>);
    const month = date.slice(0, 7);
    const effective = (await getMonthEffectiveDb(session.guideId, month)).find((d) => d.date === date);
    return jsonOk({ date, effective });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/availability/day:put' });
  }
}
```

- [ ] **Step 2: 寫 contract 測試**

```js
// apps/web/tests/api/v2-midao-guide-calendar-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao calendar route：month 驗證＋三來源聚合＋bookings degrade', async () => {
  const src = await read('app/api/v2/guide/midao/calendar/route.ts');
  assert.match(src, /jsonError\('INVALID_MONTH'/);
  assert.match(src, /getMonthEffectiveDb\(session\.guideId, month\)/);
  assert.match(src, /listMidaoRequestsDb\(session\.guideId/);
  assert.match(src, /from\('bookings'\)/);
  assert.match(src, /catch \{\s*return \[\];/); // degrade 不整頁 500
  assert.match(src, /hasPending/);
  assert.match(src, /hasConfirmed/);
});

test('midao availability defaults route：GET/PUT＋CSRF', async () => {
  const src = await read('app/api/v2/guide/midao/availability/defaults/route.ts');
  assert.match(src, /export\s+async\s+function\s+GET/);
  assert.match(src, /export\s+async\s+function\s+PUT/);
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /setWeeklyDefaultsDb\(session\.guideId, body\.weekdays\)/);
});

test('midao availability day route：日期驗證＋回生效結果', async () => {
  const src = await read('app/api/v2/guide/midao/availability/days/[date]/route.ts');
  assert.match(src, /jsonError\('INVALID_DATE'/);
  assert.match(src, /setDayOverrideDb\(session\.guideId, date/);
  assert.match(src, /getMonthEffectiveDb\(session\.guideId, month\)/);
});
```

- [ ] **Step 3: 跑測試**

Run: `node --test apps/web/tests/api/v2-midao-guide-calendar-contract.test.mjs`
Expected: PASS（3 tests）

- [ ] **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/v2-midao-guide-calendar-contract.test.mjs apps/web/tests/unit/db-midao-availability.test.mjs
git add apps/web/app/api/v2/guide/midao/calendar apps/web/app/api/v2/guide/midao/availability apps/web/tests/api/v2-midao-guide-calendar-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 導遊端 API — 行事曆聚合/週預設/單日覆寫"
```

---

### Task 10: 公開端 API — 接案頁/可選日期/送單（3 route 檔）

**Files:**
- Create: `apps/web/app/api/v2/public/midao/guides/[slug]/route.ts`
- Create: `apps/web/app/api/v2/public/midao/guides/[slug]/availability/route.ts`
- Create: `apps/web/app/api/v2/public/midao/guides/[slug]/requests/route.ts`
- Test: `apps/web/tests/api/v2-midao-public-contract.test.mjs`

**Interfaces:**
- Consumes: Task 3 `createMidaoRequestDb`/`normalizeRequestInput`、Task 4 `getMonthEffectiveDb`、Task 5 `getPublicMidaoPageDb`、Task 6 `notifyGuideNewMidaoRequest`。
- Produces: 公開三支（無 auth）。送單 rate-limit（`RateLimiter(5, 60_000)`＋`resolveTrustedClientIp`）＋honeypot 欄位 `website`。

- [ ] **Step 1: 寫 route 檔**

`guides/[slug]/route.ts`：
```ts
/**
 * GET /api/v2/public/midao/guides/[slug] — 公開接案頁資料。
 * 無 auth。未達公開條件（不存在/未 approved/無可見服務）一律同一種 404，不洩漏導遊存在與否。
 * 不回傳導遊私人資料（email/LINE 綁定/銀行）。
 */
import { getPublicMidaoPageDb } from '../../../../../../../src/lib/db-midao-showcase.mjs';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const page = await getPublicMidaoPageDb(slug);
    if (!page) return jsonError('NOT_FOUND', '找不到此接案頁', 404);
    return jsonOk(page);
  } catch (err) {
    return handleRouteError(err, { route: 'v2/public/midao/guides:page' });
  }
}
```

`guides/[slug]/availability/route.ts`：
```ts
/**
 * GET /api/v2/public/midao/guides/[slug]/availability?month=YYYY-MM — 旅客端可選日期。
 * 無 auth；只回開放時段（openPeriods），不回需求單/訂單細節。
 */
import { getPublicMidaoPageDb } from '../../../../../../../../src/lib/db-midao-showcase.mjs';
import { getMonthEffectiveDb } from '../../../../../../../../src/lib/db-midao-availability.mjs';
import { hasSupabaseEnv, getSupabase } from '../../../../../../../../src/lib/db.mjs';
import { jsonOk, jsonError } from '../../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../../src/lib/route-error';

const MONTH_RE = /^\d{4}-\d{2}$/;

async function resolveGuideIdBySlug(slug: string): Promise<string | null> {
  if (!hasSupabaseEnv()) {
    // in-memory：透過公開頁查詢間接確認存在即可（測試 seam 由 showcase 領域檔提供）
    const page = await getPublicMidaoPageDb(slug);
    return page ? slug : null; // fallback 模式下以 slug 當 id（僅測試環境）
  }
  const supabase = await getSupabase();
  const { data } = await supabase.from('guide_profiles').select('id, verification_status')
    .eq('slug', slug).maybeSingle();
  return data && data.verification_status === 'approved' ? data.id : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? '';
  if (!MONTH_RE.test(month)) return jsonError('INVALID_MONTH', '月份格式需為 YYYY-MM', 400);
  try {
    const page = await getPublicMidaoPageDb(slug);
    if (!page) return jsonError('NOT_FOUND', '找不到此接案頁', 404);
    const guideId = await resolveGuideIdBySlug(slug);
    if (!guideId) return jsonError('NOT_FOUND', '找不到此接案頁', 404);
    const days = (await getMonthEffectiveDb(guideId, month)).map((d) => ({
      date: d.date,
      openPeriods: [
        ...(d.morning ? ['morning'] : []),
        ...(d.afternoon ? ['afternoon'] : []),
        ...(d.evening ? ['evening'] : []),
      ],
    }));
    return jsonOk({ month, days });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/public/midao/guides:availability' });
  }
}
```

**實作注意**：in-memory fallback 的 guideId 解析要與 `db-midao-showcase.mjs` 的 seam 一致——執行此任務時，把 `getPublicMidaoPageDb` 的回傳加一個內部欄位 `guideId`（`page.guideId`），公開 route 用它、但**組回應時剔除**（避免外洩 uuid 也無妨，但保持回應面最小）。對應調整 Task 5 的 `getPublicMidaoPageDb` 回傳：`{ guideId, guide, services }`，並同步其測試斷言。

`guides/[slug]/requests/route.ts`：
```ts
/**
 * POST /api/v2/public/midao/guides/[slug]/requests — 旅客送需求單。
 * 無 auth。防濫用：IP rate-limit（5 次/分）＋honeypot（website 欄位有值→靜默成功）＋
 * 欄位驗證（normalizeRequestInput）＋activity 歸屬與可見檢查。
 * 成功後 fire-and-forget LINE 推播導遊（失敗不影響送單）。
 */
import { RateLimiter } from '../../../../../../../../src/lib/rate-limit';
import { resolveTrustedClientIp } from '../../../../../../../../src/lib/trusted-ip.mjs';
import { getPublicMidaoPageDb } from '../../../../../../../../src/lib/db-midao-showcase.mjs';
import { createMidaoRequestDb, normalizeRequestInput } from '../../../../../../../../src/lib/db-midao-requests.mjs';
import { notifyGuideNewMidaoRequest } from '../../../../../../../../src/lib/midao-request-notify.mjs';
import { jsonOk, jsonError } from '../../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../../src/lib/route-error';

const submitLimiter = new RateLimiter(5, 60 * 1000);

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = resolveTrustedClientIp(request) ?? 'unknown';
  const limit = submitLimiter.check(`midao-submit:${ip}`);
  if (!limit.allowed) return jsonError('RATE_LIMITED', '送出太頻繁，請稍後再試', 429);
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  // honeypot：機器人填了隱藏欄位 → 回假成功、不落資料
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return jsonOk({ requestNo: 'R00000000000' });
  }
  try {
    const page = await getPublicMidaoPageDb(slug);
    if (!page) return jsonError('NOT_FOUND', '找不到此接案頁', 404);
    const activityId = String(body.activityId ?? '');
    const service = page.services.find((s) => s.activityId === activityId);
    if (!service) return jsonError('INVALID_ACTIVITY', '請選擇有效的服務', 400);
    const norm = normalizeRequestInput(body);
    if (!norm.ok) return jsonError(norm.code, norm.message, 400);
    const created = await createMidaoRequestDb({
      guideId: page.guideId, activityId, activityTitle: service.title,
      value: norm.value, source: 'public_page',
    });
    // fire-and-forget：不 await 失敗路徑影響回應
    notifyGuideNewMidaoRequest({
      guideId: page.guideId, requestNo: created.requestNo, travelerName: created.travelerName,
      activityTitle: service.title, preferredDate: created.preferredDate,
      participantsCount: created.participantsCount,
    }).catch(() => {});
    return jsonOk({ requestNo: created.requestNo });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/public/midao/guides:submit' });
  }
}
```

- [ ] **Step 2: 調整 Task 5 領域檔——`getPublicMidaoPageDb` 回傳加 `guideId`**

在 `db-midao-showcase.mjs` 的 `getPublicMidaoPageDb` 最後 return 改為：

```js
  return {
    guideId: profile.id,
    guide: { /* …原內容不變… */ },
    services: visible.map(serviceShape),
  };
```

並在 `db-midao-showcase.test.mjs` 的公開頁測試加一行：
```js
  assert.equal(page.guideId, G);
```

- [ ] **Step 3: 寫 contract 測試**

```js
// apps/web/tests/api/v2-midao-public-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('公開接案頁 route：統一 404、不 import 私人欄位', async () => {
  const src = await read('app/api/v2/public/midao/guides/[slug]/route.ts');
  assert.match(src, /jsonError\('NOT_FOUND', '找不到此接案頁', 404\)/);
  assert.match(src, /getPublicMidaoPageDb\(slug\)/);
  assert.doesNotMatch(src, /guide_email|bank|transfer|line_user_id/);
});

test('公開可選日期 route：month 驗證＋只回 openPeriods', async () => {
  const src = await read('app/api/v2/public/midao/guides/[slug]/availability/route.ts');
  assert.match(src, /jsonError\('INVALID_MONTH'/);
  assert.match(src, /openPeriods/);
  assert.match(src, /getMonthEffectiveDb\(/);
});

test('公開送單 route：rate-limit＋honeypot＋activity 歸屬＋LINE fire-and-forget', async () => {
  const src = await read('app/api/v2/public/midao/guides/[slug]/requests/route.ts');
  assert.match(src, /new RateLimiter\(5, 60 \* 1000\)/);
  assert.match(src, /jsonError\('RATE_LIMITED'/);
  assert.match(src, /body\.website/);                       // honeypot
  assert.match(src, /jsonError\('INVALID_ACTIVITY'/);       // 歸屬檢查
  assert.match(src, /normalizeRequestInput\(body\)/);
  assert.match(src, /source: 'public_page'/);
  assert.match(src, /notifyGuideNewMidaoRequest\(/);
  assert.match(src, /\.catch\(\(\) => \{\}\)/);             // fire-and-forget
});
```

- [ ] **Step 4: 跑本任務全部相關測試**

Run: `node --test apps/web/tests/api/v2-midao-public-contract.test.mjs apps/web/tests/unit/db-midao-showcase.test.mjs`
Expected: PASS（Task 5 測試含新增的 `page.guideId` 斷言）

- [ ] **Step 5: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/v2-midao-public-contract.test.mjs apps/web/tests/unit/db-midao-showcase.test.mjs apps/web/tests/unit/db-midao-requests.test.mjs apps/web/tests/unit/midao-request-notify.test.mjs
git add apps/web/app/api/v2/public/midao apps/web/src/lib/db-midao-showcase.mjs apps/web/tests/api/v2-midao-public-contract.test.mjs apps/web/tests/unit/db-midao-showcase.test.mjs
```
```bash
git commit -m "feat(midao2): 公開端 API — 接案頁/可選日期/送單（rate-limit+honeypot+LINE 推播）"
```

---

### Task 11: 全面驗證＋typecheck＋推送

**Files:**
- Modify: 無新檔（修 typecheck 紅字時可能微調前面任務的檔案）

- [ ] **Step 1: 跑全部 midao 測試＋typecheck**

```bash
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/unit/midao2-migration-contract.test.mjs \
  apps/web/tests/unit/db-midao-requests.test.mjs \
  apps/web/tests/unit/db-midao-availability.test.mjs \
  apps/web/tests/unit/db-midao-showcase.test.mjs \
  apps/web/tests/unit/midao-request-notify.test.mjs \
  apps/web/tests/api/v2-midao-guide-requests-contract.test.mjs \
  apps/web/tests/api/v2-midao-guide-services-contract.test.mjs \
  apps/web/tests/api/v2-midao-guide-calendar-contract.test.mjs \
  apps/web/tests/api/v2-midao-public-contract.test.mjs
```
Expected: 全綠。若 typecheck 紅字：逐一修正（route 檔 `.mjs` import 需符合專案 tsconfig `allowJs` 慣例——參考既有 v2 route 對 `db-addons.mjs` 的 import 寫法）。

- [ ] **Step 2: 確認既有測試未被弄壞（跑 db.mjs 行數 guard 與殘留守門）**

```bash
node --test apps/web/tests/unit/db-mjs-size-guard.test.mjs apps/web/tests/api/issue1407-legacy-retirement-residue-guard.test.mjs
```
Expected: PASS（本計畫完全沒碰 `db.mjs` 與 legacy 路徑，理應綠燈；紅燈＝有東西放錯位置，回頭修）。

- [ ] **Step 3: 檢查 yarn.lock 未混入後推送**

```bash
git status --short
```
若有 `yarn.lock` 改動：`git checkout -- yarn.lock`。然後：
```bash
git push -u origin claude/superpowers-midao-backend-x90czx
```

- [ ] **Step 4: 更新 worklog（鐵律 7）**

把本階段完成內容（任務清單、測試證據、commit SHA）寫入 `docs/operations/worklogs/` 對應檔案（若尚無 issue 編號，建 `issue-midao2.md`，之後開 issue 再改名），並在 GitHub issue 留言同步（若 issue 已建立）。

---

## 完成定義（Plan 1）

- [ ] 9 個測試檔全綠（`run-checks.sh --typecheck` 證據在 `.claude/state/last-checks.json`）
- [ ] `db.mjs` 零改動；凍結區零接觸；`yarn.lock` 未 commit
- [ ] migration 檔已入 repo（**尚未套用生產**——套用走 SQL-OVERRIDE＋ledger 流程另案）
- [ ] 分支已推送；worklog 已更新
- [ ] 之後：Plan 2（M4–M6 前端 UI＋E2E）另行撰寫
