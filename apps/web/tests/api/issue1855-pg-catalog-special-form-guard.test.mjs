/**
 * Issue #1855 — `pg_catalog.<語法特殊形式>` 防迴歸 gate（純原始碼靜態掃描）
 *
 * 根因：`NULLIF` 是 PostgreSQL 語法層級特殊形式，`pg_catalog` 內不存在同名函式。
 * 寫成 `pg_catalog.nullif(...)` 的函式一經呼叫必拋
 * `ERROR: function pg_catalog.nullif(text, unknown) does not exist`。
 *
 * 本測試不需要 DB、不需要 secrets，只掃 `supabase/migrations/**.sql` 原始碼：
 *   T1 除歷史豁免清單外，migrations 內不得出現 `pg_catalog.<黑名單字>(`
 *   T2 新 forward migration 對 F1/F2/F3 三個簽章各有一組 CREATE OR REPLACE FUNCTION
 *   T3 新 forward migration 內 `NULLIF(` >= 17 次、`pg_catalog.nullif` 0 次
 *   T4 新 forward migration 內不得出現 GRANT / REVOKE / DROP FUNCTION
 *   T5 #1825 rollback 檔頭含警語，並指名回滾後必須重跑的 #1855 forward migration
 *
 * 注意：`pg_catalog.btrim` / `pg_catalog.lower` 是真實函式，合法 schema-qualify，
 * 不在黑名單內、不得被本測試判為違規。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web/tests/api/ -> repo root 為上四層
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');

const FORWARD_MIGRATION = '20260819210000_issue1855_pg_catalog_nullif_repair.sql';
const NEW_ROLLBACK = '20260819210000_issue1855_pg_catalog_nullif_repair.rollback.sql';
const ISSUE1825_ROLLBACK =
  '20260813085910_issue1825_legacy_midao_draft_materialization.rollback.sql';

/**
 * PostgreSQL 語法層級特殊形式：這些名稱在 `pg_catalog` 內沒有同名函式，
 * 一旦被 schema-qualify 成 `pg_catalog.<name>(...)` 呼叫必然失敗。
 */
const SPECIAL_FORMS = Object.freeze([
  'nullif',
  'coalesce',
  'greatest',
  'least',
  'between',
  'exists',
  'cast',
  'overlay',
  'position',
  'substring',
  'trim',
  'extract',
  'xmlelement',
  'collation',
]);

/**
 * 歷史豁免清單：這四支既有 forward migration 已套用至 Production，
 * 依 #1855 規格 §2 一律不得回頭修改（修復以新的 CREATE OR REPLACE forward migration 完成）。
 * 清單長度以測試鎖死為 4，避免日後被無聲擴充。
 */
const HISTORICAL_EXEMPTIONS = Object.freeze([
  '20260723022000_midao_atomic_service_publication.sql',
  '20260723023000_midao_atomic_publication_restore.sql',
  '20260813085910_issue1825_legacy_midao_draft_materialization.sql',
  '20260814130100_issue1760_atomic_day_availability.sql',
]);

/**
 * 刻意豁免的 rollback 檔（依設計「必須」還原為修復前定義，即含 pg_catalog.nullif 的版本）：
 *   - #1855 新 rollback：緊急對照用途，不是可執行的常態路徑。
 *   - #1825 rollback：還原至 pre-#1825 狀態，該狀態本來就帶 pg_catalog.nullif；
 *     風險以檔頭警語（指名 #1855 forward migration 必須重跑）處理，而非改寫歷史還原點。
 * 清單長度以測試鎖死為 2，避免日後被無聲擴充。
 */
const INTENTIONAL_ROLLBACK_EXEMPTIONS = Object.freeze([NEW_ROLLBACK, ISSUE1825_ROLLBACK]);

const SPECIAL_FORM_PATTERN = new RegExp(
  `pg_catalog\\.(?:${SPECIAL_FORMS.join('|')})\\s*\\(`,
  'iu',
);

function readMigration(filename) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
}

function countMatches(text, pattern) {
  return (text.match(pattern) ?? []).length;
}

function scanSpecialFormViolations() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const violations = [];
  for (const name of files) {
    if (HISTORICAL_EXEMPTIONS.includes(name)) continue;
    if (INTENTIONAL_ROLLBACK_EXEMPTIONS.includes(name)) continue;
    const lines = readMigration(name).split('\n');
    lines.forEach((line, index) => {
      if (SPECIAL_FORM_PATTERN.test(line)) {
        violations.push(`${name}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  return violations;
}

describe('issue #1855 — pg_catalog 語法特殊形式防迴歸 gate', () => {
  it('T1 migrations 內不得出現 pg_catalog.<語法特殊形式>(（歷史豁免除外）', () => {
    const violations = scanSpecialFormViolations();
    assert.deepEqual(
      violations,
      [],
      `發現被誤 schema-qualify 的語法特殊形式（呼叫必拋 does not exist）：\n${violations.join('\n')}`,
    );
  });

  it('T1b 歷史豁免清單長度恰為 4（不得無聲擴充）', () => {
    assert.equal(HISTORICAL_EXEMPTIONS.length, 4);
    for (const name of HISTORICAL_EXEMPTIONS) {
      assert.ok(
        fs.existsSync(path.join(MIGRATIONS_DIR, name)),
        `豁免清單引用了不存在的檔案：${name}`,
      );
    }
  });

  it('T1c pg_catalog.btrim / pg_catalog.lower 為真實函式，不在黑名單內', () => {
    assert.ok(!SPECIAL_FORMS.includes('btrim'));
    assert.ok(!SPECIAL_FORMS.includes('lower'));
    assert.ok(!SPECIAL_FORM_PATTERN.test('pg_catalog.btrim(x)'));
    assert.ok(!SPECIAL_FORM_PATTERN.test('pg_catalog.lower(x)'));
    assert.ok(SPECIAL_FORM_PATTERN.test('pg_catalog.nullif(x, \'\')'));
  });

  it('T2 新 forward migration 對 F1/F2/F3 三簽章各有一組 CREATE OR REPLACE FUNCTION', () => {
    const forwardPath = path.join(MIGRATIONS_DIR, FORWARD_MIGRATION);
    assert.ok(fs.existsSync(forwardPath), `缺少 forward migration：${FORWARD_MIGRATION}`);
    const sql = readMigration(FORWARD_MIGRATION);

    const signatures = [
      'public.midao_publish_service_draft',
      'public.midao_restore_service_publication',
      'public.midao_replace_global_day_availability',
    ];
    for (const signature of signatures) {
      const pattern = new RegExp(
        `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${signature.replace('.', '\\.')}\\s*\\(`,
        'giu',
      );
      assert.equal(
        countMatches(sql, pattern),
        1,
        `${signature} 必須恰有一組 CREATE OR REPLACE FUNCTION`,
      );
    }
  });

  it('T3 新 forward migration NULLIF( >= 17 次、pg_catalog.nullif 0 次', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    assert.equal(
      countMatches(sql, /pg_catalog\.nullif\s*\(/giu),
      0,
      'forward migration 不得殘留 pg_catalog.nullif(',
    );
    const nullifCount = countMatches(sql, /(?<![\w.])NULLIF\s*\(/gu);
    assert.ok(
      nullifCount >= 17,
      `forward migration 內 NULLIF( 應 >= 17 次（7+7+3），實得 ${nullifCount}`,
    );
  });

  it('T4 新 forward migration 不得含 GRANT / REVOKE / DROP FUNCTION', () => {
    const sql = readMigration(FORWARD_MIGRATION);
    assert.equal(countMatches(sql, /^\s*GRANT\s/gimu), 0, '不得下 GRANT');
    assert.equal(countMatches(sql, /^\s*REVOKE\s/gimu), 0, '不得下 REVOKE');
    assert.equal(countMatches(sql, /DROP\s+FUNCTION/giu), 0, '不得 DROP FUNCTION');
  });

  it('T5 #1825 rollback 檔頭含警語並指名 #1855 forward migration', () => {
    const sql = readMigration(ISSUE1825_ROLLBACK);
    const header = sql.split('\n').slice(0, 12).join('\n');
    assert.ok(
      /警語|WARNING|警告/u.test(header),
      `${ISSUE1825_ROLLBACK} 檔頭需含警語（本檔還原至 pre-#1825 狀態，含已修復的 pg_catalog.nullif 缺陷）`,
    );
    assert.ok(
      header.includes(FORWARD_MIGRATION),
      `${ISSUE1825_ROLLBACK} 檔頭警語需明確指名執行回滾後必須重跑的 forward migration：${FORWARD_MIGRATION}`,
    );
  });

  it('T5c 刻意豁免的 rollback 清單長度恰為 2（不得無聲擴充）', () => {
    assert.equal(INTENTIONAL_ROLLBACK_EXEMPTIONS.length, 2);
    for (const name of INTENTIONAL_ROLLBACK_EXEMPTIONS) {
      assert.ok(
        fs.existsSync(path.join(MIGRATIONS_DIR, name)),
        `豁免清單引用了不存在的檔案：${name}`,
      );
    }
  });

  it('T5b #1855 新 rollback 存在且含警語', () => {
    const rollbackPath = path.join(MIGRATIONS_DIR, NEW_ROLLBACK);
    assert.ok(fs.existsSync(rollbackPath), `缺少 rollback：${NEW_ROLLBACK}`);
    const sql = readMigration(NEW_ROLLBACK);
    assert.ok(/警語|WARNING|警告/u.test(sql), 'rollback 檔頭需含警語');
    assert.ok(
      countMatches(sql, /pg_catalog\.nullif\s*\(/giu) >= 17,
      'rollback 必須還原為修復前定義（含 pg_catalog.nullif）',
    );
  });
});
