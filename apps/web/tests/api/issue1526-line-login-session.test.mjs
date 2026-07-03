/**
 * Issue #1526 — issueLineSession orchestration（注入 mock deps，不打 Supabase）。
 *
 * 驗證：create_new 建帳→簽發→綁定、bind_existing 取既有 email 簽發、
 * generateLink/verifyOtp 失敗回對應 error、綁定失敗不阻斷登入、
 * autoLink 關閉時不查 email。
 *
 * Run: node --test apps/web/tests/api/issue1526-line-login-session.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { issueLineSession } = await import('../../src/lib/line-login-session.mjs');

function makeAdmin({ createUser, getUserById, generateLink, userByEmail } = {}) {
  const calls = { createUser: [], getUserById: [], generateLink: [], usersQuery: [] };
  return {
    calls,
    from(table) {
      return {
        select() {
          return {
            eq(col, val) {
              return {
                maybeSingle: async () => {
                  calls.usersQuery.push({ table, col, val });
                  return { data: userByEmail ? { id: userByEmail } : null };
                },
              };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        createUser: async (arg) => {
          calls.createUser.push(arg);
          return createUser ?? { data: { user: { id: 'new-user' } }, error: null };
        },
        getUserById: async (id) => {
          calls.getUserById.push(id);
          return getUserById ?? { data: { user: { id, email: 'existing@example.com' } }, error: null };
        },
        generateLink: async (arg) => {
          calls.generateLink.push(arg);
          return generateLink ?? { data: { properties: { hashed_token: 'tok_hash' } }, error: null };
        },
      },
    },
  };
}

function makeSsr({ verifyOtp } = {}) {
  const calls = { verifyOtp: [] };
  return {
    calls,
    auth: {
      verifyOtp: async (arg) => {
        calls.verifyOtp.push(arg);
        return verifyOtp ?? { error: null };
      },
    },
  };
}

test('create_new — 建帳、magiclink 簽發、綁定，回 action=create_new', async () => {
  const admin = makeAdmin();
  const ssr = makeSsr();
  const upserts = [];
  const r = await issueLineSession(
    { lineUserId: 'U1', email: 'new@example.com', name: 'Neo' },
    { admin, ssr, getMapping: async () => null, upsertMapping: async (x) => upserts.push(x), autoLink: false },
  );
  assert.equal(r.ok, true);
  assert.equal(r.action, 'create_new');
  assert.equal(admin.calls.createUser.length, 1);
  assert.equal(admin.calls.createUser[0].app_metadata.line_user_id, 'U1');
  assert.equal(admin.calls.generateLink[0].email, 'new@example.com');
  assert.deepEqual(ssr.calls.verifyOtp[0], { type: 'email', token_hash: 'tok_hash' });
  assert.equal(upserts[0].lineUserId, 'U1');
  assert.equal(upserts[0].userId, 'new-user');
});

test('bind_existing — 已綁定則取既有 user email 簽發，不建帳', async () => {
  const admin = makeAdmin();
  const ssr = makeSsr();
  const r = await issueLineSession(
    { lineUserId: 'U2', email: 'ignored@example.com', name: null },
    { admin, ssr, getMapping: async () => ({ userId: 'bound-user' }), upsertMapping: async () => {}, autoLink: false },
  );
  assert.equal(r.ok, true);
  assert.equal(r.action, 'bind_existing');
  assert.equal(admin.calls.createUser.length, 0, '已綁定不得建新帳');
  assert.equal(admin.calls.getUserById[0], 'bound-user');
  assert.equal(admin.calls.generateLink[0].email, 'existing@example.com');
});

test('autoLink 關閉 → 不查 users email，同 email 也建新帳', async () => {
  const admin = makeAdmin({ userByEmail: 'someone-else' });
  const ssr = makeSsr();
  const r = await issueLineSession(
    { lineUserId: 'U3', email: 'dup@example.com', name: null },
    { admin, ssr, getMapping: async () => null, upsertMapping: async () => {}, autoLink: false },
  );
  assert.equal(r.action, 'create_new');
  assert.equal(admin.calls.usersQuery.length, 0, 'autoLink 關閉時不得查 email');
});

test('autoLink 開啟 + 同 email 既有帳號 → link_by_email，不建帳', async () => {
  const admin = makeAdmin({ userByEmail: 'email-user' });
  const ssr = makeSsr();
  const r = await issueLineSession(
    { lineUserId: 'U4', email: 'link@example.com', name: null },
    { admin, ssr, getMapping: async () => null, upsertMapping: async () => {}, autoLink: true },
  );
  assert.equal(r.action, 'link_by_email');
  assert.equal(admin.calls.createUser.length, 0);
  assert.equal(admin.calls.getUserById[0], 'email-user');
});

test('generateLink 失敗 → 回 LINE_LOGIN_FAILED / 500', async () => {
  const admin = makeAdmin({ generateLink: { data: null, error: { message: 'boom' } } });
  const ssr = makeSsr();
  const r = await issueLineSession(
    { lineUserId: 'U5', email: 'e@example.com', name: null },
    { admin, ssr, getMapping: async () => null, upsertMapping: async () => {}, autoLink: false },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'LINE_LOGIN_FAILED');
  assert.equal(r.status, 500);
  assert.equal(ssr.calls.verifyOtp.length, 0, 'generateLink 失敗不得繼續 verifyOtp');
});

test('綁定失敗不阻斷登入（session 已建）→ 仍 ok', async () => {
  const admin = makeAdmin();
  const ssr = makeSsr();
  const r = await issueLineSession(
    { lineUserId: 'U6', email: 'e@example.com', name: null },
    { admin, ssr, getMapping: async () => null, upsertMapping: async () => { throw new Error('bind down'); }, autoLink: false },
  );
  assert.equal(r.ok, true, '綁定失敗時登入仍成功');
});
