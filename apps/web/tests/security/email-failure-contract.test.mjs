import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnNodeEsm } from '../helpers/spawn-node.mjs';

const modulePath = new URL('../../src/lib/email.ts', import.meta.url).pathname;

function runCase(mode, env = {}) {
  const script = `
    const email = await import(${JSON.stringify(modulePath)});
    const payload = {
      orderId: 'ord_test_1',
      activityTitle: 'Test Activity',
      contactName: 'Tester',
      contactEmail: 'tester@example.com',
      totalTwd: 1000,
    };

    if (${JSON.stringify(mode)} === 'provider-fail') {
      email.__setEmailClientForTest({
        emails: {
          send: async () => { throw new Error('provider boom'); }
        }
      });
    }

    if (${JSON.stringify(mode)} === 'provider-success') {
      email.__setEmailClientForTest({
        emails: {
          send: async () => ({ data: { id: 'msg_test_1' } })
        }
      });
    }

    const result = await email.sendOrderConfirmation(payload);
    console.log('JSON_RESULT:' + JSON.stringify(result));
  `;

  const result = spawnNodeEsm(script, { env: { ...process.env, ...env } });

  return result;
}

function parseResult(stdout) {
  const line = stdout
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('JSON_RESULT:'));
  if (!line) throw new Error(`missing JSON_RESULT marker in stdout: ${stdout}`);
  return JSON.parse(line.slice('JSON_RESULT:'.length));
}

test('email contract: missing provider config returns non-throw skipped result', () => {
  const run = runCase('no-provider', { RESEND_API_KEY: '' });
  assert.equal(run.status, 0, run.stderr);
  const result = parseResult(run.stdout);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'skipped');
  assert.equal(result.errorCode, 'EMAIL_PROVIDER_NOT_CONFIGURED');
});

test('email contract: provider failure returns structured failed result', () => {
  const run = runCase('provider-fail');
  assert.equal(run.status, 0, run.stderr);
  const result = parseResult(run.stdout);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'EMAIL_SEND_FAILED');
  assert.match(result.errorMessage, /provider boom/);
});

test('email contract: provider success returns sent result', () => {
  const run = runCase('provider-success');
  assert.equal(run.status, 0, run.stderr);
  const result = parseResult(run.stdout);

  assert.equal(result.ok, true);
  assert.equal(result.status, 'sent');
  assert.equal(result.messageId, 'msg_test_1');
});
