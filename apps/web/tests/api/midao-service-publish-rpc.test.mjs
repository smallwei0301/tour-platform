import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lexPostgresSql } from '../helpers/sql-source-lexer.mjs';

// #1758 S6 · Task 27 — 靜態 SQL 契約測試（不跑 live DB）。
// 斷言 midao_publish_service_draft 這支「一鍵發布服務」的 atomic RPC：
//   - 單一 SECURITY DEFINER 函式 + 固定 search_path + 精確最小權限 ACL；
//   - 單一 transaction 內完成：鎖 activity → 鎖 active 草稿 → 擁有權/版本比對
//     （不符回結構化訊號、不 raise，讓呼叫端轉 403/409）→ upsert canonical
//     activities/activity_plans → 重建 activity_intake_questions → 插入下一版
//     immutable 快照 → 刪除草稿 → 寫入 notification outbox；
//   - idempotent no-op（草稿已被上一次成功發布刪除時）不重複寫入、不報錯；
//   - 函式體內不得有 EXCEPTION handler 或 COMMIT/ROLLBACK/SAVEPOINT（維持
//     呼叫端 statement transaction 的 all-or-nothing 語意）；
//   - rollback companion 為 operator-only，阻擋 auto-run。
// 比照 midao-backend-mode-switch-migration.test.mjs 的稽核 pattern。

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  '../../../../supabase/migrations/20260723022000_midao_atomic_service_publication.sql',
);
const rollbackPath = resolve(
  here,
  '../../../../supabase/migrations/20260723022000_midao_atomic_service_publication.rollback.sql',
);
const identity = 'public.midao_publish_service_draft(uuid, integer, uuid)';

function source() {
  assert.equal(existsSync(migrationPath), true, 'atomic service-publication migration must exist');
  return readFileSync(migrationPath, 'utf8');
}

function normalize(statement) {
  return statement.replace(/\s+/gu, ' ').trim().replace(/;$/u, '').toLowerCase();
}

function functionBody() {
  return lexPostgresSql(source()).statements[0].toLowerCase();
}

test('migration exposes one fixed security-definer function and exact execute ACL', () => {
  const statements = lexPostgresSql(source()).statements;
  assert.equal(statements.length, 3, 'only CREATE FUNCTION, exact REVOKE, exact GRANT are allowed');
  const [create, revoke, grant] = statements;
  assert.match(
    create,
    /create\s+or\s+replace\s+function\s+public\.midao_publish_service_draft\s*\(\s*p_activity_id\s+uuid\s*,\s*p_expected_revision\s+integer\s*,\s*p_guide_id\s+uuid\s*\)\s*returns\s+jsonb/iu,
  );
  assert.match(create, /security\s+definer/iu);
  assert.match(create, /set\s+search_path\s*=\s*pg_catalog/iu);
  assert.doesNotMatch(create, /\bexecute\b|\bcall\b|\bdo\s+\$/iu, 'dynamic SQL is forbidden');
  assert.equal(normalize(revoke), `revoke all on function ${identity} from public, anon, authenticated`);
  assert.equal(normalize(grant), `grant execute on function ${identity} to service_role`);
});

test('function validates arguments then locks activity before locking the active draft', () => {
  const body = functionBody();
  for (const fragment of [
    'p_activity_id is null',
    'p_guide_id is null',
    'p_expected_revision is null or p_expected_revision < 1',
  ]) assert.ok(body.includes(fragment), `missing argument validation fragment: ${fragment}`);

  const activityLock = body.indexOf('from public.activities');
  const draftLock = body.indexOf('from public.guide_service_drafts');
  assert.ok(activityLock >= 0 && draftLock > activityLock, 'activity FOR UPDATE must precede draft FOR UPDATE');
  assert.match(body.slice(activityLock, draftLock), /for\s+update/u);
  assert.match(body.slice(draftLock), /where\s+activity_id\s*=\s*p_activity_id\s+and\s+status\s*=\s*'active'\s+for\s+update/u);
  assert.doesNotMatch(body, /for\s+update\s+(?:nowait|skip\s+locked)/iu, 'concurrent publishes must serialize, not skip');
});

test('ownership and revision mismatches return structured signals without raising', () => {
  const body = functionBody();
  assert.match(body, /ownership_mismatch/u);
  assert.match(body, /revision_conflict/u);
  // conflict path returns the current revision so the caller can re-read (409).
  assert.match(body, /'currentrevision'\s*,\s*v_draft\.revision/u);
  // ownership/revision checks must be plain comparisons that RETURN, never RAISE.
  assert.match(body, /v_draft\.guide_id\s+is\s+distinct\s+from\s+p_guide_id/u);
  assert.match(body, /v_draft\.revision\s+is\s+distinct\s+from\s+p_expected_revision/u);
});

test('idempotent no-op path handles an already-published/already-deleted draft', () => {
  const body = functionBody();
  // when no active draft is found we must not error blindly; a prior successful
  // publish (draft already deleted) is an idempotent success, an activity that
  // never had a draft is a 404 DRAFT_NOT_FOUND.
  assert.match(body, /idempotent_no_op/u);
  assert.match(body, /draft_not_found/u);
  assert.match(body, /'idempotent'\s*,\s*true/u);
});

test('canonical writes, versioning, draft delete, and outbox happen in the right order', () => {
  const body = functionBody();
  const activityUpsert = body.indexOf('update public.activities');
  const plansWrite = body.indexOf('insert into public.activity_plans');
  const questionsRebuildDelete = body.indexOf('delete from public.activity_intake_questions');
  const questionsInsert = body.indexOf('insert into public.activity_intake_questions');
  const versionInsert = body.indexOf('insert into public.service_publication_versions');
  const draftDelete = body.indexOf('delete from public.guide_service_drafts');
  const outboxInsert = body.indexOf('insert into public.midao_notification_outbox');

  assert.ok(activityUpsert >= 0, 'must upsert canonical activities');
  assert.ok(plansWrite > activityUpsert, 'plans upsert after activity upsert');
  assert.ok(questionsRebuildDelete > plansWrite, 'questions rebuild deletes existing first');
  assert.ok(questionsInsert > questionsRebuildDelete, 'questions re-inserted after delete');
  assert.ok(versionInsert > questionsInsert, 'immutable version snapshot after canonical writes');
  assert.ok(draftDelete > versionInsert, 'active draft deleted only after version recorded');
  assert.ok(outboxInsert > draftDelete, 'outbox event enqueued after draft removed');

  // next version = previous max + 1.
  assert.match(body, /coalesce\(\s*max\(version\)\s*,\s*0\s*\)/u);
  assert.match(body, /v_next_version\s*:=\s*v_prev_version\s*\+\s*1/u);
  // plan rebuild is non-destructive: deactivate then upsert by (activity_id, slug),
  // never DELETE plans (which would break orders/bookings FK history).
  assert.doesNotMatch(body, /delete\s+from\s+public\.activity_plans/u);
  assert.match(body, /on\s+conflict\s*\(\s*activity_id\s*,\s*slug\s*\)\s*do\s+update/u);
});

test('database faults cannot be swallowed or split by transaction control inside the function', () => {
  const body = functionBody();
  assert.doesNotMatch(body, /\bexception\s+when\b/iu, 'fault handlers could preserve partial publishes');
  assert.doesNotMatch(body, /\b(?:commit|rollback|savepoint)\b/iu, 'function must stay in the caller statement transaction');
});

test('outbox/snapshot payloads are canonical and exclude credentials', () => {
  const body = functionBody();
  assert.match(body, /'service\.published'/u);
  assert.match(body, /insert into public\.service_publication_versions/u);
  assert.doesNotMatch(body, /admin_token|guide_token|cookie|password|service_role_key/iu);
});

test('rollback companion is operator-only and blocks auto-run', () => {
  assert.equal(existsSync(rollbackPath), true, 'rollback companion must exist');
  const raw = readFileSync(rollbackPath, 'utf8');
  assert.match(raw, /OPERATOR-ONLY ROLLBACK COMPANION/u);
  assert.match(raw, /NEVER auto-run/u);
  assert.match(raw, /RAISE EXCEPTION/u);
  // must require an explicit owner authorization before dropping the function.
  assert.match(raw, /midao\.rollback_owner_authorized/u);
  assert.match(raw, /DROP FUNCTION IF EXISTS public\.midao_publish_service_draft\(uuid,\s*integer,\s*uuid\)/u);
});
