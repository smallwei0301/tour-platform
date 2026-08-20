/**
 * Issue #1859 Task A — ensure RPC 預填既有 activity_plans / activity_intake_questions
 *
 * 純原始碼靜態掃描（不需要 DB、不需要 secrets）：
 *   - 新 forward migration 依 D4 取數（只取 status='active' 方案、依 created_at 排序）
 *   - 草稿 payload 的 plan 物件含 D2 全部 8 個鍵，slug 原樣帶回（S6 的身分鍵）
 *   - questions 依 sort_order 帶回，含 D3 全部 6 個鍵
 *   - D5 修復分支四條件齊備、回傳 REUSED_REPAIRED、且不遞增 revision
 *   - 唯一允許的寫入目標是 public.guide_service_drafts（禁寫清單逐項驗）
 *   - rollback 檔把函式還原成 20260819002727 版定義
 *   - db-native-service-draft-ensure.mjs 接受 REUSED_REPAIRED，其餘未知碼仍 throw
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web/tests/api/ -> repo root 為上四層
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

const FORWARD_MIGRATION = '20260820120000_issue1859_native_draft_prefill.sql';
const ROLLBACK_MIGRATION = '20260820120000_issue1859_native_draft_prefill.rollback.sql';
const BASELINE_MIGRATION = '20260819002727_issue1825_native_service_draft_ensure.sql';
const ENSURE_GATEWAY = path.join(
  REPO_ROOT,
  'apps',
  'web',
  'src',
  'lib',
  'midao',
  'db-native-service-draft-ensure.mjs',
);

const ACTIVITY_WHITELIST = Object.freeze([
  'c0000003-0000-0000-0000-000000000001',
  'c0000003-0000-0000-0000-000000000002',
  'c0000003-0000-0000-0000-000000000003',
]);

// D2 — plan 形狀（欄位名完全對齊 public.activity_plans）
const PLAN_KEYS = Object.freeze([
  'slug',
  'name',
  'booking_type',
  'duration_minutes',
  'price_type',
  'base_price',
  'min_participants',
  'max_participants',
]);

// D3 — question 形狀（沿用現行）
const QUESTION_KEYS = Object.freeze([
  'question_key',
  'label',
  'type',
  'options',
  'required',
  'sort_order',
]);

// 函式唯一允許的寫入目標是 public.guide_service_drafts
const FORBIDDEN_WRITE_TARGETS = Object.freeze([
  'UPDATE public.activities',
  'INSERT INTO public.activity_plans',
  'UPDATE public.activity_plans',
  'DELETE FROM public.activity_intake_questions',
  'INSERT INTO public.activity_intake_questions',
  'service_publication_versions',
  'midao_notification_outbox',
]);

function readMigration(filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  assert.ok(fs.existsSync(filePath), `缺少 migration：${filename}`);
  return fs.readFileSync(filePath, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

describe('issue #1859 — ensure RPC 預填既有方案與問卷', () => {
  it('T1 新 forward migration 沿用現行簽章、SECURITY DEFINER 與 search_path', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    assert.match(
      sql,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.midao_ensure_native_service_draft\s*\(\s*p_activity_id\s+uuid\s*,\s*p_guide_id\s+uuid\s*\)/u,
    );
    assert.match(sql, /RETURNS\s+jsonb/u);
    assert.match(sql, /SECURITY\s+DEFINER/u);
    assert.match(sql, /SET\s+search_path\s*=\s*pg_catalog/u);
  });

  it('T2 檔尾重述 REVOKE / GRANT（不得放寬）', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.midao_ensure_native_service_draft\(uuid, uuid\)\s+FROM PUBLIC, anon, authenticated;/u,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.midao_ensure_native_service_draft\(uuid, uuid\)\s+TO service_role;/u,
    );
    assert.doesNotMatch(sql, /GRANT\s+EXECUTE[^;]*TO\s+(?:PUBLIC|anon|authenticated)/iu);
  });

  it('T3 D4 取數規則：plans 只取 active 且依 created_at, id 排序', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    assert.match(sql, /FROM\s+public\.activity_plans/u);
    assert.match(sql, /status\s*=\s*'active'/u);
    assert.match(sql, /ORDER\s+BY[^;]*created_at\s+ASC[^;]*id\s+ASC/u);
  });

  it('T4 D2 plan 物件含全部 8 個鍵且 slug 取自來源列', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    for (const key of PLAN_KEYS) {
      assert.match(
        sql,
        new RegExp(`'${escapeRegExp(key)}'\\s*,`, 'u'),
        `plan payload 缺少 D2 欄位：${key}`,
      );
    }
    // slug 必須原樣取自 activity_plans（S6 upsert 的 ON CONFLICT (activity_id, slug) 身分鍵）
    assert.match(sql, /'slug'\s*,\s*[a-z_]+\.slug/u);
  });

  it('T5 D3 questions 取自 activity_intake_questions 且依 sort_order 排序', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    assert.match(sql, /FROM\s+public\.activity_intake_questions/u);
    assert.match(sql, /ORDER\s+BY[^;]*sort_order\s+ASC[^;]*id\s+ASC/u);
    for (const key of QUESTION_KEYS) {
      assert.match(
        sql,
        new RegExp(`'${escapeRegExp(key)}'\\s*,`, 'u'),
        `question payload 缺少 D3 欄位：${key}`,
      );
    }
  });

  it('T6 空集合時沿用現行單一空白佔位方案、questions 為空陣列', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    assert.match(
      sql,
      /pg_catalog\.jsonb_build_object\(\s*'name'\s*,\s*''\s*,\s*'booking_type'\s*,\s*'scheduled'\s*\)/u,
    );
    assert.match(sql, /'\[\]'::jsonb/u);
  });

  it('T7 D5 修復分支四條件齊備且回傳 REUSED_REPAIRED', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    assert.match(sql, /materialization_origin\s*=\s*'native'/u);
    assert.match(sql, /revision\s*=\s*1/u);
    assert.match(sql, /jsonb_array_length/u);
    assert.match(sql, /'REUSED_REPAIRED'/u);
    // 修復分支必須是「全部條件成立」的 AND 串接，不得用 OR 放寬
    const repairCondition = sql.match(/v_should_repair\s*:=[\s\S]*?;/u);
    assert.ok(repairCondition, '找不到 D5 修復條件（v_should_repair）');
    assert.doesNotMatch(repairCondition[0], /\bOR\b/iu);
  });

  it('T8 修復分支不遞增 revision，且只寫 guide_service_drafts', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    assert.doesNotMatch(sql, /revision\s*=\s*[^,;\n]*revision\s*\+\s*1/u);
    assert.doesNotMatch(sql, /revision\s*\+\s*1/u);
    assert.match(sql, /UPDATE\s+public\.guide_service_drafts/u);
  });

  it('T9 禁寫清單逐項不得出現', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    for (const forbidden of FORBIDDEN_WRITE_TARGETS) {
      assert.doesNotMatch(
        sql,
        new RegExp(escapeRegExp(forbidden), 'iu'),
        `函式不得寫入：${forbidden}`,
      );
    }
  });

  it('T10 既有回傳碼語意不變、白名單原樣保留、僅新增 REUSED_REPAIRED', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    for (const code of [
      'ACTIVITY_NOT_FOUND_OR_OWNERSHIP_MISMATCH',
      'NATIVE_DRAFT_SOURCE_INVALID',
      'CREATED',
      'REUSED',
    ]) {
      assert.match(sql, new RegExp(`'${code}'`, 'u'), `缺少既有回傳碼：${code}`);
    }
    for (const activityId of ACTIVITY_WHITELIST) {
      assert.match(sql, new RegExp(escapeRegExp(activityId), 'u'), `白名單缺少：${activityId}`);
    }
    const codeLiterals = new Set(
      (sql.match(/'code'\s*,\s*'([A-Z_]+)'/gu) ?? []).map((m) => m.replace(/^.*'([A-Z_]+)'$/u, '$1')),
    );
    for (const code of codeLiterals) {
      assert.ok(
        [
          'ACTIVITY_NOT_FOUND_OR_OWNERSHIP_MISMATCH',
          'NATIVE_DRAFT_SOURCE_INVALID',
          'CREATED',
          'REUSED',
          'REUSED_REPAIRED',
        ].includes(code),
        `出現未經授權的新回傳碼：${code}`,
      );
    }
  });

  it('T11 不得 schema-qualify SQL 語法特殊形式（#1855 事故）', () => {
    for (const name of [FORWARD_MIGRATION, ROLLBACK_MIGRATION]) {
      const sql = readMigration(name);
      assert.doesNotMatch(
        sql,
        /pg_catalog\.(?:nullif|coalesce|greatest|least|cast|extract|substring|trim|position|overlay)\s*\(/iu,
        `${name} 不得對語法特殊形式加 pg_catalog. 前綴`,
      );
    }
  });

  it('T12 rollback 把函式還原成 20260819002727 版定義（含權限語句）', () => {
    const rollback = readMigration(ROLLBACK_MIGRATION);
    const baseline = readMigration(BASELINE_MIGRATION);
    assert.match(
      rollback,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.midao_ensure_native_service_draft\s*\(/u,
    );
    assert.doesNotMatch(rollback, /REUSED_REPAIRED/u);
    assert.doesNotMatch(rollback, /activity_intake_questions/u);
    assert.match(
      rollback,
      /REVOKE ALL ON FUNCTION public\.midao_ensure_native_service_draft\(uuid, uuid\)\s+FROM PUBLIC, anon, authenticated;/u,
    );
    assert.match(
      rollback,
      /GRANT EXECUTE ON FUNCTION public\.midao_ensure_native_service_draft\(uuid, uuid\)\s+TO service_role;/u,
    );
    // 還原點必須帶回 baseline 的硬寫佔位 payload
    assert.ok(
      baseline.includes("'plans', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('name', '', 'booking_type', 'scheduled'))"),
      'baseline migration 內容已變動，rollback 對照失效',
    );
    assert.ok(
      rollback.includes("'plans', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('name', '', 'booking_type', 'scheduled'))"),
      'rollback 必須還原 baseline 的佔位 payload',
    );
  });

  it('T13 既有 migration 未被修改（鐵律 4：只增不改）', () => {
    const baseline = readMigration(BASELINE_MIGRATION);
    assert.doesNotMatch(baseline, /REUSED_REPAIRED/u);
    assert.doesNotMatch(baseline, /activity_intake_questions/u);
  });

  it('T14 gateway 接受 REUSED_REPAIRED，其餘未知碼仍 throw', async () => {
    const source = fs.readFileSync(ENSURE_GATEWAY, 'utf8');
    assert.match(source, /REUSED_REPAIRED/u);
    const guard = source.match(/if\s*\((code[^)]*)\)\s*throw unexpected\('Midao native service draft ensure RPC returned an unrecognized code'\)/u);
    assert.ok(guard, '未知碼守門判斷不得被移除');
    const allowed = new Set((guard[1].match(/'([A-Z_]+)'/gu) ?? []).map((m) => m.slice(1, -1)));
    assert.deepEqual(
      [...allowed].sort(),
      ['CREATED', 'REUSED', 'REUSED_REPAIRED'],
      'gateway 白名單必須恰為三個已知碼（不得寬鬆放行）',
    );

    const { __internal } = await import('../../src/lib/midao/db-native-service-draft-ensure.mjs');
    assert.equal(typeof __internal.normalizeStructuralUuid, 'function');
  });

  it('T15 新 migration 已登記到 #1293 ledger gate 的 missing 固定清單末端', () => {
    const gateTest = fs.readFileSync(
      path.join(REPO_ROOT, 'apps', 'web', 'tests', 'api', 'issue1293-migration-ledger-gate.test.mjs'),
      'utf8',
    );
    assert.ok(
      gateTest.includes(`'${FORWARD_MIGRATION}',`),
      'ledger gate 的 missing 固定清單需加入新 migration 檔名',
    );
  });
});
