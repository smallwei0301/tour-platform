/**
 * Issue #1760 Stage 2 — 平行可用性引擎退役守門測試。
 *
 * 舊模組 `apps/web/src/lib/midao/db-midao-availability.mjs`（週預設＋單日覆寫的第二套真相）
 * 在所有 consumer 收斂到 canonical 之後已刪除。本檔取代其原本的單元測試，
 * 確保不會有人把它加回來或留下 fallback／雙寫。
 *
 * Owner APPROVE_A 修正後的守門邊界：
 * - application_table_reference_guard：apps/web/app|src 內 midao_availability_defaults /
 *   midao_day_overrides 必須為 0；只排除歷史 SQL（supabase/migrations/**）。
 * - legacy_module_import_guard：apps/web 的 app/src/tests/e2e 內對舊模組的 import/參照必須為 0，
 *   不得以 migration 例外來掩蓋模組 import。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../../');
const legacyModule = path.join(webRoot, 'src/lib/midao/db-midao-availability.mjs');

const SCAN_DIRS = ['app', 'src', 'tests', 'e2e'];
const SCAN_EXT = new Set(['.ts', '.tsx', '.mjs', '.js', '.jsx']);
const SELF = path.resolve(here, 'issue1760-stage2-parallel-engine-retirement-guard.test.mjs');

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...walk(full));
    } else if (SCAN_EXT.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function scanFiles() {
  return SCAN_DIRS.flatMap((dir) => walk(path.join(webRoot, dir))).filter((file) => file !== SELF);
}

test('舊平行引擎模組已刪除，未留下 fallback 檔案', () => {
  assert.equal(fs.existsSync(legacyModule), false, 'db-midao-availability.mjs 必須已退役');
});

test('legacy_module_import_guard：app/src/tests/e2e 內對舊模組的 import/require 為 0', () => {
  // 只匹配真正的模組解析（import/require/dynamic import 的路徑字串），
  // 不把「斷言舊模組不存在」的測試字面量誤判為 consumer。
  const IMPORT_RE = /(?:from|import|require)\s*\(?\s*['"][^'"]*db-midao-availability(?:\.mjs)?['"]/u;
  const offenders = scanFiles().filter((file) => IMPORT_RE.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((f) => path.relative(webRoot, f)), []);
});

test('application_table_reference_guard：app/src 內 midao_* 舊表參照為 0', () => {
  const appAndSrc = ['app', 'src'].flatMap((dir) => walk(path.join(webRoot, dir)));
  const offenders = appAndSrc.filter((file) =>
    /midao_availability_defaults|midao_day_overrides/u.test(fs.readFileSync(file, 'utf8')),
  );
  assert.deepEqual(offenders.map((f) => path.relative(webRoot, f)), []);
});

test('歷史 migration SQL 的舊表建置語句只被排除於表名掃描，不影響模組 import 守門', () => {
  const migrationsDir = path.resolve(webRoot, '../../supabase/migrations');
  assert.equal(fs.existsSync(migrationsDir), true);
  const sqlFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  const stillHasHistoricalTable = sqlFiles.some((f) =>
    /midao_availability_defaults|midao_day_overrides/u.test(
      fs.readFileSync(path.join(migrationsDir, f), 'utf8'),
    ),
  );
  // migration 只增不改：歷史建表語句仍在，這是預期的，且不得被當成 application 參照。
  assert.equal(stillHasHistoricalTable, true);
  const migrationImportsLegacyModule = sqlFiles.some((f) =>
    /db-midao-availability/u.test(fs.readFileSync(path.join(migrationsDir, f), 'utf8')),
  );
  assert.equal(migrationImportsLegacyModule, false);
});

test('canonical gateway 未在退役後偷偷回退到舊表或雙寫', () => {
  const gateway = fs.readFileSync(
    path.join(webRoot, 'src/lib/midao/db-midao-canonical-availability.mjs'),
    'utf8',
  );
  assert.doesNotMatch(gateway, /midao_availability_defaults|midao_day_overrides/u);
  assert.doesNotMatch(gateway, /db-midao-availability/u);
});
