/**
 * Contract tests for issue #416: ActivityBottomBar isLoggedIn auth wiring
 *
 * AC1: ActivityBottomBar imports createClient from supabase/client
 * AC2: ActivityBottomBar has isLoggedIn state (useState)
 * AC3: ActivityBottomBar calls supabase.auth.getUser in useEffect
 * AC4: ActivityBottomBar passes isLoggedIn to WishlistToggle
 * AC5: WishlistToggle still has isLoggedIn prop handling (logged-out redirect preserved)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const bottomBarSrc = readFileSync(
  resolve(__dirname, '../../src/components/activity/ActivityBottomBar.tsx'),
  'utf8'
);

const wishlistToggleSrc = readFileSync(
  resolve(__dirname, '../../src/components/WishlistToggle.tsx'),
  'utf8'
);

const csrfClientSrc = readFileSync(
  resolve(__dirname, '../../src/lib/csrf-client.ts'),
  'utf8'
);

// AC1: ActivityBottomBar imports createClient from supabase/client
test('AC1: ActivityBottomBar imports createClient from supabase/client', () => {
  assert.match(
    bottomBarSrc,
    /import.*createClient.*from.*supabase\/client/,
    'ActivityBottomBar must import createClient from supabase/client'
  );
});

// AC2: ActivityBottomBar has isLoggedIn state via useState
test('AC2: ActivityBottomBar has isLoggedIn state via useState', () => {
  assert.match(
    bottomBarSrc,
    /useState\s*\(\s*false\s*\)/,
    'ActivityBottomBar must initialise isLoggedIn state with useState(false)'
  );
  assert.match(
    bottomBarSrc,
    /isLoggedIn/,
    'ActivityBottomBar must declare isLoggedIn state variable'
  );
});

// AC3: ActivityBottomBar calls supabase.auth.getUser in useEffect
test('AC3: ActivityBottomBar calls supabase.auth.getUser in useEffect', () => {
  assert.match(
    bottomBarSrc,
    /auth\.getUser\s*\(\s*\)/,
    'ActivityBottomBar must call supabase.auth.getUser()'
  );
});

// AC4: ActivityBottomBar passes isLoggedIn to WishlistToggle
test('AC4: ActivityBottomBar passes isLoggedIn prop to WishlistToggle', () => {
  assert.match(
    bottomBarSrc,
    /WishlistToggle[^>]*isLoggedIn\s*=\s*\{isLoggedIn\}/,
    'ActivityBottomBar must pass isLoggedIn={isLoggedIn} to WishlistToggle'
  );
});

// AC5: WishlistToggle still guards unauthenticated access with redirect to /login
test('AC5: WishlistToggle still redirects unauthenticated users to /login', () => {
  assert.match(
    wishlistToggleSrc,
    /isLoggedIn\s*=\s*false/,
    'WishlistToggle must still default isLoggedIn to false'
  );
  assert.match(
    wishlistToggleSrc,
    /router\.push\s*\(\s*['"]\/login['"]\s*\)/,
    'WishlistToggle must still redirect to /login when not logged in'
  );
});

// AC6: WishlistToggle primes CSRF token before wishlist mutation requests
test('AC6: WishlistToggle primes CSRF before POST/DELETE wishlist calls', () => {
  assert.match(
    wishlistToggleSrc,
    /import\s*\{[^}]*ensureCsrfToken[^}]*\}\s*from\s*['"][^'"]*csrf-client['"]/,
    'WishlistToggle must import ensureCsrfToken from csrf-client'
  );

  const ensureCallIndex = wishlistToggleSrc.indexOf('await ensureCsrfToken()');
  const postCallIndex = wishlistToggleSrc.indexOf("fetch('/api/me/wishlist'");
  const deleteCallIndex = wishlistToggleSrc.indexOf('fetch(`/api/me/wishlist/${activityId}`');

  assert.ok(ensureCallIndex !== -1, 'WishlistToggle must call await ensureCsrfToken()');
  assert.ok(postCallIndex !== -1, 'WishlistToggle must call POST /api/me/wishlist');
  assert.ok(deleteCallIndex !== -1, 'WishlistToggle must call DELETE /api/me/wishlist/:activityId');
  assert.ok(
    ensureCallIndex < postCallIndex && ensureCallIndex < deleteCallIndex,
    'ensureCsrfToken() must run before wishlist mutation fetch calls'
  );
});

// AC7: csrfHeaders still only appends header when cookie token exists
test('AC7: csrfHeaders keeps existing behavior', () => {
  assert.match(
    csrfClientSrc,
    /export\s+function\s+csrfHeaders\s*\(/,
    'csrfHeaders export must still exist'
  );
  assert.match(
    csrfClientSrc,
    /return\s+token\s*\?\s*\{\s*\.\.\.base,\s*\[CSRF_HEADER_NAME\]:\s*token\s*\}\s*:\s*base/,
    'csrfHeaders should still return base untouched when token is missing'
  );
});
