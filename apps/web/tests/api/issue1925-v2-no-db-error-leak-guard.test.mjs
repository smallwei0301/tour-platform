/**
 * #1925：app/api/v2/**​/route.ts 不得把 DB／外部服務的 error.message 放進 client 回應（source guard）。
 *
 * 延續 #1917（guide 端 4 處）：本守門掃描所有 v2 route，以「去掉註解與一般字串內容後的原始碼」比對兩類洩漏樣式：
 *   A. 回應 sink（fail／errorV2／jsonError／jsonErrorWithExtras／Response.json／NextResponse.json）
 *      的參數內直接出現 `<err>.message`／`<err>?.message`／`(x as Error).message`／`.errorMessage`
 *      （含 `{ ok: false, error: e.message }` 與 `fail('X', error.message || '…')` 這類帶 fallback 的寫法）。
 *   B. 別名：`const message = err instanceof Error ? err.message : …`（之後必然被放進回應）。
 *
 * 正確寫法：回應文案用 `pickSafeMessage(err, 白名單, 通用文案)`（src/lib/route-error.ts），
 * 只需內部分類（如 includes('not found')）時用 `getErrorText(err)`，原始錯誤交給 reportRouteError／handleRouteError。
 *
 * 允許清單：key = 相對 app/api/v2 的 route 路徑，value = 理由。只能縮不能增——新增 route 若真有 `.message`
 * 洩漏，請修實作，不要加進允許清單。
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V2_DIR = path.resolve(__dirname, '../..', 'app/api/v2');

const ALLOWLIST = {
  'guide/midao/availability/defaults/route.ts':
    'err.message 來自我方 range 驗證（normalize／segmentsToCanonicalRanges）與 MidaoCanonicalAvailabilityError（code/message/status 皆我方定義）；其餘例外走 handleRouteError',
  'guide/midao/availability/days/[date]/route.ts':
    '同 defaults：toCanonicalRanges 驗證訊息與 MidaoCanonicalAvailabilityError 為我方定義；其餘例外走 handleRouteError',
  'admin/activities/[activityId]/commands/restore-publication/route.ts':
    'jsonError(error.code, error.message) 僅在 error instanceof MidaoRouteError（我方定義的 code/message/status）時使用；其餘例外走 reportRouteError＋通用文案',
  'me/midao/request-claims/bridge/route.ts':
    'envelope.error.message 來自 unavailableMidaoRequestClaimEnvelope() 的靜態文案，非例外字串',
  'bookings/draft/route.ts':
    'validation.error.message 為 validateBookingDraftInput 回傳的我方驗證文案（非 DB／例外字串）',
};

const SINK_RE = /\b(?:jsonErrorWithExtras|jsonError|errorV2|fail|(?:Next)?Response\.json|new Response)\s*\(/g;
const ERRISH_MESSAGE_RE =
  /(?:\b\w*[eE]rr\w*|\be)\??\.message\b|\(\s*\w+\s+as\s+Error\s*\)\??\.message\b|\??\.errorMessage\b/;
const ALIAS_RE = /=\s*(?:\w*[eE]rr\w*|e)\s+instanceof\s+Error\s*\?\s*[\w.]+\.message\b/;

/** 去掉註解，並把 '…'／"…" 字串內容遮成空白（保留模板字串，因為 `${err.message}` 也算洩漏）。 */
export function stripForScan(source) {
  return source.replace(
    /("(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*')|(`(?:\\[\s\S]|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (match, dq, tpl) => {
      if (tpl) return tpl;
      if (dq) return match[0] + ' '.repeat(match.length - 2) + match[0];
      return match.replace(/[^\n]/g, ' ');
    },
  );
}

export function findLeaks(source) {
  const code = stripForScan(source);
  const leaks = [];
  for (const m of code.matchAll(SINK_RE)) {
    const rest = code.slice(m.index);
    const end = rest.indexOf(';');
    const stmt = end === -1 ? rest : rest.slice(0, end);
    if (ERRISH_MESSAGE_RE.test(stmt)) leaks.push({ kind: 'sink', snippet: stmt.replace(/\s+/g, ' ').slice(0, 140) });
  }
  const alias = code.match(ALIAS_RE);
  if (alias) leaks.push({ kind: 'alias', snippet: alias[0] });
  return leaks;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

const routes = walk(V2_DIR).map((full) => ({
  rel: path.relative(V2_DIR, full).split(path.sep).join('/'),
  full,
}));

test('#1925：v2 route 不得把 error.message 放進 client 回應（允許清單除外）', () => {
  assert.ok(routes.length > 50, `應掃到全部 v2 route，實際 ${routes.length}`);
  const offenders = [];
  for (const { rel, full } of routes) {
    if (Object.hasOwn(ALLOWLIST, rel)) continue;
    const leaks = findLeaks(readFileSync(full, 'utf8'));
    for (const leak of leaks) offenders.push(`${rel} [${leak.kind}] ${leak.snippet}`);
  }
  assert.deepEqual(offenders, [], `以下 route 仍外洩 error.message：\n${offenders.join('\n')}`);
});

test('#1925：允許清單內的每個檔案都存在，且每一項都有理由', () => {
  for (const [rel, reason] of Object.entries(ALLOWLIST)) {
    assert.ok(existsSync(path.join(V2_DIR, rel)), `允許清單檔案不存在：${rel}`);
    assert.ok(typeof reason === 'string' && reason.length >= 10, `${rel} 缺理由`);
  }
});

test('#1925：允許清單只能縮不能增（上限 5 項）', () => {
  assert.ok(Object.keys(ALLOWLIST).length <= 5, '允許清單不得新增；請修實作而不是加白名單');
});

test('#1925：允許清單內每個檔案確實仍命中偵測（失效的項目要移除）', () => {
  for (const rel of Object.keys(ALLOWLIST)) {
    const leaks = findLeaks(readFileSync(path.join(V2_DIR, rel), 'utf8'));
    assert.ok(leaks.length > 0, `${rel} 已不再命中，請自允許清單移除`);
  }
});

test('偵測器自檢：#1917 修掉的四種舊寫法（fail(…, error.message)）都會被抓到', () => {
  const samples = [
    "if (error) return Response.json(fail('SERVER_ERROR', error.message), { status: 500 });",
    "return Response.json(fail('SERVER_ERROR', reportsError.message), { status: 500 });",
    "return Response.json(fail('SERVER_ERROR', insertError.message), { status: 500 });",
    "if (error) {\n  return Response.json(\n    fail('SERVER_ERROR', error.message),\n    { status: 500 },\n  );\n}",
  ];
  for (const s of samples) assert.ok(findLeaks(s).length > 0, `應被偵測：${s}`);
});

test('偵測器自檢：其他洩漏形態都會被抓到', () => {
  const samples = [
    "return Response.json(errorV2('DB_ERROR', orderError.message), { status: 500 });",
    "return NextResponse.json({ ok: false, error: e.message }, { status: 500 });",
    "return Response.json(errorV2('INTERNAL_ERROR', insertError.message || 'Failed'), { status: 500 });",
    "const message = err instanceof Error ? err.message : 'unknown error';\nreturn Response.json(fail('X', message));",
    "return jsonError('INVALID_REQUEST', (err as Error)?.message || 'x', 422);",
    "return NextResponse.json(errorV2(result.errorCode ?? 'E', result.errorMessage ?? 'x'), { status: 500 });",
    'return Response.json(fail("X", `failed: ${err.message}`));',
  ];
  for (const s of samples) assert.ok(findLeaks(s).length > 0, `應被偵測：${s}`);
});

test('偵測器自檢：安全寫法與註解／字串內容不會誤報', () => {
  const samples = [
    "await reportRouteError(new Error(error.message), { route: 'x' });\nreturn Response.json(fail('SERVER_ERROR', '伺服器發生錯誤，請稍後再試'), { status: 500 });",
    "// return Response.json(fail('X', error.message));\nreturn Response.json(ok(1));",
    "return Response.json(fail('X', 'error.message 不外洩'));",
    "return Response.json(fail('X', pickSafeMessage(err, ORDER_DOMAIN_ERROR_PATTERNS)), { status: 400 });",
    "console.warn('Audit log insert failed (non-fatal):', auditError.message);\nreturn Response.json(ok(1));",
    "return jsonError(parts.code, parts.message, parts.status);",
  ];
  for (const s of samples) assert.deepEqual(findLeaks(s), [], `不應誤報：${s}`);
});
