/**
 * Issue #1377 — 移除 packages/ui 殭屍套件與 root legacy migration scratch scripts
 *
 * AC1: packages/ui 目錄不存在
 * AC2: root scratch scripts（apply_migrations.sh / execute-migrations.* /
 *      auto-migrate-012-013.js）已移除
 * AC3: CLAUDE.md 同步更新（不再描述「現存的」root scratch scripts；
 *      仍指向 canonical runbook — 與 issue1189 測試相容）
 * AC4: migration 命名規範（timestamp 制）已落文件
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');

test('AC1: packages/ui 殭屍套件已刪除', () => {
  assert.ok(!existsSync(join(REPO_ROOT, 'packages/ui')), 'packages/ui 應不存在');
  assert.ok(existsSync(join(REPO_ROOT, 'packages/config')), 'packages/config 應保留');
});

test('AC2: root legacy migration scratch scripts 已移除', () => {
  for (const f of [
    'apply_migrations.sh',
    'execute-migrations.js',
    'execute-migrations.sh',
    'execute-migrations-api.sh',
    'auto-migrate-012-013.js',
  ]) {
    assert.ok(!existsSync(join(REPO_ROOT, f)), `${f} 應已刪除`);
  }
});

test('AC3: CLAUDE.md 不再以現在式描述 root scratch scripts，仍指向 runbook', () => {
  const claudeMd = readFileSync(join(REPO_ROOT, 'CLAUDE.md'), 'utf8');
  assert.ok(
    !claudeMd.includes('should not be treated as the authoritative workflow'),
    'CLAUDE.md 應更新 scratch scripts 段落（已清除，不再是現存警告）'
  );
  assert.ok(
    claudeMd.includes('docs/operations/booking-v2-rollback-runbook.md'),
    'CLAUDE.md 應持續指向 canonical runbook（issue1189 契約）'
  );
});

test('AC4: supabase/migrations/README.md 載明新 migration 一律 timestamp 制', () => {
  const readmePath = join(REPO_ROOT, 'supabase/migrations/README.md');
  assert.ok(existsSync(readmePath), 'supabase/migrations/README.md 應存在');
  const readme = readFileSync(readmePath, 'utf8');
  assert.match(readme, /timestamp/i, '應說明 timestamp 命名制');
  assert.ok(
    readme.includes('booking-v2-rollback-runbook.md'),
    '應指向 canonical runbook'
  );
});

test('AC2: repo 內無 CI/設定殘留引用（package.json scripts 與 workflows）', () => {
  const rootPkg = readFileSync(join(REPO_ROOT, 'package.json'), 'utf8');
  assert.ok(!rootPkg.includes('@tour/ui'), 'root package.json 不應引用 @tour/ui');
  for (const needle of ['apply_migrations', 'execute-migrations', 'auto-migrate']) {
    assert.ok(!rootPkg.includes(needle), `root package.json 不應引用 ${needle}`);
  }
});
