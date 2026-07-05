/**
 * #1616 — SERVICE_ROLE env 集中守門（P4 env 收斂第一批）。
 *
 * app+src 內禁止以 process.env 直讀 SUPABASE_SERVICE_ROLE_KEY／SUPABASE_URL，
 * 一律經 src/config/supabase-service-env.mjs 的 getter。白名單：
 *   - src/config/**（getter 本體與凍結的 security-env/startup-env）
 *   - 凍結區 app/api/payments/**（鐵律 3，改不動；owner 解凍後再收）
 * 新增直讀 → 紅燈。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '../..');

const DIRECT_READ_RE = /process\.env\.(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL)\b/;
const EXEMPT_RE = /^(src\/config\/|app\/api\/(orders|payments)\/)/;
const SOURCE_EXTS = ['.ts', '.tsx', '.mjs'];

function walk(relDir, out = []) {
  for (const entry of readdirSync(join(WEB_ROOT, relDir))) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const rel = `${relDir}/${entry}`;
    if (statSync(join(WEB_ROOT, rel)).isDirectory()) walk(rel, out);
    else if (
      SOURCE_EXTS.some((e) => rel.endsWith(e)) &&
      !rel.endsWith('.d.ts') && !rel.endsWith('.d.mts') &&
      !rel.includes('.test.') && !rel.split('/').includes('tests')
    ) out.push(rel);
  }
  return out;
}

test('SUPABASE_URL／SERVICE_ROLE_KEY 不得直讀 process.env（一律經 supabase-service-env getter）', () => {
  const offenders = [...walk('app'), ...walk('src')]
    .filter((rel) => !EXEMPT_RE.test(rel))
    .filter((rel) => DIRECT_READ_RE.test(readFileSync(join(WEB_ROOT, rel), 'utf8')));
  assert.deepEqual(
    offenders,
    [],
    `以下檔案直讀了 SUPABASE service env：\n${offenders.join('\n')}\n` +
      '請改用 src/config/supabase-service-env.mjs 的 getSupabaseUrl()/getSupabaseServiceRoleKey()（#1616）。'
  );
});
