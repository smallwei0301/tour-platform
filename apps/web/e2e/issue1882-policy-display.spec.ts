import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { isExpectedAbortedDevDiagnostic } from '../../../scripts/testing/policy-fixture-network.mjs';
import { observeFixtureChild } from '../../../scripts/testing/fixture-child-diagnostics.mjs';
import { mkdtemp, writeFile, rm, cp, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const origin = 'http://127.0.0.1:3108';
const path = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';
const clock = new Date('2026-04-07T04:00:00Z');
// Same narrow selector clock and network guard as the verified local fixture.
const guard = "import net from 'node:net';\nconst instant=Date.parse('2026-04-07T04:00:00Z'),realNow=Date.now.bind(Date);let logged=false;\nDate.now=function(){if(new Error().stack.includes('selectUpcomingSchedules')){if(!logged){console.log('[fixture-selector-clock]',JSON.stringify({pid:process.pid,now:instant,iso:new Date(instant).toISOString()}));logged=true;}return instant;}return realNow();};\nconsole.log('[fixture-preload]',JSON.stringify({pid:process.pid,envNames:Object.keys(process.env).sort()}));\nconst allowed=(host,port)=>['127.0.0.1','localhost','::1','[::1]'].includes(host)&&Number(port)===3108;\nconst connect=net.Socket.prototype.connect;\nconst normalizedTag=Object.getOwnPropertySymbols(net._normalizeArgs([])).find(symbol=>symbol.description==='normalizedArgs');\nnet.Socket.prototype.connect=function(...args){const first=args[0];const normalized=Array.isArray(first)&&normalizedTag&&first[normalizedTag]?first:net._normalizeArgs(args);const options=normalized[0];if(options.path||!allowed(options.host||'localhost',options.port)){console.error('[blocked-server-network]',JSON.stringify({host:options.host||'localhost',port:options.port}));throw new Error('Fixture server network blocked');}return connect.apply(this,args);};\nconst fetchOriginal=globalThis.fetch;\nglobalThis.fetch=function(input,...args){const u=new URL(typeof input==='string'?input:input.url||String(input));const method=String(args[0]?.method??(input instanceof Request?input.method:'GET')).toUpperCase();if(!['http:','https:'].includes(u.protocol)||!allowed(u.hostname,u.port)||!['GET','HEAD'].includes(method)){console.error('[blocked-server-fetch]',u.origin);return Promise.reject(new Error('Fixture server fetch blocked'));}return fetchOriginal(input,...args);};\n";
let fixtureRoot = '';
let server: ChildProcess | undefined, temporary = '', serverLog = '';
let observer: ReturnType<typeof observeFixtureChild> | undefined, disposeObserver: (() => void) | undefined;
let exitObserved = false, closeObserved = false;
let persistCleanupTimeout: (() => void) | undefined;
test.use({ baseURL: origin, timezoneId: 'Asia/Taipei', locale: 'zh-TW', serviceWorkers: 'block' });
test.setTimeout(120_000);
test.beforeAll(async () => {
  expect(process.env.PLAYWRIGHT_NO_WEBSERVER).toBe('1');
  expect(process.versions.node.split('.')[0]).toBe('22');
  temporary = await mkdtemp(join(tmpdir(), 'issue1882-'));
  // Copy the real app unchanged; only its existing in-memory fixture data gets A0/B7/null.
  // No test route or component reimplementation: real activity page, context, modal and CTA.
  fixtureRoot = join(temporary, 'source');
  const originalRoot = resolve('../..');
  const fixtureApp = join(fixtureRoot, 'apps/web');
  await cp(process.cwd(), fixtureApp, { recursive: true, filter: source => !/(?:^|\/)(?:node_modules|\.next|\.env[^/]*|test-results|playwright-report|e2e)(?:\/|$)/.test(source) });
  await cp(join(originalRoot, 'package.json'), join(fixtureRoot, 'package.json'));
  await cp(join(originalRoot, 'scripts'), join(fixtureRoot, 'scripts'), { recursive: true });
  await symlink(join(originalRoot, 'node_modules'), join(fixtureRoot, 'node_modules'), 'dir');
  await symlink(join(originalRoot, 'apps/web/node_modules'), join(fixtureApp, 'node_modules'), 'dir');
  const dataFile = join(fixtureApp, 'src/fixtures/data.ts');
  expect((await readFile(dataFile, 'utf8')).match(/slug: 'kaohsiung-chaishan-cave-experience'/g)).toHaveLength(1);
  await writeFile(dataFile, (await readFile(dataFile, 'utf8')) + `
const policyFixture = activities.find(a => a.slug === 'kaohsiung-chaishan-cave-experience')!;
const policyPlans = policyFixture.plans as any[];
if (policyPlans.length !== 2 || policyPlans[0].id !== 'chaishan-cave-half-day' || policyPlans[1].id !== 'chaishan-cave-private') throw new Error('Policy fixture data contract drift');
policyPlans[0].confirmByDays = 0;
policyPlans[1].confirmByDays = 7;
policyPlans.push({ ...policyPlans[0], id: 'policy-null', label: '未配置確認時間', confirmByDays: null });
`);
  const preload = join(temporary, 'guard.mjs');
  await writeFile(preload, guard);
  server = spawn(process.execPath, [resolve('../../node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3108'], {
    cwd: fixtureApp, env: { PATH: `${resolve(process.execPath, '..')}:/usr/bin:/bin`, NODE_ENV: 'development', PORT: '3108', TZ: 'Asia/Taipei', NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: `--import=${preload}`, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'playwright-local-anon' },
  });
  // Fixed-size summary persists on every event, including failures before afterAll.
  // Separate stderr tail remains available even when stdout uses the observer budget.
  let stderrTail = Buffer.alloc(0);
  const diagnostics: Record<string, unknown> = {};
  const captureStderr = (chunk: Buffer | string) => {
    stderrTail = Buffer.concat([stderrTail, Buffer.from(chunk).subarray(-2048)]).subarray(-2048);
  };
  server.stderr?.on('data', captureStderr);
  let latest: Record<string, unknown> | undefined;
  persistCleanupTimeout = () => {
    diagnostics.cleanupTimeout = { ...latest, event: 'cleanup-timeout' };
    writeFileSync('/tmp/tour-1882-policy-display-child.json', JSON.stringify(diagnostics));
  };
  observer = observeFixtureChild(server, { maxBytes: 2048, record(snapshot: any) {
    if (snapshot.exit || (snapshot.error && snapshot.pid == null)) exitObserved = true;
    if (snapshot.close) closeObserved = true;
    const bounded = { ...snapshot, stdout: { ...snapshot.stdout, text: snapshot.stdout.text.slice(-2048) },
      stderr: { ...snapshot.stderr, text: stderrTail.toString('utf8') },
      error: snapshot.error && { ...snapshot.error, message: snapshot.error.message.slice(0, 2048), name: snapshot.error.name.slice(0, 128), code: String(snapshot.error.code ?? '').slice(0, 128) || null } };
    latest = bounded;
    const key = ['attached', 'error', 'exit', 'close'].includes(snapshot.event) ? snapshot.event : 'streams';
    if (key !== 'error' || !diagnostics.error) diagnostics[key] = bounded;
    writeFileSync('/tmp/tour-1882-policy-display-child.json', JSON.stringify(diagnostics));
  } });
  disposeObserver = () => { observer?.dispose(); server?.stderr?.removeListener('data', captureStderr); };
  server.stdout?.on('data', chunk => { serverLog += chunk.toString(); });
  server.stderr?.on('data', chunk => { serverLog += chunk.toString(); });
  await expect.poll(async () => {
    if (exitObserved || closeObserved || server?.signalCode != null || server?.exitCode !== null) throw new Error(`Fixture server exited: ${serverLog}`);
    try { return (await fetch(`${origin}/images/placeholder-avatar.svg`)).status; } catch { return 0; }
  }, { timeout: 60_000 }).toBe(200);
});
test.afterAll(async () => {
  try {
    await writeFile('/tmp/tour-1882-policy-display-server.log', serverLog);
  } finally {
    try {
      if (server && !closeObserved) {
        const child = server;
        await new Promise<void>((done, reject) => {
          const alive = () => !exitObserved && child.exitCode === null && child.signalCode === null;
          const release = () => {
            clearTimeout(force); clearTimeout(limit);
            child.removeListener('exit', onExit); child.removeListener('close', onClose);
          };
          const onExit = () => { clearTimeout(force); };
          const onClose = () => { release(); done(); };
          const force = setTimeout(() => { if (alive()) child.kill('SIGKILL'); }, 5_000);
          const limit = setTimeout(() => {
            release();
            let persistenceError: unknown;
            try { persistCleanupTimeout?.(); }
            catch (error) { persistenceError = error; }
            finally { reject(new Error('Owned fixture child did not close', { cause: persistenceError })); }
          }, 10_000);
          child.once('exit', onExit);
          child.once('close', onClose);
          if (alive()) child.kill('SIGTERM');
        });
      }
    } finally {
      try { if (temporary) await rm(temporary, { recursive: true }); }
      finally { disposeObserver?.(); }
    }
  }
});
async function fixture(page: Page, schedules: object[] = [], browserClock = clock, availabilityGate?: Promise<void>) {
  const diagnostics: { console: object[]; pageErrors: string[]; blocked: object[]; expectedAbortedDevDiagnostics: { url: string; method: string }[]; mocks: string[] } = { console: [], pageErrors: [], blocked: [], expectedAbortedDevDiagnostics: [], mocks: [] };
  page.on('console', msg => diagnostics.console.push({ type: msg.type(), text: msg.text(), url: msg.location().url }));
  page.on('pageerror', error => diagnostics.pageErrors.push(String(error)));
  await page.context().route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (!['GET', 'HEAD'].includes(req.method())) {
      if (isExpectedAbortedDevDiagnostic(req.url(), req.method())) {
        diagnostics.expectedAbortedDevDiagnostics.push({ url: req.url(), method: req.method() });
        return route.abort(); // Classification never permits the POST to reach the server.
      }
      diagnostics.blocked.push({ url: req.url(), method: req.method() }); return route.abort();
    }
    // Exact known, read-only browser assets are fulfilled locally, never continued outbound.
    const scripts = [
      'https://www.googletagmanager.com/gtag/js?id=G-26EYTQJ9RC',
      'https://va.vercel-scripts.com/v1/script.debug.js',
      'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js',
    ];
    if (scripts.includes(req.url())) return route.fulfill({ contentType: 'application/javascript', body: '' });
    const images = [
      'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80',
      'https://images.unsplash.com/photo-1551632811-561732d1e306?w=600&q=70',
      'https://images.unsplash.com/photo-1504858700536-882c978a3464?w=600&q=70',
    ];
    if (images.includes(req.url())) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') });
    if (url.origin === 'http://127.0.0.1:54321' && url.pathname.startsWith('/auth/v1/')) return route.fulfill({ status: 401, json: { message: 'no fixture session' } });
    if (url.origin !== origin) { diagnostics.blocked.push({ url: req.url(), method: req.method() }); return route.abort(); }
    if (url.pathname.startsWith('/booking/') && url.origin === origin) {
      diagnostics.mocks.push(req.url());
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><h1>Safe local booking GET fixture</h1></body></html>' });
    }
    if (url.pathname === '/_next/image') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') });
    if (url.pathname === '/api/me/wishlist/ids') return route.fulfill({ json: { ok: true, data: { ids: [] } } });
    if (url.pathname === '/api/activities' || url.pathname === '/api/v2/promo-codes/public' || (url.pathname === '/api/qa' && url.search === '?activityId=kaohsiung-chaishan-cave-experience')) return route.fulfill({ json: { ok: true, data: [] } });
    if (url.pathname === '/api/activities/kaohsiung-chaishan-cave-experience/availability') { diagnostics.mocks.push(req.url()); await availabilityGate; return route.fulfill({ json: { ok: true, data: { schedules, source: 'v2' } } }); }
    if (url.pathname.startsWith('/api/')) { diagnostics.blocked.push({ url: req.url(), reason: 'unneeded-api' }); return route.abort(); }
    return route.continue();
  });
  await page.clock.setFixedTime(browserClock);
  const response = await page.goto(path, { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  const html = await response!.text();
  await test.info().attach('SSR', { body: html, contentType: 'text/html' });
  // Parse the response, not the hydrated DOM; script fixture payloads are excluded.
  const ssr = await page.evaluate(raw => {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    return { rows: Array.from(doc.querySelectorAll('.kkd-booking-side .kkd-booking-schedule-row > span:first-child'), el => el.textContent), hrefs: Array.from(doc.querySelectorAll('a[href*="/booking/"]'), el => el.getAttribute('href')), direct: doc.querySelector('.kkd-booking-side [data-testid="begin-checkout-btn"]')?.getAttribute('href') };
  }, html);
  expect(ssr.rows).toEqual(['4/10（五）', '4/15（三）']);
  for (const href of ssr.hrefs) {
    const url = new URL(href!, origin);
    expect(['2026-04-01', '2026-04-03']).not.toContain(url.searchParams.get('date'));
    expect(['kaohsiung-chaishan-cave-experience-schedule-0', 'kaohsiung-chaishan-cave-experience-schedule-1']).not.toContain(url.searchParams.get('scheduleId'));
  }
  expect(ssr.direct).toBeTruthy();
  const direct = new URL(ssr.direct!, origin);
  expect(direct.searchParams.get('date')).toBe('2026-04-10');
  expect(direct.searchParams.get('scheduleId')).toBe('kaohsiung-chaishan-cave-experience-schedule-2');
  await test.info().attach('SSR-sidebar-CTA', { body: JSON.stringify(ssr), contentType: 'application/json' });
  expect(diagnostics.mocks).toHaveLength(0); // availability is requested only after traveler intent
  return diagnostics;
}
test.afterEach(async ({ page }, info) => {
  await info.attach('page', { body: await page.content(), contentType: 'text/html' });
  const screenshot = info.outputPath('page.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await info.attach('screenshot', { path: screenshot, contentType: 'image/png' });
});
const card = (page: Page) => page.locator('.kkd-plan-card.selected');
const picker = (page: Page) => page.locator('[data-testid^="plan-date-picker-"]');
async function select(page: Page, diagnostics: Awaited<ReturnType<typeof fixture>>) {
  await page.locator('.kkd-plan-card').first().click();
  await expect.poll(() => diagnostics.mocks.length).toBe(1);
  await expect(picker(page)).toBeVisible();
}
async function query(page: Page, date: string, scheduleId?: string) {
  const href = await card(page).locator('a.kkd-plan-select-btn').getAttribute('href');
  const url = new URL(href!, origin);
  expect(url.searchParams.get('date')).toBe(date);
  expect(url.searchParams.get('plan')).toBe((await picker(page).getAttribute('data-testid'))!.replace('plan-date-picker-', ''));
  if (scheduleId) expect(url.searchParams.get('scheduleId')).toBe(scheduleId);
  await expect(card(page).locator('.kkd-plan-date-tag')).toHaveText(date.slice(5).replace('-', '/'));
  return href;
}
async function evidence(diagnostics: Awaited<ReturnType<typeof fixture>>) {
  await test.info().attach('diagnostics', { body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json' });
  const errors = diagnostics.console.filter((entry: any) => entry.type === 'error') as { text: string; url: string }[];
  const classified = errors.map(entry => ({ ...entry, baseline: entry.text.startsWith('A tree hydrated but some attributes of the server rendered HTML') && entry.text.includes('<Navbar>') && entry.text.includes('href=\"/activities\"') && entry.text.includes('+                               aria-current=\"page\"') && entry.text.includes('-                               aria-current={null}'), expectedBlockedResource: /^Failed to load resource: net::ERR_FAILED$/.test(entry.text) && diagnostics.expectedAbortedDevDiagnostics.some(request => request.url === entry.url && isExpectedAbortedDevDiagnostic(request.url, request.method)) }));
  await test.info().attach('error-classification', { body: JSON.stringify(classified, null, 2), contentType: 'application/json' });
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.blocked).toEqual([]);
  expect(classified.filter(entry => !entry.baseline && !entry.expectedBlockedResource)).toEqual([]);
}

const hero = (page: Page) => page.getByTestId('selected-plan-confirmation');
const zero = '最晚出發前 0 天確認', seven = '最晚出發前 7 天確認';
async function chooseDate(page: Page) {
  const pill = picker(page).locator('.tp-date-pill').filter({ has: page.locator('.tp-date-pill-month', { hasText: /^4\/10$/ }) });
  await expect(pill).toBeEnabled(); await pill.click();
  return query(page, '2026-04-10', 'kaohsiung-chaishan-cave-experience-schedule-2');
}
test('A0 date → B7 while availability pending commits B confirmation and clears old date', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  const diagnostics = await fixture(page, aprilSchedules, clock, gate);
  try {
    await select(page, diagnostics); await chooseDate(page);
    await expect(hero(page)).toHaveText(zero);
    await page.locator('.kkd-plan-card').nth(1).click();
    await expect(hero(page)).toHaveText(seven);
    await expect(picker(page).getByRole('status')).toBeVisible();
    await expect(card(page).locator('.kkd-plan-date-tag')).toHaveCount(0);
    const href = await card(page).locator('a.kkd-plan-select-btn').getAttribute('href');
    expect(new URL(href!, origin).searchParams.get('plan')).toBe('chaishan-cave-private');
    expect(new URL(href!, origin).searchParams.get('date')).toBeNull();
  } catch (error) { await test.info().attach('primary-AC-error', { body: String(error), contentType: 'text/plain' }); throw error; } finally { release(); await evidence(diagnostics); }
});
test('A0 date → preview B7 → close retains A hero, CTA and date', async ({ page }) => {
  const diagnostics = await fixture(page, aprilSchedules);
  try {
    await select(page, diagnostics); const href = await chooseDate(page);
    await expect(hero(page)).toHaveText(zero);
    await page.locator('.kkd-plan-card').nth(1).locator('button.kkd-link-sm').click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible(); await expect(modal).toContainText(seven);
    await expect(hero(page)).toHaveText(zero);
    await expect(card(page).locator('a.kkd-plan-select-btn')).toHaveAttribute('href', href!);
    await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
    await expect(hero(page)).toHaveText(zero); await query(page, '2026-04-10', 'kaohsiung-chaishan-cave-experience-schedule-2');
    await expect(card(page).locator('a.kkd-plan-select-btn')).toHaveAttribute('href', href!);
  } catch (error) { await test.info().attach('primary-AC-error', { body: String(error), contentType: 'text/plain' }); throw error; } finally { await evidence(diagnostics); }
});
const aprilSchedules = [10, 15].map((day, index) => ({ id: `kaohsiung-chaishan-cave-experience-schedule-${index + 2}`, startAt: `2026-04-${day}T01:00:00Z`, capacity: 8, bookedCount: 0, status: 'open', planId: null }));
test('booking navigation → browser Back keeps confirmation aligned with restored/reset identity, including null', async ({ page }) => {
  const diagnostics = await fixture(page, aprilSchedules);
  try {
    for (const [index, id, copy] of [[0, 'chaishan-cave-half-day', zero], [1, 'chaishan-cave-private', seven], [2, 'policy-null', null]] as const) {
      if (index === 2) {
        const more = page.locator('.kkd-plans-more-btn-wrap button');
        if (await more.isVisible()) await more.click();
      }
      await page.locator('.kkd-plan-card').nth(index).click();
      const href = await chooseDate(page);
      expect(new URL(href!, origin).searchParams.get('plan')).toBe(id);
      if (copy === null) await expect(hero(page)).toHaveCount(0); else await expect(hero(page)).toHaveText(copy);
      // Follow the real product CTA URL via a document navigation, served only by safe GET fixture.
      await page.goto(href!); await expect(page.getByRole('heading')).toHaveText('Safe local booking GET fixture');
      await page.goBack({ waitUntil: 'networkidle' });
      const selected = page.locator('.kkd-plan-card.selected');
      if (await selected.count()) {
        const restoredHref = await selected.locator('a.kkd-plan-select-btn').getAttribute('href');
        expect(new URL(restoredHref!, origin).searchParams.get('plan')).toBe(id);
        if (copy === null) await expect(hero(page)).toHaveCount(0); else await expect(hero(page)).toHaveText(copy);
        const date = new URL(restoredHref!, origin).searchParams.get('date');
        if (date) await expect(selected.locator('.kkd-plan-date-tag')).toHaveText(date.slice(5).replace('-', '/'));
        else await expect(selected.locator('.kkd-plan-date-tag')).toHaveCount(0);
      } else { await expect(hero(page)).toHaveCount(0); await expect(page.locator('.kkd-plan-date-tag')).toHaveCount(0); }
    }
  } catch (error) { await test.info().attach('primary-AC-error', { body: String(error), contentType: 'text/plain' }); throw error; } finally { await evidence(diagnostics); }
});
