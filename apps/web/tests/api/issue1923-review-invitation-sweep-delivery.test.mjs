/**
 * #1923：review-invitation-sweep 必須讀取寄送結果，且寫入 DB 的值要符合 CHECK constraint。
 *
 * - 行為測試：實際執行 route 的 POST（相對 import 改寫為 stub；supabase stub 會依 migration 的
 *   CHECK 允許集合拒絕不合法的 initiated_by／status，模擬真實 DB 行為）。
 * - 單元測試：delivery 結果 → { 計數, DB 列 } 的純函式。
 * - 原始碼斷言：route 有使用純函式；route 與 admin route 的字面值都在 CHECK 允許集合內。
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import test, { after, before } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, '../..');
const ROUTE_REL = 'app/api/internal/reviews/review-invitation-sweep/route.ts';
const ADMIN_ROUTE_REL = 'app/api/v2/admin/orders/[orderId]/send-review-invitation/route.ts';
const MIGRATION = path.resolve(WEB, '../../supabase/migrations/20260604_issue1174_review_invitations.sql');
const DELIVERY_MODULE = path.join(WEB, 'src/lib/post-trip/sweep/review-invitation-delivery.mjs');

function checkSet(sql, column) {
  const m = sql.match(new RegExp(`${column}\\s+text[^;]*?CHECK \\(${column} IN \\(([^)]*)\\)\\)`, 's'));
  assert.ok(m, `migration 應有 ${column} CHECK`);
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
}
const sql = readFileSync(MIGRATION, 'utf8');
const ALLOWED_INITIATED_BY = checkSet(sql, 'initiated_by');
const ALLOWED_STATUS = checkSet(sql, 'status');

const STUB_SUPABASE = `
const CHECK = globalThis.__T1923.check;
export function createClient() {
  return {
    from(table) {
      let op = 'select'; let payload = null;
      const q = {
        select() { return q; }, in() { return q; }, eq() { return q; },
        insert(row) { op = 'insert'; payload = row; return q; },
        then(resolve) {
          const w = globalThis.__T1923;
          if (table === 'orders') return resolve({ data: w.orders, error: null });
          if (table === 'review_invitations' && op === 'select') return resolve({ data: w.existing ?? [], error: null });
          if (table === 'review_invitations' && op === 'insert') {
            w.attempts.push(payload);
            if (!CHECK.initiated_by.has(payload.initiated_by) || !CHECK.status.has(payload.status)) {
              return resolve({ data: null, error: { code: '23514', message: 'violates check constraint' } });
            }
            w.rows.push(payload);
            return resolve({ data: null, error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return q;
    },
  };
}`;
const STUB_NEXT = `
export class NextRequest extends Request {}
export const NextResponse = { json: (body, init) => Response.json(body, init) };`;
const STUB_EMAIL = `
export async function sendReviewInvitation(data) {
  const w = globalThis.__T1923;
  const email = data.contactEmail;
  w.sendCalls.push(email);
  if (email.startsWith('throwpii')) throw new Error('smtp rejected user@example.com: mailbox full');
  if (email.startsWith('throw')) throw new Error('boom-throw');
  if (email.trim() === '') return { ok: false, status: 'skipped', errorCode: 'NO_RECIPIENT', errorMessage: 'recipient is empty', fn: 'x', to: email, subject: 's' };
  if (email.startsWith('noprov')) return { ok: false, status: 'skipped', errorCode: 'EMAIL_PROVIDER_NOT_CONFIGURED', errorMessage: 'no key', fn: 'x', to: email, subject: 's' };
  if (email.startsWith('fail')) return { ok: false, status: 'failed', errorCode: 'EMAIL_SEND_FAILED', errorMessage: 'PII-LEAK ' + email, fn: 'x', to: email, subject: 's' };
  return { ok: true, status: 'sent', messageId: 'msg-' + email, fn: 'x', to: email, subject: 's' };
}`;
const STUB_PROMO = `export async function fetchReturningPromoEmailBlock() { return null; }`;
const STUB_CRON = `
export async function isCronJobEnabled() { return { enabled: true }; }
export async function recordCronRun(x) { (globalThis.__T1923.cron ||= []).push(x); }`;
const STUB_ROUTE_ERROR = `
export async function reportRouteError(err, opts) { (globalThis.__T1923.reported ||= []).push({ err, opts }); }`;
const STUB_ENV = `
export const getSupabaseUrl = () => 'http://stub.invalid';
export const getSupabaseServiceRoleKey = () => 'stub-key';`;

let tmpDir;
let POST;

before(async () => {
  globalThis.__T1923 = { check: { initiated_by: ALLOWED_INITIATED_BY, status: ALLOWED_STATUS } };
  tmpDir = await mkdtemp(path.join(tmpdir(), 'tp-1923-'));
  const url = (f) => pathToFileURL(path.join(tmpDir, f)).href;
  const files = {
    'supabase.mjs': STUB_SUPABASE, 'next.mjs': STUB_NEXT, 'email.mjs': STUB_EMAIL,
    'promo.mjs': STUB_PROMO, 'cron.mjs': STUB_CRON, 'env.mjs': STUB_ENV,
    'route-error.mjs': STUB_ROUTE_ERROR,
  };
  for (const [n, b] of Object.entries(files)) await writeFile(path.join(tmpDir, n), b);
  const real = (rel) => pathToFileURL(path.join(WEB, rel)).href;
  const map = {
    'lib/post-trip/review-invitation-sweep.mjs': real('src/lib/post-trip/review-invitation-sweep.mjs'),
    'lib/post-trip/sweep/redact-error-email.mjs': real('src/lib/post-trip/sweep/redact-error-email.mjs'),
    'lib/post-trip/sweep/review-invitation-delivery.mjs': real('src/lib/post-trip/sweep/review-invitation-delivery.mjs'),
    'lib/email': url('email.mjs'),
    'lib/returning-promo.mjs': url('promo.mjs'),
    'lib/cron-job-controls.mjs': url('cron.mjs'),
    'lib/route-error': url('route-error.mjs'),
    'config/supabase-service-env.mjs': url('env.mjs'),
  };
  let src = await readFile(path.join(WEB, ROUTE_REL), 'utf8');
  src = src.replace(/from '(?:\.\.\/)+src\/([^']+)'/g, (m, rest) => {
    assert.ok(map[rest], `未知的 import：${rest}`);
    return `from '${map[rest]}'`;
  });
  src = src.replace(/import\('@supabase\/supabase-js'\)/u, `import('${url('supabase.mjs')}')`);
  src = src.replace(/from 'next\/server'/u, `from '${url('next.mjs')}'`);
  assert.ok(!/from '\.\.?\//.test(src), 'route 仍有未改寫的相對 import');
  await writeFile(path.join(tmpDir, 'route.ts'), src);
  process.env.INTERNAL_ALERT_TOKEN = 'tok-1923';
  process.env.REVIEW_INVITATION_SWEEP_ENABLED = '1';
  ({ POST } = await import(url('route.ts')));
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  delete process.env.INTERNAL_ALERT_TOKEN;
  delete process.env.REVIEW_INVITATION_SWEEP_ENABLED;
});

function order(id, email) {
  return {
    id, status: 'paid', contact_email: email, contact_name: 'N', user_id: null,
    activity_schedules: { end_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(), start_at: null },
    activities: { title: 'T' }, operations_tracking: { has_complaint: false },
  };
}
async function run(orders, existing = []) {
  globalThis.__T1923 = { check: { initiated_by: ALLOWED_INITIATED_BY, status: ALLOWED_STATUS }, orders, existing, rows: [], attempts: [], sendCalls: [] };
  const res = await POST(new Request('http://x/api/internal/reviews/review-invitation-sweep', { method: 'POST', headers: { 'x-internal-token': 'tok-1923' } }));
  const body = await res.json();
  return { res, body, w: globalThis.__T1923 };
}

test('CHECK 允許集合解析自 migration（自檢）', () => {
  assert.deepEqual([...ALLOWED_INITIATED_BY].sort(), ['admin_manual', 'cron']);
  assert.deepEqual([...ALLOWED_STATUS].sort(), ['failed', 'sent', 'suppressed']);
});

test('ok:true → 寫入 sent 列（initiated_by=cron、含 provider_message_id），sent+1', async () => {
  const { body, w } = await run([order('o1', 'ok@x.test')]);
  assert.equal(body.sent, 1);
  assert.equal(body.failed, 0);
  assert.equal(w.rows.length, 1, 'DB 應實際收下一列（不被 CHECK 拒絕）');
  assert.equal(w.rows[0].status, 'sent');
  assert.equal(w.rows[0].initiated_by, 'cron');
  assert.equal(w.rows[0].order_id, 'o1');
  assert.equal(w.rows[0].provider_message_id, 'msg-ok@x.test');
});

test('ok:false failed → 寫入 failed 列，failure_reason 為 errorCode（不含 email／errorMessage），sent 不增加', async () => {
  const { body, w } = await run([order('o2', 'fail@x.test')]);
  assert.equal(body.sent, 0);
  assert.equal(body.failed, 1);
  assert.equal(w.rows.length, 1);
  assert.equal(w.rows[0].status, 'failed');
  assert.equal(w.rows[0].initiated_by, 'cron');
  assert.equal(w.rows[0].failure_reason, 'EMAIL_SEND_FAILED');
  assert.ok(!JSON.stringify(w.rows).includes('PII-LEAK'));
  assert.ok(!JSON.stringify(w.rows).includes('fail@x.test'));
});

test('空白 email 經 provider 回 NO_RECIPIENT → 計入 failed，但不寫列（否則每天累積）', async () => {
  const { body, w } = await run([order('o3', '   ')]);
  assert.equal(body.sent, 0);
  assert.equal(body.failed, 1);
  assert.equal(w.rows.length, 0);
  assert.equal(w.attempts.length, 0);
});

test('email 為 null 或 \'\'：不呼叫 sendReviewInvitation、failed+1、不寫列', async () => {
  const { body, w } = await run([order('n1', null), order('n2', ''), order('n3', '   ')]);
  assert.equal(w.sendCalls.length, 0, '空收件人不得呼叫 provider');
  assert.equal(body.sent, 0);
  assert.equal(body.failed, 3);
  assert.equal(w.attempts.length, 0);
});

test('recordCronRun summary 的 sent／failed 與實際計數一致（對調會紅）', async () => {
  const { body, w } = await run([order('a', 'ok@x.test'), order('b', 'ok2@x.test'), order('c', 'ok3@x.test'), order('d', 'fail@x.test'), order('e', null)]);
  assert.equal(body.sent, 3);
  assert.equal(body.failed, 2);
  const success = w.cron.find((c) => c.outcome === 'success');
  assert.ok(success, '應有 success 的 cron 紀錄');
  assert.equal(success.summary.sent, 3);
  assert.equal(success.summary.failed, 2);
});

test('EMAIL_PROVIDER_NOT_CONFIGURED → 計入 failed，但不寫 DB 列（避免設定問題每日累積假紀錄）', async () => {
  const { body, w } = await run([order('o4', 'noprov@x.test')]);
  assert.equal(body.sent, 0);
  assert.equal(body.failed, 1);
  assert.equal(w.rows.length, 0);
  assert.equal(w.attempts.length, 0);
});

test('send 拋出非預期例外 → 既有 catch：failed+1、寫 failed 列（initiated_by=cron）', async () => {
  const { body, w } = await run([order('o5', 'throw@x.test')]);
  assert.equal(body.sent, 0);
  assert.equal(body.failed, 1);
  assert.equal(w.rows.length, 1);
  assert.equal(w.rows[0].status, 'failed');
  assert.equal(w.rows[0].initiated_by, 'cron');
});

test('#1926 catch 路徑：failure_reason 為固定代碼 SWEEP_UNEXPECTED_ERROR，不含丟出的錯誤字串；原始錯誤只上報', async () => {
  const { w } = await run([order('o6', 'throw@x.test')]);
  assert.equal(w.rows.length, 1);
  assert.equal(w.rows[0].failure_reason, 'SWEEP_UNEXPECTED_ERROR');
  assert.ok(!JSON.stringify(w.rows).includes('boom-throw'));
  assert.ok(!JSON.stringify(w.rows).includes('throw@x.test'));
  assert.equal(w.reported?.length, 1, '原始例外應經 reportRouteError 上報');
  assert.match(String(w.reported[0].err?.message), /boom-throw/);
  assert.ok(!JSON.stringify(w.reported[0].opts).includes('throw@x.test'), '上報 metadata 不得含 email');
});

test('#1926 catch 路徑上報的錯誤 message 不含 email（遮罩為 [email]）', async () => {
  const { w } = await run([order('o7', 'throwpii@x.test')]);
  assert.equal(w.reported?.length, 1);
  const msg = String(w.reported[0].err.message);
  assert.ok(!msg.includes('user@example.com'), msg);
  assert.match(msg, /\[email\]/);
  assert.ok(!JSON.stringify(w.rows).includes('user@example.com'));
});

test('#1926 重試上限：existing 已有 3 筆 failed → 不呼叫 sendReviewInvitation；2 筆 failed 仍會寄', async () => {
  const failed = (id, n) => Array.from({ length: n }, () => ({ order_id: id, status: 'failed' }));
  const capped = await run([order('c1', 'ok@x.test')], failed('c1', 3));
  assert.equal(capped.w.sendCalls.length, 0);
  assert.equal(capped.body.sent, 0);
  assert.equal(capped.body.failed, 0);
  assert.equal(capped.body.skipReasonCounts.IDEMPOTENCY, 1);

  const notYet = await run([order('c2', 'ok@x.test')], failed('c2', 2));
  assert.equal(notYet.w.sendCalls.length, 1);
  assert.equal(notYet.body.sent, 1);
});

test('混合批次：計數與列數一致，且全部 insert 都通過 CHECK', async () => {
  const { body, w } = await run([order('a', 'ok@x.test'), order('b', 'fail@x.test'), order('c', 'ok2@x.test'), order('d', 'noprov@x.test')]);
  assert.equal(body.sent, 2);
  assert.equal(body.failed, 2);
  assert.equal(w.attempts.length, w.rows.length, '不得有被 CHECK 拒絕的 insert');
  assert.equal(w.rows.filter((r) => r.status === 'sent').length, 2);
});

test('DB CHECK 一致性（原始碼）：兩個 route 所有 initiated_by／status 字面值都在 migration 允許集合內', async () => {
  for (const rel of [ROUTE_REL, ADMIN_ROUTE_REL, 'src/lib/post-trip/sweep/review-invitation-delivery.mjs']) {
    const src = readFileSync(path.join(WEB, rel), 'utf8');
    const by = [...src.matchAll(/initiated_by:\s*'([^']+)'/g)].map((m) => m[1]);
    for (const v of by) assert.ok(ALLOWED_INITIATED_BY.has(v), `${rel} initiated_by='${v}' 不在 CHECK 允許集合`);
    // 只檢查「寫入 review_invitations 的物件」（含 initiated_by 的 object literal）內的 status 字面值，
    // 不誤抓 response body 的 status:'disabled'／'completed'
    const rowObjects = [...src.matchAll(/\{[^{}]*initiated_by[^{}]*\}/g)].map((m) => m[0]);
    for (const obj of rowObjects) {
      for (const m of obj.matchAll(/\bstatus:\s*'([^']+)'/g)) {
        assert.ok(ALLOWED_STATUS.has(m[1]), `${rel} status='${m[1]}' 不在 CHECK 允許集合`);
      }
    }
  }
  const { SWEEP_INITIATED_BY } = await import(pathToFileURL(DELIVERY_MODULE).href);
  assert.ok(ALLOWED_INITIATED_BY.has(SWEEP_INITIATED_BY), 'SWEEP_INITIATED_BY 必須在 CHECK 允許集合內');
  const sweepSrc = readFileSync(path.join(WEB, ROUTE_REL), 'utf8');
  assert.ok(!sweepSrc.includes('sweep_cron'));
});

test('route 原始碼：空 email 分支走 planner（不是單純 continue），且 summary 為 sent: sentCount／failed: failedCount', () => {
  const src = readFileSync(path.join(WEB, ROUTE_REL), 'utf8');
  assert.ok(!/if \(!order \|\| !order\._contactEmail\) continue;/.test(src));
  assert.match(src, /NO_RECIPIENT/);
  assert.match(src, /sent: sentCount, failed: failedCount/);
});

test('route 使用 delivery 純函式並讀取 sendReviewInvitation 回傳值', () => {
  const src = readFileSync(path.join(WEB, ROUTE_REL), 'utf8');
  assert.match(src, /review-invitation-delivery\.mjs/);
  assert.match(src, /=\s*await sendReviewInvitation\(/);
});

// ── 純函式 ───────────────────────────────────────────────────────────────────
const NOW = '2026-06-04T12:00:00.000Z';

test('planSweepDelivery：ok → sent 列＋sent 計數', async () => {
  const { planSweepDelivery } = await import(pathToFileURL(DELIVERY_MODULE).href);
  const r = planSweepDelivery({ result: { ok: true, status: 'sent', messageId: 'm1' }, orderId: 'o', nowIso: NOW });
  assert.deepEqual(r.countDelta, { sent: 1, failed: 0 });
  assert.deepEqual(r.row, { order_id: 'o', status: 'sent', initiated_by: 'cron', sent_at: NOW, provider_message_id: 'm1' });
});

test('planSweepDelivery：failed → failed 列用 errorCode；缺 errorCode 退回 EMAIL_SEND_FAILED；undefined 結果視為失敗', async () => {
  const { planSweepDelivery } = await import(pathToFileURL(DELIVERY_MODULE).href);
  const a = planSweepDelivery({ result: { ok: false, status: 'failed', errorCode: 'EMAIL_SEND_FAILED', errorMessage: 'a@b.c' }, orderId: 'o', nowIso: NOW });
  assert.deepEqual(a.countDelta, { sent: 0, failed: 1 });
  assert.equal(a.row.failure_reason, 'EMAIL_SEND_FAILED');
  assert.ok(!JSON.stringify(a).includes('a@b.c'));
  const b = planSweepDelivery({ result: { ok: false }, orderId: 'o', nowIso: NOW });
  assert.equal(b.row.failure_reason, 'EMAIL_SEND_FAILED');
  const c = planSweepDelivery({ result: undefined, orderId: 'o', nowIso: NOW });
  assert.deepEqual(c.countDelta, { sent: 0, failed: 1 });
});

test('planSweepDelivery：NO_RECIPIENT → 只計數不寫列；EMAIL_PROVIDER_NOT_CONFIGURED → 只計數不寫列', async () => {
  const { planSweepDelivery } = await import(pathToFileURL(DELIVERY_MODULE).href);
  const a = planSweepDelivery({ result: { ok: false, status: 'skipped', errorCode: 'NO_RECIPIENT' }, orderId: 'o', nowIso: NOW });
  assert.deepEqual(a.countDelta, { sent: 0, failed: 1 });
  assert.equal(a.row, null);
  const b = planSweepDelivery({ result: { ok: false, status: 'skipped', errorCode: 'EMAIL_PROVIDER_NOT_CONFIGURED' }, orderId: 'o', nowIso: NOW });
  assert.deepEqual(b.countDelta, { sent: 0, failed: 1 });
  assert.equal(b.row, null);
});
