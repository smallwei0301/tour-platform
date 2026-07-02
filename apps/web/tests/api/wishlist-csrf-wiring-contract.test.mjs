/**
 * Issue #350 - Wishlist CSRF missing + WishlistToggle not wired + hydration gap
 * RED contract tests (static-analysis, no live DB).
 *
 * AC1 — WishlistToggle.tsx imports/uses csrfHeaders from ../lib/csrf-client on POST and DELETE
 * AC2 — 3 stub button locations replaced with <WishlistToggle .../>
 *        - app/[locale]/activities/ActivitiesContent.tsx — no more tp-fav-btn stub with ❤️
 *        - src/components/home/ActivityCard.tsx — no more tp-fav-btn stub with ♡
 *        - src/components/activity/ActivityBottomBar.tsx — no more local-state-only heart
 * AC3 — /api/me/wishlist/ids/route.ts exists, returns { data: string[] }, empty array for anon
 * AC4 — wiring locations fetch /api/me/wishlist/ids for initialWishlisted
 * AC5 — WishlistToggle redirects to /login when user is NOT logged in
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(full), `File must exist: ${full}`);
  return fs.readFileSync(full, 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ---------------------------------------------------------------------------
// AC1 — WishlistToggle uses csrfHeaders
// ---------------------------------------------------------------------------
describe('AC1: WishlistToggle imports and uses csrfHeaders', () => {
  it('imports csrfHeaders from ../lib/csrf-client', () => {
    const src = readFile('src/components/WishlistToggle.tsx');
    assert.match(
      src,
      /import\s*\{[^}]*csrfHeaders[^}]*\}\s*from\s*['"][^'"]*csrf-client['"]/,
      'Must import csrfHeaders from csrf-client'
    );
  });

  it('uses csrfHeaders() in POST fetch call', () => {
    const src = readFile('src/components/WishlistToggle.tsx');
    assert.match(
      src,
      /csrfHeaders\s*\(\s*\)/,
      'Must call csrfHeaders() in the component'
    );
  });

  it('POST fetch includes Content-Type and csrfHeaders spread', () => {
    const src = readFile('src/components/WishlistToggle.tsx');
    // Should have headers with csrfHeaders spread
    const hasPostWithCsrf = /method:\s*['"]POST['"][\s\S]{0,300}csrfHeaders\s*\(\s*\)/m.test(src)
      || /csrfHeaders\s*\(\s*\)[\s\S]{0,300}method:\s*['"]POST['"]/m.test(src);
    assert.ok(hasPostWithCsrf, 'POST fetch must include csrfHeaders()');
  });

  it('DELETE fetch includes csrfHeaders spread', () => {
    const src = readFile('src/components/WishlistToggle.tsx');
    const hasDeleteWithCsrf = /method:\s*['"]DELETE['"][\s\S]{0,300}csrfHeaders\s*\(\s*\)/m.test(src)
      || /csrfHeaders\s*\(\s*\)[\s\S]{0,300}method:\s*['"]DELETE['"]/m.test(src);
    assert.ok(hasDeleteWithCsrf, 'DELETE fetch must include csrfHeaders()');
  });
});

// ---------------------------------------------------------------------------
// AC2 — 3 stub locations wired
// ---------------------------------------------------------------------------
describe('AC2: ActivitiesContent.tsx — tp-fav-btn stub replaced', () => {
  it('no longer has bare emoji ❤️ in tp-fav-btn button', () => {
    const src = readFile('app/[locale]/activities/ActivitiesContent.tsx') + readFile('app/[locale]/activities/ActivityCard.tsx');
    const hasBareStub = /tp-fav-btn[\s\S]{0,100}❤️/m.test(src)
      || (src.includes('tp-fav-btn') && !src.includes('WishlistToggle'));
    assert.ok(!hasBareStub, 'ActivitiesContent.tsx must not have bare tp-fav-btn stub with ❤️');
  });

  it('renders WishlistToggle component', () => {
    const src = readFile('app/[locale]/activities/ActivitiesContent.tsx') + readFile('app/[locale]/activities/ActivityCard.tsx');
    assert.match(src, /WishlistToggle/, 'ActivitiesContent.tsx must render WishlistToggle');
  });

  it('passes activityId prop to WishlistToggle', () => {
    const src = readFile('app/[locale]/activities/ActivitiesContent.tsx') + readFile('app/[locale]/activities/ActivityCard.tsx');
    assert.match(src, /activityId=\{/, 'WishlistToggle must receive activityId prop');
  });
});

describe('AC2: ActivityCard.tsx — tp-fav-btn stub replaced', () => {
  it('no longer has bare ♡ in tp-fav-btn button', () => {
    const src = readFile('src/components/home/ActivityCard.tsx');
    const hasBareStub = /tp-fav-btn[\s\S]{0,100}♡/m.test(src)
      || (src.includes('tp-fav-btn') && !src.includes('WishlistToggle'));
    assert.ok(!hasBareStub, 'ActivityCard.tsx must not have bare tp-fav-btn stub with ♡');
  });

  it('renders WishlistToggle component', () => {
    const src = readFile('src/components/home/ActivityCard.tsx');
    assert.match(src, /WishlistToggle/, 'ActivityCard.tsx must render WishlistToggle');
  });
});

describe('AC2: ActivityBottomBar.tsx — local-state heart replaced', () => {
  it('no longer has local useState wishlisted-only toggle', () => {
    const src = readFile('src/components/activity/ActivityBottomBar.tsx');
    // Should not have a bare local-state toggle (wishlisted state + emoji buttons without WishlistToggle)
    const hasLocalStateOnly =
      /useState.*false[\s\S]{0,200}wishlisted \? '❤️' : '🤍'/m.test(src) &&
      !src.includes('WishlistToggle');
    assert.ok(!hasLocalStateOnly, 'ActivityBottomBar.tsx must not have local-state-only heart without WishlistToggle');
  });

  it('renders WishlistToggle component', () => {
    const src = readFile('src/components/activity/ActivityBottomBar.tsx');
    assert.match(src, /WishlistToggle/, 'ActivityBottomBar.tsx must render WishlistToggle');
  });
});

// ---------------------------------------------------------------------------
// AC3 — /api/me/wishlist/ids/route.ts exists and returns correct shape
// ---------------------------------------------------------------------------
describe('AC3: /api/me/wishlist/ids/route.ts endpoint', () => {
  it('route file exists', () => {
    assert.ok(
      fileExists('app/api/me/wishlist/ids/route.ts'),
      'app/api/me/wishlist/ids/route.ts must exist'
    );
  });

  it('exports GET function', () => {
    const src = readFile('app/api/me/wishlist/ids/route.ts');
    assert.match(src, /export\s+async\s+function\s+GET/, 'Must export GET handler');
  });

  it('returns { data: string[] } shape', () => {
    const src = readFile('app/api/me/wishlist/ids/route.ts');
    assert.match(src, /\{\s*data:/, 'Must return { data: ... } shape');
  });

  it('returns empty array (not 401) for unauthenticated users', () => {
    const src = readFile('app/api/me/wishlist/ids/route.ts');
    // Must NOT return 401 for unauthenticated — must return { data: [] }
    const has401ForAnon = /if\s*\(!user[\s\S]{0,100}status:\s*401/m.test(src);
    assert.ok(!has401ForAnon, 'Must NOT return 401 for unauthenticated users — return { data: [] } instead');
  });

  it('returns empty array for unauthenticated users', () => {
    const src = readFile('app/api/me/wishlist/ids/route.ts');
    const hasEmptyForAnon = /\[\s*\]/.test(src);
    assert.ok(hasEmptyForAnon, 'Must return empty array for unauthenticated users');
  });

  it('maps wishlists to activity_id strings', () => {
    const src = readFile('app/api/me/wishlist/ids/route.ts');
    const hasMappedIds = /activity_id/.test(src) || /activityId/.test(src);
    assert.ok(hasMappedIds, 'Must return activity IDs from wishlists table');
  });
});

// ---------------------------------------------------------------------------
// AC4 — wiring locations fetch /api/me/wishlist/ids
// ---------------------------------------------------------------------------
describe('AC4: Wiring locations fetch /api/me/wishlist/ids', () => {
  it('ActivitiesContent.tsx fetches /api/me/wishlist/ids', () => {
    const src = readFile('app/[locale]/activities/ActivitiesContent.tsx') + readFile('app/[locale]/activities/ActivityCard.tsx');
    assert.match(src, /\/api\/me\/wishlist\/ids/, 'ActivitiesContent must fetch /api/me/wishlist/ids');
  });

  it('ActivityCard.tsx OR ActivitiesContent.tsx sources initialWishlisted from wishlist/ids', () => {
    const actSrc = readFile('app/[locale]/activities/ActivitiesContent.tsx') + readFile('app/[locale]/activities/ActivityCard.tsx');
    // ActivityCard is a display component — initialWishlisted comes from parent
    // So either ActivitiesContent fetches /ids (verified above) or ActivityCard does
    const actCardSrc = readFile('src/components/home/ActivityCard.tsx');
    const hasIds = /\/api\/me\/wishlist\/ids/.test(actSrc) || /\/api\/me\/wishlist\/ids/.test(actCardSrc);
    assert.ok(hasIds, 'initialWishlisted hydration must reference /api/me/wishlist/ids');
  });

  it('ActivityBottomBar.tsx OR its parent passes initialWishlisted from wishlist/ids', () => {
    const src = readFile('src/components/activity/ActivityBottomBar.tsx');
    // Bottom bar receives initialWishlisted as prop, OR fetches itself
    const hasInitialProp = /initialWishlisted/.test(src);
    assert.ok(hasInitialProp, 'ActivityBottomBar must accept or use initialWishlisted');
  });
});

// ---------------------------------------------------------------------------
// AC5 — WishlistToggle redirects to /login when unauthenticated
// ---------------------------------------------------------------------------
describe('AC5: WishlistToggle redirects to /login when not logged in', () => {
  it('calls router.push("/login") or redirect("/login") when user is not logged in', () => {
    const src = readFile('src/components/WishlistToggle.tsx');
    // 允許帶 ?next= 回導參數的登入導向（template literal 或字串皆可）。
    const hasLoginRedirect = /router\.push\(\s*[`'"]\/login/.test(src)
      || /redirect\(\s*[`'"]\/login/.test(src);
    assert.ok(hasLoginRedirect, 'WishlistToggle must redirect to /login for unauthenticated users');
  });

  it('checks for isLoggedIn or user state before making API calls', () => {
    const src = readFile('src/components/WishlistToggle.tsx');
    const hasAuthCheck = /isLoggedIn/.test(src) || /!user/.test(src) || /user\s*===\s*null/.test(src);
    assert.ok(hasAuthCheck, 'WishlistToggle must check authentication state');
  });
});
