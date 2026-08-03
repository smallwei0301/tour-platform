import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const wrapperModule = await import('../../src/lib/midao/with-guide-route.ts');
const idempotencyModule = await import('../../src/lib/midao/idempotency.ts');
const errorModule = await import('../../src/lib/midao/route-errors.ts');
const { withMidaoGuideQuery, withMidaoGuideCommand } = wrapperModule;
const { parseIdempotencyKey, hashIdempotentRequest } = idempotencyModule;
const { MidaoRouteError } = errorModule;
const wrapperSource = readFileSync(new URL('../../src/lib/midao/with-guide-route.ts', import.meta.url), 'utf8');
const routeErrorsSource = readFileSync(new URL('../../src/lib/midao/route-errors.ts', import.meta.url), 'utf8');

const canonical = {
  guideId: 'guide-1',
  guideName: 'DB Canonical Name',
  sessionVersion: 7,
  backendMode: 'midao',
  actorType: 'guide',
  actorId: 'guide-1',
};

function request(method = 'GET', body, headers = {}) {
  return new Request('https://example.test/api/v2/guide/resource', {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function responseJson(response) {
  return { status: response.status, body: await response.json() };
}

function getFunctionBody(source, functionName) {
  const signature = `export async function ${functionName}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1);

  let parenDepth = 0;
  let sawParen = false;
  let closeParen = -1;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') {
      sawParen = true;
      parenDepth += 1;
    } else if (!sawParen) {
      continue;
    } else if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        closeParen = index;
        break;
      }
    }
  }

  assert.notEqual(closeParen, -1);
  const braceStart = source.indexOf('{', closeParen);
  assert.notEqual(braceStart, -1);

  let depth = 1;
  for (let index = braceStart + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }
  throw new Error(`Failed to parse function body for ${functionName}`);
}

function assertDefaultRouteErrorChain() {
  assert.match(routeErrorsSource, /reportUnexpected = reportRouteError/u);
  assert.match(routeErrorsSource, /await reportUnexpected\(error, \{\s*route\s*\}\);/u);
}

function wrapperContractPattern() {
  return /catch \(error\)\s*\{[\s\S]*?return handleMidaoRouteError\(error,\s*\{[\s\S]*?route:\s*options\.route,\s*\n[\s\S]*?reportUnexpected:\s*options\.reportUnexpected,\s*\n[\s\S]*?\}\);/u;
}

test('query wrapper error path requires its own catch→handleMidaoRouteError contract', () => {
  const queryBody = getFunctionBody(wrapperSource, 'withMidaoGuideQuery');
  assert.match(queryBody, wrapperContractPattern());
  assertDefaultRouteErrorChain();
});

test('removing query chain triggers only query assertion failure, while command path still passes', () => {
  const queryBody = getFunctionBody(wrapperSource, 'withMidaoGuideQuery');
  const commandBody = getFunctionBody(wrapperSource, 'withMidaoGuideCommand');
  const queryBodyWithoutCatch = queryBody.replace(wrapperContractPattern(), '/*query-chain-removed*/');

  assert.throws(() => assert.match(queryBodyWithoutCatch, wrapperContractPattern()));
  assert.match(commandBody, wrapperContractPattern());
});

test('command wrapper error path requires its own catch→handleMidaoRouteError contract', () => {
  const commandBody = getFunctionBody(wrapperSource, 'withMidaoGuideCommand');
  assert.match(commandBody, wrapperContractPattern());
  assertDefaultRouteErrorChain();
});

test('removing command chain triggers only command assertion failure, while query path still passes', () => {
  const queryBody = getFunctionBody(wrapperSource, 'withMidaoGuideQuery');
  const commandBody = getFunctionBody(wrapperSource, 'withMidaoGuideCommand');
  const commandBodyWithoutCatch = commandBody.replace(wrapperContractPattern(), '/*command-chain-removed*/');

  assert.throws(() => assert.match(commandBodyWithoutCatch, wrapperContractPattern()));
  assert.match(queryBody, wrapperContractPattern());
});

test('query runs canonical guard before handler and emits only V2 success envelope', async () => {
  const order = [];
  const response = await withMidaoGuideQuery(
    request(),
    async (context) => {
      order.push('handler');
      assert.equal(context.guideName, 'DB Canonical Name');
      return { value: 1 };
    },
    {
      verifySession: async () => { order.push('guard'); return canonical; },
      requestId: () => 'request-query-1',
    },
  );
  assert.deepEqual(order, ['guard', 'handler']);
  assert.deepEqual(await responseJson(response), {
    status: 200,
    body: { success: true, data: { value: 1 } },
  });
});

test('command validates guard, CSRF, mutation gate, and idempotency before handler', async () => {
  const order = [];
  const response = await withMidaoGuideCommand(
    request('POST', { z: 1, a: { y: 2, x: 3 } }, {
      cookie: 'guide_name=Attacker%20Cookie; tp_csrf=csrf-value',
      'x-csrf-token': 'csrf-value',
      'idempotency-key': '  command-key-1  ',
    }),
    async (context) => {
      order.push('handler');
      assert.deepEqual({
        guideId: context.guideId,
        guideName: context.guideName,
        sessionVersion: context.sessionVersion,
        actorType: context.actorType,
        actorId: context.actorId,
        idempotencyKey: context.idempotencyKey,
      }, {
        guideId: 'guide-1', guideName: 'DB Canonical Name', sessionVersion: 7,
        actorType: 'guide', actorId: 'guide-1', idempotencyKey: 'command-key-1',
      });
      assert.equal(context.guideName.includes('Attacker'), false);
      assert.match(context.requestId, /^request-command-/u);
      assert.match(context.requestHash, /^[a-f0-9]{64}$/u);
      return { accepted: true };
    },
    {
      verifySession: async () => { order.push('guard'); return canonical; },
      validateCsrfRequest: () => { order.push('csrf'); return null; },
      mutationsEnabled: () => { order.push('mutation'); return true; },
      requestId: () => 'request-command-1',
    },
  );
  assert.deepEqual(order, ['guard', 'csrf', 'mutation', 'handler']);
  assert.deepEqual(await responseJson(response), {
    status: 200,
    body: { success: true, data: { accepted: true } },
  });
});

test('Idempotency-Key is ASCII-trimmed, printable, and 1-128 bytes', () => {
  assert.equal(parseIdempotencyKey('  abc 123  '), 'abc 123');
  for (const invalid of [null, '', '   ', 'a\n', 'a\u007f', '密鑰', 'x'.repeat(129)]) {
    assert.throws(() => parseIdempotencyKey(invalid), (error) => {
      assert.equal(error.code, 'INVALID_IDEMPOTENCY_KEY');
      assert.equal(error.status, 422);
      return true;
    });
  }
  assert.equal(parseIdempotencyKey('x'.repeat(128)).length, 128);
});

test('canonical JSON request hash is deterministic across object key order', () => {
  const first = hashIdempotentRequest({ b: 2, a: { d: 4, c: [3, 2, 1] } });
  const second = hashIdempotentRequest({ a: { c: [3, 2, 1], d: 4 }, b: 2 });
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/u);
  assert.notEqual(first, hashIdempotentRequest({ a: { c: [1, 2, 3], d: 4 }, b: 2 }));
});

test('missing/invalid idempotency, mutation gate, and CSRF fail before command handler', async () => {
  let called = false;
  const handler = async () => { called = true; return {}; };
  const base = { verifySession: async () => canonical, requestId: () => 'request-1' };

  const missing = await withMidaoGuideCommand(request('POST', {}), handler, {
    ...base, validateCsrfRequest: () => null, mutationsEnabled: () => true,
  });
  assert.equal(missing.status, 422);

  const mutationOff = await withMidaoGuideCommand(request('POST', {}, { 'idempotency-key': 'k' }), handler, {
    ...base, validateCsrfRequest: () => null, mutationsEnabled: () => false,
  });
  assert.equal(mutationOff.status, 503);

  const csrf = Response.json({ success: false, error: { code: 'CSRF_REQUIRED', message: 'required' } }, { status: 403 });
  const csrfFailure = await withMidaoGuideCommand(request('POST', {}, { 'idempotency-key': 'k' }), handler, {
    ...base, validateCsrfRequest: () => csrf, mutationsEnabled: () => true,
  });
  assert.equal(csrfFailure.status, 403);
  assert.equal(called, false);
});

test('known route errors map status and unexpected errors are sanitized V2 responses', async () => {
  const known = await withMidaoGuideQuery(request(), async () => {
    throw new MidaoRouteError('NOT_FOUND', 'not found', 404);
  }, { verifySession: async () => canonical, requestId: () => 'r1' });
  assert.deepEqual(await responseJson(known), {
    status: 404,
    body: { success: false, error: { code: 'NOT_FOUND', message: 'not found' } },
  });

  const unexpected = await withMidaoGuideQuery(request(), async () => {
    throw new Error('database password leaked');
  }, { verifySession: async () => canonical, requestId: () => 'r2', reportUnexpected: async () => {} });
  const payload = await responseJson(unexpected);
  assert.equal(payload.status, 500);
  assert.equal(payload.body.success, false);
  assert.equal(payload.body.error.code, 'INTERNAL_ERROR');
  assert.equal(JSON.stringify(payload.body).includes('password'), false);
});
