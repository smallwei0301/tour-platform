import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

function child() {
  return Object.assign(new EventEmitter(), { pid: 42, stdout: new PassThrough(), stderr: new PassThrough() });
}
const helper = () => import('../../../../scripts/testing/fixture-child-diagnostics.mjs');

test('counterexample: stream-only collection loses termination and spawn errors', () => {
  const c = child();
  let text = '';
  c.stdout.on('data', b => { text += b; });
  c.stderr.on('data', b => { text += b; });
  c.emit('exit', 7, null);
  c.emit('close', null, 'SIGKILL');
  const error = Object.assign(new Error('spawn missing'), { code: 'ENOENT' });
  assert.throws(() => c.emit('error', error), e => e === error);
  assert.equal(text, '');
});

test('records empty stderr, nonzero exit, signals, and late stderr through close', async () => {
  const { observeFixtureChild } = await helper();
  for (const [code, signal] of [[7, null], [null, 'SIGTERM'], [null, 'SIGKILL']]) {
    const c = child(), records = [];
    const observer = observeFixtureChild(c, { record: r => records.push(r) });
    c.emit('exit', code, signal);
    assert.deepEqual(records.at(-1).exit, { code, signal });
    assert.equal(records.at(-1).stderr.text, '');
    c.stderr.write('late diagnostic');
    c.stderr.end();
    await new Promise(resolve => c.stderr.once('end', resolve));
    c.emit('close', code, signal);
    assert.equal(records.at(-1).stderr.text, 'late diagnostic');
    assert.equal(records.at(-1).stderr.ended, true);
    assert.deepEqual(records.at(-1).close, { code, signal });
    assert.equal(records.at(-1).pid, 42);
    observer.dispose();
  }
});

test('spawn errors are recorded without consuming unhandled error semantics', async () => {
  const { observeFixtureChild } = await helper();
  const c = child(), records = [];
  const observer = observeFixtureChild(c, { record: r => records.push(r) });
  const error = Object.assign(new Error('spawn absent ENOENT'), { code: 'ENOENT' });
  assert.throws(() => c.emit('error', error), e => e === error);
  assert.deepEqual(records.at(-1).error, { name: 'Error', message: 'spawn absent ENOENT', code: 'ENOENT' });
  assert.equal(c.listenerCount('error'), 0);
  observer.dispose();
});

test('output budget bounds retained bytes; snapshots, disposal, and throwing sinks stay passive', async () => {
  const { observeFixtureChild } = await helper();
  const c = child(), records = [];
  const observer = observeFixtureChild(c, { maxBytes: 8, record: r => records.push(r) });
  c.stdout.write('123456');
  const first = records.at(-1);
  c.stderr.write('abcdefghij');
  for (let i = 0; i < 50; i++) c.stdout.write('x'.repeat(1024));
  const last = records.at(-1);
  assert.equal(first.stderr.text, '');
  assert.ok(Buffer.byteLength(last.stdout.text) + Buffer.byteLength(last.stderr.text) <= 8);
  assert.equal(last.stderr.truncated, true);
  assert.equal(last.stdout.truncated, true);
  const count = records.length;
  observer.dispose(); observer.dispose();
  c.emit('exit', 3, null);
  assert.equal(records.length, count);
  assert.equal(c.listenerCount('exit'), 0);
  const broken = observeFixtureChild(c, { record: () => { throw new Error('sink failed'); } });
  assert.doesNotThrow(() => c.stderr.write('still alive'));
  const error = new Error('original');
  assert.throws(() => c.emit('error', error), e => e === error);
  assert.doesNotThrow(() => c.emit('exit', 9, null));
  broken.dispose();
});
