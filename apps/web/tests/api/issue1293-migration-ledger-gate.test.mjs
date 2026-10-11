/**
 * #1293 Migration apply ledger release gate（選項 B：repo 內 ledger 為 source of truth）
 *
 * 驗證 scripts/check-migration-ledger.mjs 的核心合約：
 *   1. 有 migration 檔、無 verified ledger record → 輸出含 missing 清單，回傳/退出碼表示 HOLD。
 *   2. 每支 migration 都有 verified record（或被 baseline 涵蓋）→ verified，exit 0。
 *   3. pending record 不算 verified → HOLD 並列入 unverified 清單。
 *   4. baseline record 涵蓋「檔名排序 <= baseline filename」的全部歷史檔案。
 *   5. 對 repo 現況 → 精確列出缺少紀錄的九支 migration，release 仍 HOLD。
 *   6. #1861 僅依 Owner 單筆歷史缺證例外回填，不冒稱備份／復原／runtime 全驗收。
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
import { createHash } from 'node:crypto';

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
  fs.writeFileSync(ledgerPath, JSON.stringify({ kind: 'production-migration-apply-ledger', version: 1, ...ledger }, null, 2));
  return { dir, migrationsDir, ledgerPath };
}

function runCli({ migrationsDir, ledgerPath }) {
  return spawnSync(
    process.execPath,
    [CHECK_SCRIPT, '--mode', 'verified', '--migrations-dir', migrationsDir, '--ledger', ledgerPath, '--json'],
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

  it('baseline 後新增的短數字前綴檔 → warn（字串比較誤涵蓋提醒）', async () => {
    const fx = makeFixture({
      migrations: ['021_legacy_grandfathered.sql', '099_new_numbered_after_baseline.sql', '20260702_cron_job_controls.sql'],
      ledger: {
        version: 1,
        grandfatheredLegacyFiles: ['021_legacy_grandfathered.sql'],
        records: [record('20260702_cron_job_controls.sql', 'baseline')],
      },
    });
    fixtures.push(fx);

    const { checkMigrationLedger } = await import(CHECK_SCRIPT);
    const result = checkMigrationLedger({ migrationsDir: fx.migrationsDir, ledgerPath: fx.ledgerPath });
    // 三檔皆被 baseline 字串涵蓋 → gate 仍 verified（warn 不擋）
    assert.equal(result.status, 'verified');
    // grandfather 的 021_ 不告警；未列入的 099_ 告警
    const warnText = result.warnings.join('\n');
    assert.match(warnText, /099_new_numbered_after_baseline\.sql/);
    assert.doesNotMatch(warnText, /021_legacy_grandfathered\.sql/);
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

it('verified gate rejects fake ledger identity and fabricated verified or baseline records', async () => {
  const { checkMigrationLedger } = await import(CHECK_SCRIPT);
  const valid = record('20260801000000_new_feature.sql', 'verified');
  const hostileLedgers = [
    { kind: 'fake-ledger', version: 1, records: [valid] },
    { kind: 'production-migration-apply-ledger', version: 2, records: [valid] },
    { kind: 'production-migration-apply-ledger', version: 1, records: [{ filename: valid.filename, status: 'verified' }] },
    { kind: 'production-migration-apply-ledger', version: 1, records: [{ ...valid, environment: 'staging' }] },
    { kind: 'production-migration-apply-ledger', version: 1, records: [{ ...valid, operator: '' }] },
    { kind: 'production-migration-apply-ledger', version: 1, records: [{ ...valid, applied_at: 'not-a-date' }] },
    { kind: 'production-migration-apply-ledger', version: 1, records: [{ ...valid, note: '' }] },
    { kind: 'production-migration-apply-ledger', version: 1, records: [record('20991231000000_nonexistent.sql', 'baseline')] },
  ];
  for (const ledger of hostileLedgers) {
    const fx = makeFixture({ migrations: [valid.filename], ledger }); fixtures.push(fx);
    const result = checkMigrationLedger({ migrationsDir: fx.migrationsDir, ledgerPath: fx.ledgerPath });
    assert.equal(result.status, 'hold', JSON.stringify(ledger));
    assert.equal(result.errors.length > 0, true, JSON.stringify(ledger));
  }
});

describe('issue #1758 — repo現況verified release gate維持fail-closed', () => {
  it('四支Midao migration 與 #1861 歷史回填維持verified，原九支加新付款migration缺少verified紀錄使gate精確HOLD', () => {
    const cli = runCli({ migrationsDir: path.join(REPO_ROOT, 'supabase', 'migrations'), ledgerPath: LEDGER_PATH });
    assert.equal(cli.status, 1, `repo verified gate應對缺少verified紀錄 fail closed\n${cli.stdout}\n${cli.stderr}`);
    const result = JSON.parse(cli.stdout);
    assert.equal(result.status, 'hold');
    assert.deepEqual(result.missing, [
      '20260810033421_issue1811_atomic_booking_order_materialization.sql',
      '20260812150000_issue1812_addon_atomic_materialization.sql',
      '20260812160000_issue1813_points_atomic_materialization.sql',
      '20260812213000_issue1814_checkout_idempotency_atomic.sql',
      '20260814130000_issue1760_availability_scope_contract.sql',
      '20260814130100_issue1760_atomic_day_availability.sql',
      '20260914052608_issue1796_expire_unpaid_order_ambiguous_column_fix.sql',
      '20260914073000_issue1796_expire_unpaid_order_variable_conflict_fix.sql',
      '20260914073100_issue1796_expire_unpaid_order_restore_search_path.sql',
      '20261006121148_initial_payment_admission.sql',
    ]);
    assert.deepEqual(result.unverified, []);

    const expectedFilenames = [
      '20260723020000_midao_service_drafts_and_questions.sql',
      '20260723021000_midao_service_publication_versions.sql',
      '20260723022000_midao_atomic_service_publication.sql',
      '20260723023000_midao_atomic_publication_restore.sql',
    ];
    const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    const issue1758Records = ledger.records.filter((record) => expectedFilenames.includes(record.filename));
    assert.deepEqual(
      issue1758Records.map(({ filename, environment, status }) => ({ filename, environment, status })),
      expectedFilenames.map((filename) => ({ filename, environment: 'production', status: 'verified' }))
    );
  });
});

describe('issue #1861 — 僅一筆 Owner 核可的歷史缺證例外', () => {
  const filename = '20260824135300_issue1861_midao_request_claims_bridge.sql';

  it('精確綁定 source、歷史確認與現時catalog證據，保留缺口且不倒填operator', () => {
    const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    const records = ledger.records.filter((entry) => entry.filename === filename);
    assert.equal(records.length, 1, '#1861 只能新增一筆，不能擴大 baseline');
    const entry = records[0];
    assert.deepEqual(Object.keys(entry).sort(), ['applied_at', 'environment', 'filename', 'note', 'operator', 'status']);
    assert.equal(entry.environment, 'production');
    assert.equal(entry.status, 'verified');
    assert.equal(entry.applied_at, '2026-08-25T00:11:45Z');
    assert.match(entry.operator, /歷史操作者 unknown/u);
    assert.match(entry.operator, /僅核可 2026-10-06 回填例外/u);
    assert.match(entry.note, /first durable confirmation timestamp/u);
    assert.match(entry.note, /actual exact historical apply time is unavailable/u);
    assert.match(entry.note, /https:\/\/github\.com\/smallwei0301\/tour-platform\/issues\/1861#issuecomment-5403187032/u);
    const sourceHash = createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, 'supabase', 'migrations', filename))).digest('hex');
    assert.equal(sourceHash, 'dc7d8b4c55dbd944864b7067ba4b2ec2902c381be4c77674cfac9579268d63e1');
    assert.ok(entry.note.includes(`source SHA-256=${sourceHash}`));
    assert.match(entry.note, /catalog SHA-256=41046574c88768728b0a13e2701cf0607302b52113e544bb928e2ca18557f003/u);
    assert.match(entry.note, /2026-10-06T05:06:23Z.*「接受」/u);
    assert.match(entry.note, /歷史 pre-apply backup、完整 schema\/data recovery 與當時結構性 DDL 風險核可仍 NOT_VERIFIED/u);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, 'supabase', 'migrations', filename.replace(/\.sql$/u, '.rollback.sql'))), false);
    assert.match(entry.note, /無同名 rollback companion/u);
    assert.match(entry.note, /runtime\/真雙 backend 競態、definer owner bypass 與完整依賴 ACL 未驗/u);
    assert.match(entry.note, /service_role 額外 TRUNCATE\/REFERENCES\/TRIGGER\/MAINTAIN 來源 unknown/u);
    assert.match(entry.note, /其餘九支與整體 release 仍 HOLD/u);
    const sop = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'operations', 'migration-apply-ledger-sop.md'), 'utf8');
    assert.match(sop, /#1861 單筆歷史缺證例外/u);
    assert.ok(sop.includes(filename));
    assert.match(sop, /不得援引為其他 migration 或任何新 migration 的豁免/u);
  });

  it('移除這一筆只恢復 #1861 的missing，九支既有缺口與新付款migration仍HOLD', async () => {
    const { checkMigrationLedger } = await import(CHECK_SCRIPT);
    const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations');
    const current = checkMigrationLedger({ migrationsDir, ledgerPath: LEDGER_PATH });
    const fx = makeFixture({ migrations: [], ledger: { ...ledger, records: ledger.records.filter((entry) => entry.filename !== filename) } });
    fixtures.push(fx);
    const withoutException = checkMigrationLedger({ migrationsDir, ledgerPath: fx.ledgerPath });
    assert.equal(current.status, 'hold');
    assert.equal(withoutException.status, 'hold');
    assert.deepEqual(withoutException.missing, [...current.missing, filename].sort());
    assert.equal(current.missing.length, 10);
    assert.equal(withoutException.missing.length, 11);
    assert.ok(current.missing.includes('20261006121148_initial_payment_admission.sql'));
    assert.equal(withoutException.coveredByBaseline, current.coveredByBaseline);
    assert.equal(current.verifiedCount, withoutException.verifiedCount + 1);
    assert.deepEqual(withoutException.errors, []);
  });
});

describe('issue #1293 — gate 接線 source-contract', () => {
  it('preflight-check.sh明示source mode', () => {
    const sh = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'preflight-check.sh'), 'utf8');
    assert.match(sh, /check-migration-source-gate\.mjs --mode source/u);
  });

  it('migration-drift-detect.yml分開source與verified modes', () => {
    const yml = fs.readFileSync(
      path.join(REPO_ROOT, '.github', 'workflows', 'migration-drift-detect.yml'),
      'utf8'
    );
    assert.match(yml, /check-migration-source-gate\.mjs --mode source/u);
    assert.match(yml, /check-migration-ledger\.mjs --mode verified/u);
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
