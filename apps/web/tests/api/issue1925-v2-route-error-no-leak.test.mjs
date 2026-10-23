/**
 * #1925：v2 route 的 5xx／4xx 錯誤回應不得外洩 DB／例外字串（行為測試）。
 *
 * 手法比照 issue1917：實際執行 route handler，把其相對 import 與 supabase-js 改寫為記憶體 stub 後在暫存目錄載入。
 * stub 丟出含 `secret-db-detail` 的錯誤，斷言：
 *   - HTTP status 與 envelope 形狀與修正前相同；
 *   - 回應 body 不含 secret-db-detail（亦不含 relation）；
 *   - 原始錯誤有交給 reportRouteError（server 端可追查）；
 *   - 我方定義的業務訊息（domain error）仍原樣回給 client。
 * route-error 的純函式（pickSafeMessage 等）使用真實實作，只有「上報」被 stub。
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import test, { after, before } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, '../..');
const SECRET = 'secret-db-detail relation "orders" column x';
const REAL_ROUTE_ERROR = pathToFileURL(path.join(WEB, 'src/lib/route-error.ts')).href;

const ROUTES = {
  pendingApproval: 'app/api/v2/guide/bookings/pending-approval/route.ts',
  payouts: 'app/api/v2/admin/payouts/route.ts',
  payoutGenerate: 'app/api/v2/admin/payouts/generate/route.ts',
  payoutBalances: 'app/api/v2/admin/payouts/balances/route.ts',
  payoutCancel: 'app/api/v2/admin/payouts/[payoutId]/cancel/route.ts',
  payoutConfirm: 'app/api/v2/admin/payouts/[payoutId]/confirm/route.ts',
  adminOrders: 'app/api/v2/admin/orders/route.ts',
  adminOrder: 'app/api/v2/admin/orders/[orderId]/route.ts',
  adminRefundRequests: 'app/api/v2/admin/refund-requests/route.ts',
  refundApprove: 'app/api/v2/admin/refund-requests/[refundRequestId]/approve/route.ts',
  guideApproval: 'app/api/v2/guide/bookings/[bookingId]/approval/route.ts',
};

const STUBS = {
  'route-error.mjs': `
import { pickSafeMessage, getErrorText, isDomainError, ORDER_DOMAIN_ERROR_PATTERNS, GENERIC_SERVER_ERROR_MESSAGE } from '${REAL_ROUTE_ERROR}';
export { pickSafeMessage, getErrorText, isDomainError, ORDER_DOMAIN_ERROR_PATTERNS, GENERIC_SERVER_ERROR_MESSAGE };
export async function reportRouteError(err, opts) {
  (globalThis.__T1925.reported ||= []).push({ message: err instanceof Error ? err.message : String(err), route: opts.route });
}
export async function handleRouteError(err, opts) {
  await reportRouteError(err, opts);
  return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: GENERIC_SERVER_ERROR_MESSAGE } }, { status: 500 });
}`,
  'api.mjs': `
export const ok = (data) => ({ success: true, data });
export const fail = (code, message) => ({ ok: false, error: { code, message } });
export const errorV2 = (code, message) => ({ success: false, error: { code, message } });
export const successV2 = (data) => ({ success: true, data });`,
  'guide-auth.mjs': `export const verifyGuideSession = () => ({ guideId: 'g1' });`,
  'csrf.mjs': `export const validateCsrf = () => null;`,
  'env.mjs': `export const getSupabaseUrl = () => 'http://stub.invalid'; export const getSupabaseServiceRoleKey = () => 'stub-key';`,
  'next.mjs': `export class NextRequest extends Request {}\nexport const NextResponse = { json: (body, init) => Response.json(body, init) };`,
  'guard.mjs': `export const isPayoutConfirmAllowed = () => ({ allowed: true });`,
  'notify.mjs': `export const notifyBookingApprovalDecided = async () => {};`,
  'supabase.mjs': `
export function createClient() {
  const q = {
    select() { return q; }, order() { return q; }, limit() { return q; },
    then(resolve) {
      const w = globalThis.__T1925;
      if (w.supabaseError) return resolve({ data: null, error: { message: w.supabaseError } });
      return resolve({ data: [], error: null });
    },
  };
  return { from() { return q; } };
}`,
  'db.mjs': `
const call = (name) => async (...args) => {
  const w = globalThis.__T1925;
  const impl = w.db[name];
  if (impl) return impl(...args);
  return [];
};
export const listGuidePendingApprovalsDb = call('listGuidePendingApprovalsDb');
export const listAdminOrdersDb = call('listAdminOrdersDb');
export const getAdminOrderDetailDb = call('getAdminOrderDetailDb');
export const updateAdminOrderDb = call('updateAdminOrderDb');
export const listAdminRefundRequestsDb = call('listAdminRefundRequestsDb');
export const updateAdminRefundStatusDb = call('updateAdminRefundStatusDb');
export const generateManualPayoutDb = call('generateManualPayoutDb');
export const cancelPayoutDb = call('cancelPayoutDb');
export const listGuideBalancesWithProfilesDb = call('listGuideBalancesWithProfilesDb');
export const decideBookingApprovalDb = call('decideBookingApprovalDb');`,
  'atomic.mjs': `export const confirmPayoutAtomicDb = async (...a) => globalThis.__T1925.db.confirmPayoutAtomicDb(...a);`,
  'settlement-config.mjs': `export const getSettlementConfig = async () => ({ min_withdrawal_twd: 1000 });`,
  'noop.mjs': `export const dispatchOrderEventTelegram = async () => {}; export const adminStatusToTelegramKind = () => null; export const pushTravelerOrderEvent = async () => {}; export const pushGuideOrderEvent = async () => {};`,
};

const IMPORT_MAP = {
  'lib/route-error': 'route-error.mjs',
  'lib/api': 'api.mjs',
  'lib/guide-auth': 'guide-auth.mjs',
  'lib/csrf.mjs': 'csrf.mjs',
  'config/supabase-service-env.mjs': 'env.mjs',
  'lib/db.mjs': 'db.mjs',
  'lib/settlement/payout-confirm-guard.mjs': 'guard.mjs',
  'lib/settlement/db-settlement-atomic.mjs': 'atomic.mjs',
  'lib/settlement-config': 'settlement-config.mjs',
  'lib/booking-approval-notify': 'notify.mjs',
  'lib/order-telegram-notify.mjs': 'noop.mjs',
  'lib/admin-order-event-kind.mjs': 'noop.mjs',
  'lib/line-traveler-push.mjs': 'noop.mjs',
  'lib/line-guide-push.mjs': 'noop.mjs',
};

let tmpDir;
const handlers = {};

async function loadRoute(name, rel) {
  const url = (f) => pathToFileURL(path.join(tmpDir, f)).href;
  let src = await readFile(path.join(WEB, rel), 'utf8');
  src = src.replace(/(from |import\()'(?:\.\.\/)+src\/([^']+)'/g, (m, lead, rest) => {
    assert.ok(IMPORT_MAP[rest], `未知的 import：${rest}`);
    return `${lead}'${url(IMPORT_MAP[rest])}'`;
  });
  src = src.replace(/import\('@supabase\/supabase-js'\)/u, `import('${url('supabase.mjs')}')`);
  src = src.replace(/from 'next\/server'/u, `from '${url('next.mjs')}'`);
  assert.ok(!/from '\.\.?\//.test(src), `${name} 仍有未改寫的相對 import`);
  await writeFile(path.join(tmpDir, `${name}.ts`), src);
  return import(url(`${name}.ts`));
}

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'tp-1925-'));
  for (const [n, body] of Object.entries(STUBS)) await writeFile(path.join(tmpDir, n), body);
  for (const [name, rel] of Object.entries(ROUTES)) handlers[name] = await loadRoute(name, rel);
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

function seed(db = {}, extra = {}) {
  globalThis.__T1925 = { db, reported: [], ...extra };
}

async function readBody(res) {
  const text = await res.text();
  assert.ok(!text.includes('secret-db-detail'), `回應不得含 DB 錯誤字串：${text}`);
  assert.ok(!/relation/i.test(text), `回應不得含 relation：${text}`);
  return JSON.parse(text);
}

function reportedSecret() {
  return globalThis.__T1925.reported.some((r) => r.message.includes('secret-db-detail'));
}

const ctx = (params) => ({ params: Promise.resolve(params) });
const post = (url, body = {}) => new Request(url, { method: 'POST', body: JSON.stringify(body) });

test('guide/bookings/pending-approval：gateway 丟 DB 錯誤 → 500 SERVER_ERROR 通用文案，且上報原始錯誤', async () => {
  seed({ listGuidePendingApprovalsDb: async () => { throw new Error(SECRET); } });
  const res = await handlers.pendingApproval.GET(new Request('http://x/api/v2/guide/bookings/pending-approval'));
  assert.equal(res.status, 500);
  const body = await readBody(res);
  assert.equal(body.error.code, 'SERVER_ERROR');
  assert.ok(reportedSecret(), '原始錯誤應交給 reportRouteError');
});

test('guide/bookings/pending-approval：stub 自檢——正常路徑回 200', async () => {
  seed({ listGuidePendingApprovalsDb: async () => [{ id: 'b1' }] });
  const res = await handlers.pendingApproval.GET(new Request('http://x/api/v2/guide/bookings/pending-approval'));
  assert.equal(res.status, 200);
});

test('admin/payouts GET：supabase 查詢回 error → 500 且不含 DB 字串', async () => {
  seed({}, { supabaseError: SECRET });
  const res = await handlers.payouts.GET();
  assert.equal(res.status, 500);
  const body = await readBody(res);
  assert.equal(body.ok, false);
  assert.equal(typeof body.error, 'string');
  assert.ok(reportedSecret());
});

test('admin/payouts/generate：DB 例外 → 400 通用文案；業務訊息（餘額為 0）原樣保留', async () => {
  seed({ generateManualPayoutDb: async () => { throw new Error(SECRET); } });
  let res = await handlers.payoutGenerate.POST(post('http://x/g', { guide_id: 'g1' }));
  assert.equal(res.status, 400);
  assert.equal((await readBody(res)).ok, false);
  assert.ok(reportedSecret());

  seed({ generateManualPayoutDb: async () => { throw new Error('guide balance is empty — nothing to pay out'); } });
  res = await handlers.payoutGenerate.POST(post('http://x/g', { guide_id: 'g1' }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'guide balance is empty — nothing to pay out');
});

test('admin/payouts/balances：DB 例外 → 500 通用文案', async () => {
  seed({ listGuideBalancesWithProfilesDb: async () => { throw new Error(SECRET); } });
  const res = await handlers.payoutBalances.GET();
  assert.equal(res.status, 500);
  assert.equal((await readBody(res)).ok, false);
  assert.ok(reportedSecret());
});

test('admin/payouts/[payoutId]/cancel：DB 例外 → 400 通用文案；payout already paid 原樣保留', async () => {
  seed({ cancelPayoutDb: async () => { throw new Error(SECRET); } });
  let res = await handlers.payoutCancel.POST(post('http://x/c'), ctx({ payoutId: 'p1' }));
  assert.equal(res.status, 400);
  await readBody(res);
  assert.ok(reportedSecret());

  seed({ cancelPayoutDb: async () => { throw new Error('payout already paid'); } });
  res = await handlers.payoutCancel.POST(post('http://x/c'), ctx({ payoutId: 'p1' }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'payout already paid');
});

test('admin/payouts/[payoutId]/confirm：DB 例外 → 400 通用文案；餘額不足（DB RAISE 的我方訊息）原樣保留', async () => {
  seed({ confirmPayoutAtomicDb: async () => { throw new Error(SECRET); } });
  let res = await handlers.payoutConfirm.POST(post('http://x/c'), ctx({ payoutId: 'p1' }));
  assert.equal(res.status, 400);
  await readBody(res);
  assert.ok(reportedSecret());

  seed({ confirmPayoutAtomicDb: async () => { throw new Error('insufficient guide balance: have 100, need 500'); } });
  res = await handlers.payoutConfirm.POST(post('http://x/c'), ctx({ payoutId: 'p1' }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'insufficient guide balance: have 100, need 500');
});

test('admin/orders GET（catch 直接回 err.message 的代表）：500 SERVER_ERROR 通用文案', async () => {
  seed({ listAdminOrdersDb: async () => { throw new Error(SECRET); } });
  const res = await handlers.adminOrders.GET(new Request('http://x/api/v2/admin/orders'));
  assert.equal(res.status, 500);
  const body = await readBody(res);
  assert.equal(body.error.code, 'SERVER_ERROR');
  assert.ok(reportedSecret());
});

test('admin/refund-requests GET：500 SERVER_ERROR 通用文案', async () => {
  seed({ listAdminRefundRequestsDb: async () => { throw new Error(SECRET); } });
  const res = await handlers.adminRefundRequests.GET();
  assert.equal(res.status, 500);
  assert.equal((await readBody(res)).error.code, 'SERVER_ERROR');
  assert.ok(reportedSecret());
});

test('admin/refund-requests/[id]/approve：DB 例外 → 400 INVALID_REQUEST 通用文案；not found 業務訊息維持 404', async () => {
  seed({ updateAdminRefundStatusDb: async () => { throw new Error(SECRET); } });
  let res = await handlers.refundApprove.POST(post('http://x/a'), ctx({ refundRequestId: 'r1' }));
  assert.equal(res.status, 400);
  assert.equal((await readBody(res)).error.code, 'INVALID_REQUEST');

  seed({ updateAdminRefundStatusDb: async () => { throw new Error('refund request not found'); } });
  res = await handlers.refundApprove.POST(post('http://x/a'), ctx({ refundRequestId: 'r1' }));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.message, 'refund request not found');
});

test('admin/orders/[orderId] GET：業務訊息 order not found 維持 404 原文；DB 例外 → 400 通用；含 not found 的 DB 字串仍 404 但不外洩', async () => {
  seed({ getAdminOrderDetailDb: async () => { throw new Error('order not found'); } });
  let res = await handlers.adminOrder.GET(new Request('http://x'), ctx({ orderId: 'o1' }));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.message, 'order not found');

  seed({ getAdminOrderDetailDb: async () => { throw new Error(SECRET); } });
  res = await handlers.adminOrder.GET(new Request('http://x'), ctx({ orderId: 'o1' }));
  assert.equal(res.status, 400);
  assert.equal((await readBody(res)).error.code, 'INVALID_REQUEST');

  seed({ getAdminOrderDetailDb: async () => { throw new Error(`${SECRET} not found`); } });
  res = await handlers.adminOrder.GET(new Request('http://x'), ctx({ orderId: 'o1' }));
  assert.equal(res.status, 404);
  await readBody(res);
});

test('admin/orders/[orderId] PATCH：capacity insufficient／locked 等業務語意不變；DB 例外 → 400 通用文案', async () => {
  const patch = () => handlers.adminOrder.PATCH(
    new Request('http://x', { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) }),
    ctx({ orderId: 'o1' }),
  );

  seed({ getAdminOrderDetailDb: async () => null, updateAdminOrderDb: async () => { throw new Error('capacity insufficient: capacity=2 booked=2 delta=1'); } });
  let res = await patch();
  assert.equal(res.status, 400);
  const cap = await res.json();
  assert.equal(cap.error.code, 'CAPACITY_INSUFFICIENT');
  assert.equal(cap.error.message, 'capacity insufficient: capacity=2 booked=2 delta=1');

  seed({ getAdminOrderDetailDb: async () => null, updateAdminOrderDb: async () => { throw new Error('order_edit_locked:completed'); } });
  res = await patch();
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'ORDER_EDIT_LOCKED');

  seed({ getAdminOrderDetailDb: async () => null, updateAdminOrderDb: async () => { throw new Error(SECRET); } });
  res = await patch();
  assert.equal(res.status, 400);
  const body = await readBody(res);
  assert.equal(body.error.code, 'INVALID_REQUEST');
  assert.ok(reportedSecret());
});

test('guide/bookings/[bookingId]/approval：已知業務碼維持原狀態與訊息；未知（DB）錯誤 → 500 SERVER_ERROR 通用文案', async () => {
  const run = () => handlers.guideApproval.POST(
    new Request('http://x', { method: 'POST', body: JSON.stringify({ action: 'approve' }) }),
    ctx({ bookingId: 'b1' }),
  );

  seed({ decideBookingApprovalDb: async () => { throw new Error('NOT_PENDING_APPROVAL: booking is not pending'); } });
  let res = await run();
  assert.equal(res.status, 409);
  const known = await res.json();
  assert.equal(known.error.code, 'NOT_PENDING_APPROVAL');
  assert.equal(known.error.message, 'booking is not pending');

  seed({ decideBookingApprovalDb: async () => { throw new Error(`${SECRET}: more`); } });
  res = await run();
  assert.equal(res.status, 500);
  const body = await readBody(res);
  assert.equal(body.error.code, 'SERVER_ERROR');
  assert.ok(reportedSecret());
});
