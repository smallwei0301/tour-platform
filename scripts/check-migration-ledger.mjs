#!/usr/bin/env node
/**
 * Migration apply ledger release gate（#1293，owner 拍板選項 B）。
 *
 * Source of truth：`docs/operations/migration-ledger.json`（repo 內 artifact，更新走 PR）。
 * 本腳本做「純靜態比對」：`supabase/migrations/*.sql`（排除 `.rollback.sql`）逐檔對照
 * ledger record —— 每支 migration 必須有 `status: "verified"` 的 record，或被 baseline
 * record 涵蓋（baseline 涵蓋「檔名排序 <= baseline filename」的全部歷史檔案）。
 *
 * 失效方向 fail-safe：忘了補 ledger entry → 本 gate 直接亮 HOLD（exit 1），
 * 與 #1286 的 fail-silent drift 相反。既有 live 探測（verify-migrations-applied.mjs、
 * production-schema-drift-preflight.mjs）作為機器佐證交叉驗證：探測 PASS 但 ledger
 * 缺 verified record 時，本 gate 仍 fail。
 *
 * 不需 Supabase、不需任何 secrets、不對任何 DB 寫入。
 * 退出碼：0 = verified；1 = HOLD（有 missing/unverified 或 ledger 壞掉）。
 *
 * 用法：
 *   node scripts/check-migration-ledger.mjs [--json]
 *     [--migrations-dir <dir>] [--ledger <file>]
 *
 * SOP：docs/operations/migration-apply-ledger-sop.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const DEFAULT_MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');
export const DEFAULT_LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'operations', 'migration-ledger.json');

const VALID_STATUSES = new Set(['verified', 'pending', 'baseline']);

/** 列出需要 ledger 記錄的 migration 檔（排除 rollback 與非 .sql）。 */
export function listMigrationFiles(migrationsDir) {
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && !name.endsWith('.rollback.sql'))
    .sort();
}

/**
 * 核心檢查（純函式化，供測試直接匯入）。
 * @returns {{
 *   status: 'verified' | 'hold',
 *   missing: string[],        // 無任何 record 且未被 baseline 涵蓋
 *   unverified: string[],     // 有 record 但 status 不是 verified（例如 pending）
 *   coveredByBaseline: number,
 *   verifiedCount: number,
 *   total: number,
 *   warnings: string[],       // 例如 record 指向不存在的 migration 檔
 *   errors: string[],         // ledger 缺失/壞掉/schema 不合 → 一律 HOLD（fail-safe）
 * }}
 */
export function checkMigrationLedger({
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  ledgerPath = DEFAULT_LEDGER_PATH,
} = {}) {
  const result = {
    status: 'hold',
    missing: [],
    unverified: [],
    coveredByBaseline: 0,
    verifiedCount: 0,
    total: 0,
    warnings: [],
    errors: [],
  };

  let files;
  try {
    files = listMigrationFiles(migrationsDir);
  } catch (err) {
    result.errors.push(`無法讀取 migrations 目錄 ${migrationsDir}: ${err.message}`);
    return result;
  }
  result.total = files.length;

  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch (err) {
    result.errors.push(`無法讀取/解析 ledger ${ledgerPath}: ${err.message}`);
    return result;
  }
  if (!ledger || !Array.isArray(ledger.records)) {
    result.errors.push(`ledger 格式不合：records 必須是 array（${ledgerPath}）`);
    return result;
  }

  const fileSet = new Set(files);
  const recordByFile = new Map();
  let baselineBoundary = null; // 最大的 baseline filename

  for (const record of ledger.records) {
    if (!record || typeof record.filename !== 'string' || !VALID_STATUSES.has(record.status)) {
      result.errors.push(`ledger record 格式不合：${JSON.stringify(record)}`);
      continue;
    }
    if (record.status === 'baseline') {
      if (baselineBoundary === null || record.filename > baselineBoundary) {
        baselineBoundary = record.filename;
      }
    }
    if (!fileSet.has(record.filename)) {
      result.warnings.push(`ledger record 指向不存在的 migration 檔：${record.filename}`);
    }
    // 同檔多筆時取「最好」的狀態：verified > baseline > pending
    const prev = recordByFile.get(record.filename);
    const rank = { verified: 3, baseline: 2, pending: 1 };
    if (!prev || rank[record.status] > rank[prev.status]) {
      recordByFile.set(record.filename, record);
    }
  }

  // baseline 邊界為「檔名字串比較」，短數字前綴檔（如 021_）字串上 < 日期前綴 baseline，
  // 會被 baseline「意外涵蓋」而不要求 verified record（漏擋）。新檔一律用 8+ 位日期/時間戳
  // 前綴（見 supabase/migrations/README.md）；偵測到「非日期前綴且不在 grandfather 清單」
  // 的新檔即 warn（既有 001–022 legacy 已列入 ledger.grandfatheredLegacyFiles，不誤報）。
  const DATE_PREFIX = /^\d{8,}_/;
  const grandfathered = new Set(Array.isArray(ledger.grandfatheredLegacyFiles) ? ledger.grandfatheredLegacyFiles : []);
  for (const file of files) {
    const record = recordByFile.get(file);
    if (record && record.status === 'verified') {
      result.verifiedCount += 1;
      continue;
    }
    if (baselineBoundary !== null && file <= baselineBoundary) {
      result.coveredByBaseline += 1;
      // baseline 之後新增、卻用短數字前綴命名的檔，會被字串比較誤涵蓋 → 提醒改名
      if (!DATE_PREFIX.test(file) && !grandfathered.has(file)) {
        result.warnings.push(
          `migration 檔名非日期前綴且未列入 grandfather（${file}）— 字串比較可能被 baseline 誤涵蓋，請改用日期/時間戳前綴命名`,
        );
      }
      continue;
    }
    if (record) {
      result.unverified.push(file); // pending（或其他非 verified）
    } else {
      result.missing.push(file);
    }
  }

  if (result.errors.length === 0 && result.missing.length === 0 && result.unverified.length === 0) {
    result.status = 'verified';
  }
  return result;
}

function parseArgs(argv) {
  const opts = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--migrations-dir') opts.migrationsDir = argv[++i];
    else if (arg === '--ledger') opts.ledgerPath = argv[++i];
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = checkMigrationLedger(opts);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('== Migration apply ledger gate（#1293）==');
    console.log(
      `migration 檔共 ${result.total}：verified ${result.verifiedCount}、baseline 涵蓋 ${result.coveredByBaseline}、missing ${result.missing.length}、unverified ${result.unverified.length}`
    );
    for (const w of result.warnings) console.log(`[WARN] ${w}`);
    for (const e of result.errors) console.log(`[ERROR] ${e}`);
    for (const f of result.missing) console.log(`[MISSING] ${f} — ledger 無 record，請依 SOP 補 entry`);
    for (const f of result.unverified) console.log(`[UNVERIFIED] ${f} — record 存在但 status 非 verified`);
    if (result.status === 'verified') {
      console.log('✅ VERIFIED — 全部 migration 都有 verified ledger record（或被 baseline 涵蓋）');
    } else {
      console.log('❌ HOLD — 有 migration 缺 verified ledger record，release gate 擋下');
      console.log('   套用與補記程序見 docs/operations/migration-apply-ledger-sop.md');
    }
  }

  process.exit(result.status === 'verified' ? 0 : 1);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
