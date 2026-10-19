// Executes exact component handlers and layout lifecycle with deferred canvas callbacks.
// This is a callback seam, not React rendering or browser/upload acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../src/components/ImageCropModal.tsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  function handleConfirm() {'), source.indexOf('\n\n  return ('));
const layout = source.match(/useLayoutEffect\(\(\) => \{([\s\S]*?)\n  \}, \[file, viewW, viewH\]\);/)[1];
const cancel = source.match(/const handleCancel = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[onCancel\]\);/)[1];
function fixture(options = {}) {
  const queue = [], confirmations = [], errors = [], states = [];
  const c = {
    img: {}, encodeRef: { current: { generation: 0, disposed: true, inFlight: false } },
    offsetRef: { current: { x: 0, y: 0 } }, scale: 1, viewW: 300, viewH: 300,
    outputWidth: 400, outputHeight: 400, sourceRect: () => ({ sx: 0, sy: 0, sw: 300, sh: 300 }),
    document: { createElement: () => ({ getContext: () => options.noContext ? null : { drawImage() { if (options.drawThrows) throw Error('draw'); } }, toBlob(cb) { if (options.encodeThrows) throw Error('encode'); queue.push(cb); } }) },
    File: class { constructor(parts, name, options) { Object.assign(this, { parts, name, type: options.type }); } },
    setImg: x => states.push(x), setLoadError: x => { if (x) errors.push(x); },
    onConfirm: x => confirmations.push(x), onCancel() { c.cancelObservedDisposed = c.encodeRef.current.disposed; },
  };
  vm.createContext(c);
  vm.runInContext(`this.setup = () => {${layout}}; this.cancel = () => {${cancel}}; ${handler}; this.confirm = handleConfirm;`, c);
  const cleanup = c.setup();
  return { c, queue, confirmations, errors, states, cleanup };
}
test('normal result emits one WebP only after deferred encoding; repeated confirm remains closed', () => {
  const f = fixture(); f.c.confirm(); assert.equal(f.confirmations.length, 0);
  f.queue[0]({}); f.c.confirm(); assert.equal(f.queue.length, 1);
  assert.equal(f.confirmations.length, 1); assert.equal(f.confirmations[0].type, 'image/webp');
});
test('repeat confirmation queues exactly one encode and callback', () => {
  const f = fixture(); f.c.confirm(); f.c.confirm(); assert.equal(f.queue.length, 1);
  f.queue[0]({}); assert.equal(f.confirmations.length, 1);
});
for (const blob of [null, {}]) for (const action of ['cancel', 'unmount', 'replace']) {
  test(`${action} invalidates deferred ${blob === null ? 'failure' : 'success'} without stale state`, () => {
    const f = fixture(); f.c.confirm(); const cb = f.queue[0];
    if (action === 'cancel') { f.c.cancel(); assert.equal(f.c.cancelObservedDisposed, true); }
    else { f.cleanup(); if (action === 'replace') f.c.setup(); }
    const states = f.states.length; cb(blob);
    assert.equal(f.confirmations.length, 0); assert.equal(f.errors.length, 0); assert.equal(f.states.length, states);
    if (action === 'replace') { f.c.confirm(); assert.equal(f.queue.length, 2); f.queue[1]({}); assert.equal(f.confirmations.length, 1); }
  });
}
test('null blob reports failure and releases the flight for retry', () => {
  const f = fixture(); f.c.confirm(); f.queue[0](null);
  assert.equal(f.confirmations.length, 0); assert.equal(f.errors.length, 1);
  f.c.confirm(); assert.equal(f.queue.length, 2); f.queue[1]({}); assert.equal(f.confirmations.length, 1);
});
for (const option of ['noContext', 'drawThrows', 'encodeThrows']) test(`${option} safely releases flight`, () => {
  const f = fixture({ [option]: true }); f.c.confirm(); assert.equal(f.errors.length, 1);
  assert.equal(f.c.encodeRef.current.inFlight, false); assert.equal(f.confirmations.length, 0);
});
