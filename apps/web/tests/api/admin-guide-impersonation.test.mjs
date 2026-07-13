/**
 * 管理員代入導遊後台（讓管理員可直接進入導遊後台）契約測試。
 *
 * 需求：admin 在導遊詳情頁按「進入導遊後台」→ 系統為該導遊簽發合法 guide session
 * cookie，admin 取得後即可進入 /guide/**。安全邊界靠 middleware（admin 授權 + CSRF）
 * 與 route 內的「僅代入 approved 正式導遊」把關。
 *
 * 採 source-inspection（與 repo 既有 route 契約測試一致；route 為 .ts，node --test 不
 * 直接載入），鎖住安全關鍵行為避免日後回歸。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ROUTE = join(REPO_ROOT, 'app/api/v2/admin/guides/[guideId]/impersonate/route.ts');
const ADMIN_PAGE = join(REPO_ROOT, 'app/admin/guides/[guideId]/page.tsx');
const GUIDE_LAYOUT = join(REPO_ROOT, 'app/guide/layout.tsx');
const MIDDLEWARE = join(REPO_ROOT, 'middleware.ts');

// ---------- 代入 route ----------

test('代入 route：位於 /api/v2/admin/** 以沿用 middleware 的 admin 授權 + CSRF', () => {
  // 路徑本身即安全邊界；不得改成公開/非 admin 路徑。
  assert.ok(ROUTE.includes('/api/v2/admin/guides/'), 'route 必須落在 admin realm 之下');
});

test('代入 route：先驗證 guideId 為 UUID，否則 422', () => {
  const src = readFileSync(ROUTE, 'utf8');
  assert.match(src, /UUID_REGEX/, 'route 必須驗證 guideId 格式');
  assert.match(src, /jsonError\('VALIDATION_ERROR'[^;]*422\)/, '非法 guideId 需以 jsonError 回 422');
});

test('代入 route：讀取目標導遊的 guide_session_version 以簽發正確 session', () => {
  const src = readFileSync(ROUTE, 'utf8');
  assert.match(src, /from\(\s*['"]guide_profiles['"]\s*\)/, '需查 guide_profiles');
  assert.match(src, /guide_session_version/, '需帶入該導遊當前 session-version');
});

test('代入 route：僅允許代入 approved 的正式導遊，否則拒絕', () => {
  const src = readFileSync(ROUTE, 'utf8');
  assert.match(src, /verification_status\s*!==\s*['"]approved['"]/, '需擋非 approved 導遊');
  assert.match(src, /GUIDE_NOT_ACTIVE/, '非 approved 需回明確錯誤碼');
});

test('代入 route：以 createGuideSessionCookies 簽發合法 guide session cookie', () => {
  const src = readFileSync(ROUTE, 'utf8');
  assert.match(src, /import\s*\{[^}]*createGuideSessionCookies[^}]*\}/, '需重用既有 guide session 簽章工具');
  assert.match(src, /createGuideSessionCookies\(/, '需實際呼叫簽發 cookie');
  assert.match(src, /set-cookie/, '需回寫 Set-Cookie');
});

test('代入 route：成功／錯誤回應一律走 api-response helper（#1614 ratchet）', () => {
  const src = readFileSync(ROUTE, 'utf8');
  assert.match(src, /import\s*\{[^}]*jsonOk[^}]*jsonError[^}]*\}\s*from\s*['"][^'"]*api-response['"]/, '需改用 jsonOk/jsonError');
  assert.doesNotMatch(src, /(?:^|[^A-Za-z])(?:Response|NextResponse)\.json\(/, 'v2 route 不得手刻 Response.json');
});

test('代入 route：不直讀 process.env（env 一律經 src/config，架構 ratchet）', () => {
  const src = readFileSync(ROUTE, 'utf8');
  assert.doesNotMatch(src, /process\.env/, 'route 不得直讀 process.env（連註解字串都會被 guard 計入）');
});

test('代入 route：catch 例外接事故上報 handleRouteError（#1598 coverage）', () => {
  const src = readFileSync(ROUTE, 'utf8');
  assert.match(src, /handleRouteError|reportRouteError/, 'v2 route 需接事故上報');
});

test('代入 route：下發 guide_impersonation 標記 cookie 供後台顯示橫幅', () => {
  const src = readFileSync(ROUTE, 'utf8');
  assert.match(src, /guide_impersonation/, '需設定代入標記 cookie');
});

test('代入 route：找不到導遊回 404', () => {
  const src = readFileSync(ROUTE, 'utf8');
  assert.match(src, /jsonError\('NOT_FOUND'[^;]*404\)/, '查無導遊需以 jsonError 回 404');
});

// ---------- middleware 仍守門 /api/v2/admin ----------

test('middleware 仍對 /api/v2/admin 施加 admin 授權與 CSRF（未被弱化）', () => {
  const src = readFileSync(MIDDLEWARE, 'utf8');
  assert.match(src, /pathname\.startsWith\('\/api\/v2\/admin'\)/, 'middleware 需守 /api/v2/admin admin 授權');
  assert.match(src, /pathname\.startsWith\('\/api\/v2\/admin\/'\)/, 'middleware CSRF 需覆蓋 /api/v2/admin/');
});

// ---------- admin 詳情頁入口 ----------

test('admin 詳情頁：提供「進入導遊後台」按鈕，且僅對 approved 正式導遊顯示', () => {
  const src = readFileSync(ADMIN_PAGE, 'utf8');
  assert.match(src, /admin-enter-guide-backend/, '需有進入導遊後台按鈕');
  assert.match(src, /canImpersonate/, '需以條件控制顯示');
  assert.match(src, /verification_status\s*===\s*['"]approved['"]/, '僅 approved 導遊可代入');
  assert.match(src, /kind\s*!==\s*['"]application['"]/, '申請中實體不可代入');
});

test('admin 詳情頁：以 CSRF header POST 至代入 API 後導向導遊後台', () => {
  const src = readFileSync(ADMIN_PAGE, 'utf8');
  assert.match(src, /\/api\/v2\/admin\/guides\/\$\{guide\.id\}\/impersonate/, '需打代入 API');
  assert.match(src, /csrfHeaders\(\)/, 'v2 admin POST 需手動帶 CSRF header');
  assert.match(src, /\/guide\/dashboard/, '成功後導向導遊後台');
});

test('admin 詳情頁：以 V2 envelope（json.success）判斷代入結果，不得誤用 v1 的 json.ok', () => {
  // 回歸鎖（2026-07-13）：代入 API 走 jsonOk → { success: true, data }；先前前端檢查
  // json?.ok 導致成功也顯示「進入導遊後台失敗」且不導頁。
  const src = readFileSync(ADMIN_PAGE, 'utf8');
  const fnBody = src.slice(
    src.indexOf('async function handleEnterGuideBackend'),
    src.indexOf('window.location.href')
  );
  assert.ok(fnBody.length > 0, '需存在 handleEnterGuideBackend 且成功後導頁');
  assert.match(fnBody, /json\?\.success\s*!==\s*true/, '需以 V2 envelope 的 success 欄位判斷');
  assert.doesNotMatch(fnBody, /json\?\.ok/, '不得用 v1 envelope 的 ok 欄位判斷代入結果');
});

// ---------- 導遊後台代入橫幅 ----------

test('導遊後台 layout：偵測代入 cookie 顯示橫幅並提供結束代入', () => {
  const src = readFileSync(GUIDE_LAYOUT, 'utf8');
  assert.match(src, /guide_impersonation/, '需偵測代入標記 cookie');
  assert.match(src, /guide-impersonation-banner/, '需顯示代入橫幅');
  assert.match(src, /handleEndImpersonation/, '需提供結束代入處理');
  assert.match(src, /\/guide\/auth\/session/, '結束代入需登出導遊 session');
  assert.match(src, /\/admin\/guides/, '結束後導回管理後台');
});
