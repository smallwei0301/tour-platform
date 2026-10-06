import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real component's event callbacks with deterministic deferred I/O.
// This is a component-contract test, not mounted browser or database evidence.
const source = readFileSync(new URL('../../app/(non-locale)/midao2/services/ServiceForm.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

function harness(mode = 'edit') {
  const state = [];
  let cursor = 0;
  const uploads = [];
  const writes = [];
  const submissions = [];
  let rejectWrite = false;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
  };
  react.default = react;
  const ui = {
    C: {}, Btn: 'Btn', Field: 'Field', Icon: 'Icon',
    async apiSend(path, method, body) {
      writes.push({ path, method, body });
      if (rejectWrite) throw new Error('save failed');
    },
  };
  const module = { exports: {} };
  const require = (name) => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name.includes('csrf-client')) return { csrfHeaders: () => ({}) };
    if (name.includes('client-image-compress')) return { compressImage: async (file) => file };
    if (name === '../ui') return ui;
    throw new Error(`Unexpected import: ${name}`);
  };
  vm.runInNewContext(compiled, {
    exports: module.exports, require,
    FormData: class { append() {} },
    URL: { createObjectURL: (file) => `blob:${file.name}` },
    fetch: (path) => new Promise((resolve, reject) => uploads.push({ path, resolve, reject })),
  });
  const render = () => {
    cursor = 0;
    return module.exports.default({
      mode, initial: { activityId: 'service-1', title: 'Service', durationMinutes: 180, priceTwd: 100, coverImageUrl: 'old-cover' },
      onSubmit: (...args) => submissions.push(args),
    });
  };
  const find = (node, predicate) => {
    if (!node) return null;
    if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
    return predicate(node) ? node : find(node.props?.children, predicate);
  };
  const input = () => find(render(), (node) => node.type === 'input' && node.props.type === 'file');
  const byId = (id) => find(render(), (node) => node.props?.['data-testid'] === id);
  const select = (name, callback = input().props.onChange) => callback({ target: { files: [{ name }] } });
  const succeed = (index, url) => uploads[index].resolve({ json: async () => ({ ok: true, data: { url } }) });
  const preview = () => {
    // Step navigation uses the real button callbacks; form begins valid.
    const next = find(render(), (node) => node.type === 'Btn' && node.props?.['data-testid'] === 'midao2-form-next1');
    if (!next) throw new Error('Missing next-step button');
    next.props.onClick();
    const nextAgain = find(render(), (node) => node.type === 'Btn' && node.props?.['data-testid'] === 'midao2-form-next2');
    nextAgain.props.onClick();
  };
  return { input, byId, select, succeed, preview, uploads, writes, submissions, setRejectWrite: (value) => { rejectWrite = value; } };
}

test('edit cover is single-flight even when the same event callback is invoked before a rerender', async () => {
  const h = harness();
  const callback = h.input().props.onChange;
  h.select('A', callback);
  h.select('B', callback);
  await flush();
  assert.equal(h.uploads.length, 1, 'a concurrent second selection must not upload or PATCH');
  assert.equal(h.input().props.disabled, true);
  h.succeed(0, 'cover-A');
  await flush();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].body.coverImageUrl, 'cover-A');
  assert.equal(Boolean(h.input().props.disabled), false);
  h.select('B'); await flush(); h.succeed(1, 'cover-B'); await flush();
  assert.equal(h.writes.at(-1).body.coverImageUrl, 'cover-B', 'a later allowed selection wins');
});

test('upload failure releases the synchronous lock and allows a retry', async () => {
  const h = harness();
  h.select('A'); await flush(); h.uploads[0].reject(new Error('upload failed')); await flush();
  assert.equal(h.writes.length, 0);
  assert.equal(Boolean(h.input().props.disabled), false);
  h.select('B'); await flush(); h.succeed(1, 'cover-B'); await flush();
  assert.equal(h.writes.length, 1);
});

test('cover PATCH failure releases the lock and allows a new upload', async () => {
  const h = harness(); h.setRejectWrite(true);
  h.select('A'); await flush(); h.succeed(0, 'cover-A'); await flush();
  assert.equal(Boolean(h.input().props.disabled), false);
  h.setRejectWrite(false); h.select('B'); await flush(); h.succeed(1, 'cover-B'); await flush();
  assert.equal(h.writes.at(-1).body.coverImageUrl, 'cover-B');
});

test('edit save stays blocked while cover upload is pending, then uses the saved cover', async () => {
  const h = harness(); h.select('A'); await flush(); h.preview();
  const save = h.byId('midao2-form-save-edit');
  assert.equal(save.props.disabled, true);
  save.props.onClick();
  assert.equal(h.submissions.length, 0, 'callback must fail closed even if invoked despite disabled UI');
  h.succeed(0, 'cover-A'); await flush();
  const ready = h.byId('midao2-form-save-edit');
  assert.equal(Boolean(ready.props.disabled), false); ready.props.onClick();
  assert.equal(h.submissions[0][0].coverImageUrl, 'cover-A');
});

test('create cover selection remains local and preserves the final selected file', async () => {
  const h = harness('create'); h.select('A'); h.select('B'); await flush(); h.preview();
  assert.equal(h.uploads.length, 0); assert.equal(h.writes.length, 0);
  h.byId('midao2-form-save-draft').props.onClick();
  assert.equal(h.submissions[0][1], false);
  assert.equal(h.submissions[0][2].name, 'B');
});
