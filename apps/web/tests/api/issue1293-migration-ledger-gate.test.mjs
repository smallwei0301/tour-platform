/**
 * #1293 Migration apply ledger release gate（選項 B：repo 內 ledger 為 source of truth）
 *
 * 驗證 scripts/check-migration-ledger.mjs 的核心合約：
 *   1. 有 migration 檔、無 verified ledger record → 輸出含 missing 清單，回傳/退出碼表示 HOLD。
 *   2. 每支 migration 都有 verified record（或被 baseline 涵蓋）→ verified，exit 0。
 *   3. pending record 不算 verified → HOLD 並列入 unverified 清單。
 *   4. baseline record 涵蓋「檔名排序 <= baseline filename」的全部歷史檔案。
 *   5. 對 repo 現況（實際 supabase/migrations/ + docs/operations/migration-ledger.json）→ verified。
 *
 * 純靜態檢查（比對檔案 vs ledger JSON），不需 Supabase、不需任何 secrets。
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web/tests/api/ -> repo root 是 4 層上
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const CHECK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-migration-ledger.mjs');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'operations', 'migration-ledger.json');

/** 建立 temp fixture：migrations 目錄 + ledger 檔。 */
function makeFixture({ migrations, ledger }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue1293-ledger-'));
  const migrationsDir = path.join(dir, 'migrations');
  fs.mkdirSync(migrationsDir);
  for (const name of migrations) {
    fs.writeFileSync(path.join(migrationsDir, name), '-- fixture sql\nselect 1;\n');
  }
  const ledgerPath = path.join(dir, 'migration-ledger.json');
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  return { dir, migrationsDir, ledgerPath };
}

function runCli({ migrationsDir, ledgerPath }) {
  return spawnSync(
    process.execPath,
    [CHECK_SCRIPT, '--migrations-dir', migrationsDir, '--ledger', ledgerPath, '--json'],
    { encoding: 'utf8' }
  );
}

function record(filename, status, extra = {}) {
  return {
    filename,
    environment: 'production',
    operator: 'test-operator',
    applied_at: '2026-07-02T12:00:00+08:00',
    status,
    note: 'fixture',
    ...extra,
  };
}

const fixtures = [];
after(() => {
  for (const f of fixtures) {
    fs.rmSync(f.dir, { recursive: true, force: true });
  }
});

describe('issue #1293 — check-migration-ledger.mjs 存在且可匯入', () => {
  it('check script 檔案存在', () => {
    assert.ok(fs.existsSync(CHECK_SCRIPT), `缺少 ${CHECK_SCRIPT}`);
  });

  it('ledger 檔存在且為合法 JSON（含至少一筆 baseline record）', () => {
    assert.ok(fs.existsSync(LEDGER_PATH), `缺少 ${LEDGER_PATH}`);
    const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    assert.ok(Array.isArray(ledger.records), 'ledger.records 必須是 array');
    const baseline = ledger.records.filter((r) => r.status === 'baseline');
    assert.ok(baseline.length >= 1, '必須有至少一筆 baseline record');
    for (const r of ledger.records) {
      for (const key of ['filename', 'environment', 'operator', 'applied_at', 'status', 'note']) {
        assert.ok(r[key], `record 缺少欄位 ${key}: ${JSON.stringify(r)}`);
      }
      assert.ok(
        ['verified', 'pending', 'baseline'].includes(r.status),
        `record.status 必須是 verified/pending/baseline: ${r.status}`
      );
    }
  });
});

describe('issue #1293 — ledger gate 合約（temp fixture）', () => {
  it('RED 核心：有 migration 檔、無 verified record → HOLD + missing 清單', async () => {
    const fx = makeFixture({
      migrations: ['20260801000000_new_feature.sql'],
      ledger: { version: 1, records: [] },
    });
    fixtures.push(fx);

    const { checkMigrationLedger } = await import(CHECK_SCRIPT);
    const result = checkMigrationLedger({ migrationsDir: fx.migrationsDir, ledgerPath: fx.ledgerPath });
    assert.equal(result.status, 'hold');
    assert.deepEqual(result.missing, ['20260801000000_new_feature.sql']);

    const cli = runCli(fx);
    assert.equal(cli.status, 1, `CLI 應 exit 1（HOLD），got ${cli.status}\n${cli.stdout}\n${cli.stderr}`);
    assert.match(cli.stdout, /20260801000000_new_feature\.sql/);
    assert.match(cli.stdout, /hold/i);
  });

  it('全部 migration 都有 verified record → verified，exit 0', async () => {
    const fx = makeFixture({
      migrations: ['20260801000000_new_feature.sql', '20260802000000_more.sql'],
      ledger: {
        version: 1,
        records: [
          record('20260801000000_new_feature.sql', 'verified'),
          record('20260802000000_more.sql', 'verified'),
        ],
      },
    });
    fixtures.push(fx);

    const { checkMigrationLedger } = await import(CHECK_SCRIPT);
    const result = checkMigrationLedger({ migrationsDir: fx.migrationsDir, ledgerPath: fx.ledgerPath });
    assert.equal(result.status, 'verified');
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.unverified, []);

    const cli = runCli(fx);
    assert.equal(cli.status, 0, `CLI 應 exit 0，got ${cli.status}\n${cli.stdout}\n${cli.stderr}`);
  });

  it('pending record 不算 verified → HOLD + unverified 清單', async () => {
    const fx = makeFixture({
      migrations: ['20260801000000_new_feature.sql'],
      ledger: { version: 1, records: [record('20260801000000_new_feature.sql', 'pending')] },
    });
    fixtures.push(fx);

    const { checkMigrationLedger } = await import(CHECK_SCRIPT);
    const result = checkMigrationLedger({ migrationsDir: fx.migrationsDir, ledgerPath: fx.ledgerPath });
    assert.equal(result.status, 'hold');
    assert.deepEqual(result.unverified, ['20260801000000_new_feature.sql']);

    const cli = runCli(fx);
    assert.equal(cli.status, 1);
  });

  it('baseline record 涵蓋檔名排序 <= baseline 的全部檔案；之後的檔案仍需逐筆 record', async () => {
    const fx = makeFixture({
      migrations: [
        '001_mvp_core.sql',
        '20260702_cron_job_controls.sql',
        '20260801000000_after_baseline.sql',
      ],
      ledger: {
        version: 1,
        records: [record('20260702_cron_job_controls.sql', 'baseline')],
      },
    });
    fixtures.push(fx);

    const { checkMigrationLedger } = await import(CHECK_SCRIPT);
    const result = checkMigrationLedger({ migrationsDir: fx.migrationsDir, ledgerPath: fx.ledgerPath });
    assert.equal(result.status, 'hold');
    // baseline 涵蓋 001_ 與 20260702_，只有 baseline 之後的檔案 missing
    assert.deepEqual(result.missing, ['20260801000000_after_baseline.sql']);
    assert.equal(result.coveredByBaseline, 2);
  });

  it('.rollback.sql 檔案不列入檢查', async () => {
    const fx = makeFixture({
      migrations: ['20260801000000_new_feature.sql', '20260801000000_new_feature.rollback.sql'],
      ledger: { version: 1, records: [record('20260801000000_new_feature.sql', 'verified')] },
    });
    fixtures.push(fx);

    const { checkMigrationLedger } = await import(CHECK_SCRIPT);
    const result = checkMigrationLedger({ migrationsDir: fx.migrationsDir, ledgerPath: fx.ledgerPath });
    assert.equal(result.status, 'verified');
    assert.deepEqual(result.missing, []);
  });

  it('ledger 檔缺失或壞掉 → HOLD（fail-safe，不 fail-open）', async () => {
    const fx = makeFixture({
      migrations: ['20260801000000_new_feature.sql'],
      ledger: { version: 1, records: [] },
    });
    fixtures.push(fx);
    const missingLedger = path.join(fx.dir, 'nonexistent-ledger.json');

    const { checkMigrationLedger } = await import(CHECK_SCRIPT);
    const result = checkMigrationLedger({ migrationsDir: fx.migrationsDir, ledgerPath: missingLedger });
    assert.equal(result.status, 'hold');
    assert.ok(result.errors.length >= 1, '應回報 ledger 讀取錯誤');

    const cli = runCli({ migrationsDir: fx.migrationsDir, ledgerPath: missingLedger });
    assert.equal(cli.status, 1);
  });
});

describe('issue #1293 — repo 現況 gate 綠燈（baseline 涵蓋現有 migrations）', () => {
  it('對實際 supabase/migrations/ + docs/operations/migration-ledger.json → verified', () => {
    const cli = runCli({
      migrationsDir: path.join(REPO_ROOT, 'supabase', 'migrations'),
      ledgerPath: LEDGER_PATH,
    });
    assert.equal(
      cli.status,
      0,
      `repo 現況應 verified（baseline 需涵蓋現有全部 migration 檔）\n${cli.stdout}\n${cli.stderr}`
    );
  });
});

describe('issue #1293 — gate 接線 source-contract', () => {
  it('preflight-check.sh 有跑 check-migration-ledger.mjs', () => {
    const sh = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'preflight-check.sh'), 'utf8');
    assert.match(sh, /check-migration-ledger\.mjs/);
  });

  it('migration-drift-detect.yml 的 static job 有跑 check-migration-ledger.mjs', () => {
    const yml = fs.readFileSync(
      path.join(REPO_ROOT, '.github', 'workflows', 'migration-drift-detect.yml'),
      'utf8'
    );
    assert.match(yml, /check-migration-ledger\.mjs/);
  });

  it('SOP 文件存在且要求備份→套用→驗證→更新 ledger', () => {
    const sopPath = path.join(REPO_ROOT, 'docs', 'operations', 'migration-apply-ledger-sop.md');
    assert.ok(fs.existsSync(sopPath), `缺少 ${sopPath}`);
    const sop = fs.readFileSync(sopPath, 'utf8');
    assert.match(sop, /備份/);
    assert.match(sop, /驗證/);
    assert.match(sop, /migration-ledger\.json/);
  });
});
