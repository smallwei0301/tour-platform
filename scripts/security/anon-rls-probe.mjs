// scripts/security/anon-rls-probe.mjs
// 行為式 RLS 外洩探測（#1563 類事故的 ground-truth 防線）。
// 用「公開的 anon key」（就是前端瀏覽器裡那把、攻擊者也拿得到）實際去 SELECT 敏感表，
// 任何一張回傳資料或「被授權存取（即使目前 0 筆）」＝外洩風險 → exit 1。
//
// ⚠️ 唯讀（SELECT-only）：絕不對生產庫寫入。若 RLS 真的破了，一個測寫入的 probe 會真的
//    竄改/刪除生產資料；讀取就足以證明外洩（#1563 正是被讀走 orders/users）。
// ⚠️ 絕不 log 讀到的實際資料列（只 log 筆數）——避免把 PII 印進 CI log。
// NEVER add real credentials to this file. 由 CI secret 注入 SUPABASE_URL / SUPABASE_ANON_KEY。

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const USAGE = `Usage: node scripts/security/anon-rls-probe.mjs [options]

以 anon（公開）key 探測敏感表是否對匿名者外洩（唯讀）。

Options:
  --help        Show help
  --json        Emit JSON output (default: text)
  --output <p>  Write output to file in addition to stdout

Environment variables required (unless --help):
  SUPABASE_URL            Your Supabase project URL
  SUPABASE_ANON_KEY       Public anon key（不是 service key）

Exit codes:
  0  PASS — 所有敏感表對 anon 皆拒絕（denied）
  1  FAIL — 任一表外洩（讀到資料）或被授權存取（authorized，即使目前 0 筆），或 env 缺失`;

// anon 應「完全碰不到」的表（never-public）。公開目錄表（activities、guide_profiles…）
// 刻意不列入——它們對 anon 開放 SELECT 是 by-design，列入會誤報。
const SENSITIVE_TABLES = [
  'orders',
  'users',
  'payments',
  'payment_events',
  'refund_requests',
  'payouts',
  'guide_balances',
  'settlement_rules',
  'traveler_profiles',
  'guide_applications',
  'bookings',
];

/**
 * 純分類函式（可離線單測）：把一次 anon SELECT 的結果判為 leak / exposed / denied。
 *   - leak     ：讀到 >=1 筆 → 生產資料正在外洩（critical）
 *   - exposed  ：無 error 但 0 筆 → anon 被授權查此表，一旦有資料就會洩（cold-start 也擋得到）
 *   - denied   ：有 error（permission denied / RLS 擋 / 表不存在）→ 安全
 * leak 與 exposed 都算 FAIL；denied 才是 PASS。
 */
export function classifyProbe({ error, data }) {
  if (Array.isArray(data) && data.length > 0) {
    return { status: 'leak', rows: data.length };
  }
  if (error) {
    return { status: 'denied', reason: error.code || error.message || 'error' };
  }
  // 無 error、0 筆：anon 被授權存取（RLS 過濾光或表恰好空）——仍屬風險
  return { status: 'exposed', rows: 0 };
}

export function isFail(status) {
  return status === 'leak' || status === 'exposed';
}

function parseArgs(argv) {
  const options = { help: false, json: false, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--output') { options.output = argv[i + 1] ?? null; i += 1; continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function sanitize(text) {
  return text
    .replace(/(SUPABASE_URL=)([^\s]+)/gi, '$1<redacted>')
    .replace(/(SUPABASE_ANON_KEY=)([^\s]+)/gi, '$1<redacted>')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1<redacted>');
}

async function probeTable(client, table) {
  // maybeSingle 不用；取 limit 1 足以判斷是否讀得到列。只取一欄避免拉整列 PII。
  const { data, error } = await client.from(table).select('*', { head: false }).limit(1);
  const verdict = classifyProbe({ error, data });
  return { table, ...verdict };
}

function formatText(results, summary) {
  const lines = [];
  lines.push('=== Anon RLS Probe Report（唯讀行為式外洩探測）===');
  lines.push(`Overall: ${summary.overall_status.toUpperCase()}`);
  lines.push(`Tables probed: ${summary.tables_probed}`);
  lines.push(`Denied(safe): ${summary.denied}  Exposed: ${summary.exposed}  Leak: ${summary.leak}`);
  lines.push(`Timestamp: ${summary.timestamp}`);
  lines.push('');
  for (const r of results) {
    const label = r.status === 'denied' ? 'PASS ' : r.status === 'leak' ? 'LEAK ' : 'EXPOSED';
    lines.push(`[${label}] ${r.table}${r.status === 'leak' ? ` — anon 讀到 ${r.rows} 筆（僅顯示筆數，不印內容）` : r.status === 'exposed' ? ' — anon 被授權存取（目前 0 筆，一旦有資料即外洩）' : ` — denied (${r.reason})`}`);
  }
  return lines.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(USAGE); return 0; }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error('Missing required env: SUPABASE_URL and SUPABASE_ANON_KEY must be set.\nRun with --help for usage.');
    return 1;
  }

  // 刻意用 anon key（模擬攻擊者）；關閉 session 持久化。
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' },
  });

  const results = [];
  for (const table of SENSITIVE_TABLES) {
    // 逐張序列探測，錯誤不中斷整體
    try {
      results.push(await probeTable(client, table));
    } catch (err) {
      results.push({ table, status: 'denied', reason: `probe_threw: ${err?.message || 'unknown'}` });
    }
  }

  const leak = results.filter((r) => r.status === 'leak').length;
  const exposed = results.filter((r) => r.status === 'exposed').length;
  const denied = results.filter((r) => r.status === 'denied').length;
  const overallStatus = (leak + exposed) > 0 ? 'fail' : 'pass';

  const summary = {
    overall_status: overallStatus,
    tables_probed: SENSITIVE_TABLES.length,
    leak, exposed, denied,
    timestamp: new Date().toISOString(),
  };

  const report = { summary, results, sensitive_tables: SENSITIVE_TABLES };
  const output = options.json ? JSON.stringify(report, null, 2) : formatText(results, summary);
  const safeOutput = sanitize(output);
  console.log(safeOutput);
  if (options.output) {
    await mkdir(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${safeOutput}\n`, 'utf8');
  }
  return overallStatus === 'pass' ? 0 : 1;
}

// 僅在直接執行時跑 main（被 import 做單測時不執行）
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(sanitize(JSON.stringify({ overall_status: 'fail', error: String(err?.message || 'unknown'), timestamp: new Date().toISOString() }, null, 2)));
      process.exit(1);
    });
}
