import { errorMonitor } from 'node:events';

/** Explicit observer only. The caller owns persistence and the child lifecycle.
 * maxBytes is a shared retained-output budget, not an input or log-sink budget.
 * Attaching data listeners consumes readable output in the usual Node manner.
 * @param {import('node:child_process').ChildProcess} child
 * @param {{ record?: (snapshot: any) => void, maxBytes?: number }} [options]
 */
export function observeFixtureChild(child, { record, maxBytes = 16 * 1024 } = {}) {
  if (typeof record !== 'function') throw new TypeError('record must be a function');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('maxBytes must be a nonnegative safe integer');
  const state = {
    pid: child.pid ?? null,
    stdout: { text: '', truncated: false, ended: false, closed: false },
    stderr: { text: '', truncated: false, ended: false, closed: false },
    error: null, exit: null, close: null,
  };
  let remaining = maxBytes;
  let disposed = false;
  const listeners = [];
  const chunks = { stdout: [], stderr: [] };
  const publish = event => {
    if (disposed) return;
    // Fresh nested objects prevent later events or a sink from changing old evidence.
    const snapshot = { ...state, event, stdout: { ...state.stdout }, stderr: { ...state.stderr },
      error: state.error && { ...state.error }, exit: state.exit && { ...state.exit }, close: state.close && { ...state.close } };
    try { record(snapshot); } catch { /* Diagnostics must not replace child errors. */ }
  };
  const on = (emitter, event, listener) => {
    emitter.on(event, listener);
    listeners.push([emitter, event, listener]);
  };
  for (const name of ['stdout', 'stderr']) {
    const stream = child[name];
    if (!stream) continue;
    on(stream, 'data', chunk => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const retained = Math.min(bytes.length, remaining);
      if (retained) {
        chunks[name].push(Buffer.from(bytes.subarray(0, retained)));
        remaining -= retained;
        // Drop an incomplete UTF-8 suffix rather than expanding it to U+FFFD.
        const buffer = Buffer.concat(chunks[name]);
        let text = '', size = 0;
        for (const character of buffer.toString('utf8').replace(/\uFFFD+$/u, '')) {
          const width = Buffer.byteLength(character);
          if (size + width > buffer.length) break;
          text += character; size += width;
        }
        state[name].text = text;
      }
      if (retained < bytes.length) state[name].truncated = true;
      publish(`${name}:data`);
    });
    on(stream, 'end', () => { state[name].ended = true; publish(`${name}:end`); });
    on(stream, 'close', () => { state[name].closed = true; publish(`${name}:close`); });
  }
  on(child, errorMonitor, error => {
    state.error = { name: error.name, message: error.message, code: error.code ?? null };
    publish('error');
  });
  on(child, 'exit', (code, signal) => { state.exit = { code, signal }; publish('exit'); });
  on(child, 'close', (code, signal) => { state.close = { code, signal }; publish('close'); });
  publish('attached');
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [emitter, event, listener] of listeners) emitter.removeListener(event, listener);
      chunks.stdout.length = 0;
      chunks.stderr.length = 0;
    },
  };
}
