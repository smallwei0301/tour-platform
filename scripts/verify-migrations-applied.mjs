#!/usr/bin/env node
/**
 * 通用「migration 是否已套用到正式 DB」檢查（#1493 follow-up）。
 *
 * 動機：原本的 migration-drift-detect 只比對一份「寫死的清單」，抓不到新 migration
 * 的欄位是否真的套到 prod（例如 payment_deadline_at／guide_approval_status 漏套都不報）。
 * 這支改成「掃所有 migration 檔的 CREATE TABLE / ADD COLUMN，逐一去正式 DB 探測」。
 *
 * 限制：service role 走 PostgREST，看不到 information_schema / pg_proc，因此只能可靠檢查
 *   **資料表與欄位**（最常見的 drift）；函式 / 索引不在此檢查範圍（會在報告註明）。
 * 探測法：對 `from(table).select(column)` 下 head 查詢——欄位不存在 → 42703；
 *   資料表不存在 → 42P01 / PGRST205。其餘錯誤一律視為 unknown（不誤報為缺漏）。
 *
 * env：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（缺則 soft-skip，exit 0）。
 * 退出碼：0 = 全部已套用或 soft-skip；1 = 偵測到缺漏。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../supabase/migrations');

/** 去掉 SQL 行註解，避免註解內文字被誤判。 */
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, ' ');
}

/**
 * 從 migration SQL 解析出要檢查的 tables 與 (table,column)。只看 public schema。
 * @param {string} sql
 * @returns {{ tables: Set<string>, columns: Array<{table:string,column:string}> }}
 */
export function parseMigrationObjects(sql) {
  const clean = stripComments(sql);
  const tables = new Set();
  const columns = [];

  // CREATE TABLE [IF NOT EXISTS] [public.]<tbl>
  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  let m;
  while ((m = createRe.exec(clean)) !== null) {
    const schema = m[1];
    if (schema && schema.toLowerCase() !== 'public') continue;
    tables.add(m[2]);
  }

  // ALTER TABLE [ONLY] [public.]<tbl> ... ADD COLUMN [IF NOT EXISTS] <col>（單句可多個）
  const stmts = clean.split(';');
  for (const stmt of stmts) {
    const at = stmt.match(/alter\s+table\s+(?:only\s+)?(?:(\w+)\.)?"?([a-z_][a-z0-9_]*)"?/i);
    if (!at) continue;
    const schema = at[1];
    if (schema && schema.toLowerCase() !== 'public') continue;
    const table = at[2];
    const addRe = /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
    let c;
    while ((c = addRe.exec(stmt)) !== null) {
      columns.push({ table, column: c[1] });
    }
  }

  return { tables, columns };
}

/** 收集所有 migration 檔（排除 rollback）解析出的物件。 */
export function collectExpectedObjects(dir = MIGRATIONS_DIR) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.rollback.sql'))
    .sort();
  const tables = new Set();
  const colKey = new Set();
  const columns = [];
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    const parsed = parseMigrationObjects(sql);
    parsed.tables.forEach((t) => tables.add(t));
    for (const c of parsed.columns) {
      const k = `${c.table}.${c.column}`;
      if (!colKey.has(k)) {
        colKey.add(k);
        columns.push(c);
      }
    }
  }
  return { tables: [...tables], columns };
}

function isMissingTableError(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || msg.includes('does not exist') || msg.includes('could not find the table');
}

function isMissingColumnError(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  return code === '42703' || code === 'PGRST204' || (msg.includes('column') && msg.includes('does not exist'));
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('HOLD: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定 — soft-skip。');
    process.exit(0);
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { tables, columns } = collectExpectedObjects();
  const missingTables = [];
  const missingColumns = [];
  const missingTableSet = new Set();

  for (const t of tables) {
    const { error } = await client.from(t).select('*', { head: true, count: 'exact' }).limit(1);
    if (isMissingTableError(error)) {
      missingTables.push(t);
      missingTableSet.add(t);
    }
  }

  for (const { table, column } of columns) {
    if (missingTableSet.has(table)) continue; // 表都沒有就不重複報欄位
    const { error } = await client.from(table).select(column, { head: true }).limit(1);
    if (isMissingColumnError(error)) {
      missingColumns.push(`${table}.${column}`);
    }
  }

  const report = {
    checked: { tables: tables.length, columns: columns.length },
    missing_tables: missingTables,
    missing_columns: missingColumns,
    note: 'columns/tables only — functions & indexes not covered (PostgREST cannot see pg_proc).',
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(report, null, 2));

  if (missingTables.length > 0 || missingColumns.length > 0) {
    console.error(
      `\nERROR: 偵測到 ${missingTables.length} 個資料表、${missingColumns.length} 個欄位尚未套用到正式 DB。` +
        `\n請依 docs/operations/booking-v2-rollback-runbook.md 套用對應 migration。`,
    );
    process.exit(1);
  }
  console.log('\n✅ 所有 migration 的資料表/欄位都已套用到正式 DB。');
  process.exit(0);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('[verify-migrations-applied] 非預期錯誤：', err?.message ?? err);
    process.exit(2);
  });
}
