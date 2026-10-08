const MESSAGES = new Set([
  'local build and materializer cleanup failed', 'materialized cleanup failed',
  'materializer creation and run parent cleanup failed', 'materializer failed and cleanup held',
  'local replay and materialized restoration failed', 'expected-terminal local build and cleanup failed',
  'materialized replay must restore before cleanup', 'materialized workdir identity replaced by foreign pathname',
  'materialized CLI metadata cleanup state invalid', 'run parent identity changed',
  'builder CLI arguments invalid',
]);
const CODES = new Set([
  'NODE_TOOLCHAIN_MISMATCH', 'SUPABASE_PIN_MISMATCH', 'EXPECTED_TERMINAL_SIGNALLED',
  'OWNED_CONTAINER_CLEANUP_FAILED', 'OWNED_NETWORK_CLEANUP_FAILED', 'OWNED_VOLUME_CLEANUP_FAILED',
  'REPLAY_RESTORE_FAILED', 'CLI_METADATA_CLEANUP_FAILED', 'DATABASE_WORKDIR_CLEANUP_FAILED',
  'API_COMPAT_PROXY_CLOSE_FAILED', 'API_BRIDGE_CLOSE_FAILED', 'DATABASE_BRIDGE_CLOSE_FAILED', 'RUNNER_LOCK_RELEASE_FAILED',
  'ENOENT', 'EACCES', 'EPERM', 'ENOTEMPTY', 'EBUSY', 'EIO', 'ENOSPC', 'EMFILE', 'ENFILE',
  'EROFS', 'ENOTDIR', 'EISDIR', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT',
  '08000', '08001', '08003', '08004', '08006', '08007', '08P01', '57P01', '57P02', '57P03',
  '28000', '28P01', '42501', '3F000', '42P01', '42703', '57014', '53300', '53400', '53200',
]);
const PREFIXES = ['SUPABASE_START_FAILED', 'SUPABASE_DATABASE_HANDOFF_STOP_FAILED', 'SUPABASE_SERVICE_START_FAILED',
  'STATUS_UNCLASSIFIED', 'STATUS_PROJECT_ID_NOT_NORMALIZED', 'DATABASE_NOT_READY', 'exact migration replay failed',
  'CLI_UNEXPECTED_STDERR'];
const MAX_DEPTH = 4, MAX_NODES = 16;
const own = (value, key) => {
  try { return Object.getOwnPropertyDescriptor(value, key)?.value; } catch { return undefined; }
};
function label(entry) {
  const message = typeof entry === 'string' ? entry : own(entry, 'message');
  if (typeof message === 'string') {
    if (message.length <= 8192 && (MESSAGES.has(message) || CODES.has(message))) return message;
    const prefix = PREFIXES.find(code => message === code || message.startsWith(code + ':'));
    if (prefix) return prefix;
  }
  const code = own(entry, 'code');
  return typeof code === 'string' && CODES.has(code) ? code : '[REDACTED_ERROR]';
}

// No raw messages, stacks, paths, SQL or commands cross this diagnostic boundary.
// Keep the caller's canonical sanitizer as the final step; diagnostic failure is fixed text.
export function formatExpectedTerminalFailure(error, redact) {
  try {
    const lines = [], seen = new Set();
    let truncated = false;
    const visit = (entry, location, depth) => {
      if (lines.length >= MAX_NODES || depth > MAX_DEPTH) { truncated = true; return; }
      const object = entry !== null && (typeof entry === 'object' || typeof entry === 'function');
      if (object && seen.has(entry)) { lines.push(location + ': [CYCLE]'); return; }
      if (object) seen.add(entry);
      lines.push(location + ': ' + label(entry));
      if (!object) return;
      const errors = own(entry, 'errors');
      if (Array.isArray(errors)) {
        const length = own(errors, 'length');
        for (let index = 0; index < Math.min(length, MAX_NODES); index += 1) {
          if (lines.length >= MAX_NODES) { truncated = true; break; }
          visit(own(errors, String(index)), location + '.errors[' + index + ']', depth + 1);
        }
        if (length > MAX_NODES) truncated = true;
      }
      const cause = own(entry, 'cause');
      if (cause !== undefined) visit(cause, location + '.cause', depth + 1);
    };
    visit(error, 'root', 0);
    if (truncated) lines.push('[TRUNCATED]');
    if (typeof redact !== 'function') return 'expected-terminal-failure: diagnostics unavailable';
    const output = redact(lines.join('\n'));
    return typeof output === 'string' && output.length <= 4096
      ? output : 'expected-terminal-failure: diagnostics unavailable';
  } catch { return 'expected-terminal-failure: diagnostics unavailable'; }
}
