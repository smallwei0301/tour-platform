import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const origin = 'http://127.0.0.1:3108';
const path = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';
const clock = new Date('2026-04-07T04:00:00Z');
// Same narrow selector clock and network guard as the verified local fixture.
const guard = "import net from 'node:net';\nconst instant=Date.parse('2026-04-07T04:00:00Z'),realNow=Date.now.bind(Date);let logged=false;\nDate.now=function(){if(new Error().stack.includes('selectUpcomingSchedules')){if(!logged){console.log('[fixture-selector-clock]',JSON.stringify({pid:process.pid,now:instant,iso:new Date(instant).toISOString()}));logged=true;}return instant;}return realNow();};\nconsole.log('[fixture-preload]',JSON.stringify({pid:process.pid,envNames:Object.keys(process.env).sort()}));\nconst allowed=(host,port)=>['127.0.0.1','localhost','::1','[::1]'].includes(host)&&Number(port)===3108;\nconst connect=net.Socket.prototype.connect;\nconst normalizedTag=Object.getOwnPropertySymbols(net._normalizeArgs([])).find(symbol=>symbol.description==='normalizedArgs');\nnet.Socket.prototype.connect=function(...args){const first=args[0];const normalized=Array.isArray(first)&&normalizedTag&&first[normalizedTag]?first:net._normalizeArgs(args);const options=normalized[0];if(options.path||!allowed(options.host||'localhost',options.port)){console.error('[blocked-server-network]',JSON.stringify({host:options.host||'localhost',port:options.port}));throw new Error('Fixture server network blocked');}return connect.apply(this,args);};\nconst fetchOriginal=globalThis.fetch;\nglobalThis.fetch=function(input,...args){const u=new URL(typeof input==='string'?input:input.url||String(input));const method=String(args[0]?.method??(input instanceof Request?input.method:'GET')).toUpperCase();if(!['http:','https:'].includes(u.protocol)||!allowed(u.hostname,u.port)||!['GET','HEAD'].includes(method)){console.error('[blocked-server-fetch]',u.origin);return Promise.reject(new Error('Fixture server fetch blocked'));}return fetchOriginal(input,...args);};\n";
let server: ChildProcess | undefined, temporary = '', serverLog = '';
test.use({ baseURL: origin, timezoneId: 'Asia/Taipei', locale: 'zh-TW', serviceWorkers: 'block' });
test.setTimeout(120_000);
test.beforeAll(async () => {
  expect(process.env.PLAYWRIGHT_NO_WEBSERVER).toBe('1');
  expect(process.versions.node.split('.')[0]).toBe('22');
  temporary = await mkdtemp(join(tmpdir(), 'issue1882-'));
  const preload = join(temporary, 'guard.mjs');
  await writeFile(preload, guard);
  server = spawn(process.execPath, [resolve('../../node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3108'], {
    cwd: process.cwd(), env: { PATH: `${resolve(process.execPath, '..')}:/usr/bin:/bin`, NODE_ENV: 'development', PORT: '3108', TZ: 'Asia/Taipei', NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: `--import=${preload}`, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'playwright-local-anon' },
  });
  server.stdout?.on('data', chunk => { serverLog += chunk.toString(); });
  server.stderr?.on('data', chunk => { serverLog += chunk.toString(); });
  await expect.poll(async () => {
    if (server?.exitCode !== null) throw new Error(`Fixture server exited: ${serverLog}`);
    try { return (await fetch(`${origin}/images/placeholder-avatar.svg`)).status; } catch { return 0; }
  }, { timeout: 60_000 }).toBe(200);
});
test.afterAll(async () => {
  await writeFile('/tmp/tour-1882-loop-closure-server.log', serverLog);
  if (server && server.exitCode === null) {
    const child = server;
    await new Promise<void>((done, reject) => {
      const force = setTimeout(() => child.kill('SIGKILL'), 5_000);
      const limit = setTimeout(() => { clearTimeout(force); reject(new Error('Owned fixture child did not exit')); }, 10_000);
      child.once('exit', () => { clearTimeout(force); clearTimeout(limit); done(); });
      child.kill('SIGTERM');
    });
  }
  if (temporary) await rm(temporary, { recursive: true });
});
async function fixture(page: Page, schedules: object[] = [], browserClock = clock) {
  const diagnostics: { console: object[]; pageErrors: string[]; blocked: object[]; mocks: string[] } = { console: [], pageErrors: [], blocked: [], mocks: [] };
  page.on('console', msg => diagnostics.console.push({ type: msg.type(), text: msg.text(), url: msg.location().url }));
  page.on('pageerror', error => diagnostics.pageErrors.push(String(error)));
  await page.context().route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (!['GET', 'HEAD'].includes(req.method()) || url.pathname.includes('/booking')) {
      diagnostics.blocked.push({ url: req.url(), method: req.method() }); return route.abort();
    }
    if (url.origin === 'http://127.0.0.1:54321' && url.pathname.startsWith('/auth/v1/')) return route.fulfill({ status: 401, json: { message: 'no fixture session' } });
    if (url.origin !== origin) { diagnostics.blocked.push({ url: req.url(), method: req.method() }); return route.abort(); }
    if (url.pathname === '/_next/image') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') });
    if (url.pathname === '/api/me/wishlist/ids') return route.fulfill({ json: { ok: true, data: { ids: [] } } });
    if (url.pathname.endsWith('/availability')) { diagnostics.mocks.push(req.url()); return route.fulfill({ json: { ok: true, data: { schedules, source: 'v2' } } }); }
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
  const classified = errors.map(entry => ({ ...entry, baseline: entry.text.startsWith('A tree hydrated but some attributes of the server rendered HTML') && entry.text.includes('<Navbar>') && entry.text.includes('href=\"/activities\"') && entry.text.includes('+                               aria-current=\"page\"') && entry.text.includes('-                               aria-current={null}'), expectedBlockedResource: /^Failed to load resource: net::ERR_FAILED$/.test(entry.text) && diagnostics.blocked.some((blocked: any) => blocked.url === entry.url) }));
  await test.info().attach('error-classification', { body: JSON.stringify(classified, null, 2), contentType: 'application/json' });
  expect(diagnostics.pageErrors).toEqual([]);
  expect(classified.filter(entry => !entry.baseline && !entry.expectedBlockedResource)).toEqual([]);
}
test('expired SSR/sidebar and CTA agree; empty availability retains future fixture', async ({ page }) => {
  const diagnostics = await fixture(page);
  try {
    const sidebar = await page.locator('.kkd-booking-schedules').innerText();
    expect(sidebar).not.toMatch(/4\/1(?:\D|$)|4\/3(?:\D|$)/);
    expect(sidebar).toContain('4/10'); expect(sidebar).toContain('4/15');
    const links = await page.locator('a[href*="booking"]').evaluateAll(els => els.map(e => e.getAttribute('href')));
    expect(links.join(' ')).not.toMatch(/2026-04-0[13]|schedule-[01](?:&|$)/);
    expect(links.some(href => href?.includes('date=2026-04-10'))).toBe(true);
    await select(page, diagnostics);
    await picker(page).locator('.tp-date-pill').filter({ has: page.locator('.tp-date-pill-month', { hasText: /^4\/10$/ }) }).click();
    await query(page, '2026-04-10', 'kaohsiung-chaishan-cave-experience-schedule-2');
  } finally { await evidence(diagnostics); }
});
test('nonempty availability capacity, selected query and mobile bottom CTA synchronize', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const diagnostics = await fixture(page, [{ id: 'fixture-live-apr10', startAt: '2026-04-10T01:00:00Z', capacity: 9, bookedCount: 2, status: 'open', planId: null }]);
  try {
    await select(page, diagnostics);
    const pill = picker(page).locator('.tp-date-pill').filter({ has: page.locator('.tp-date-pill-month', { hasText: /^4\/10$/ }) });
    await expect(pill).toHaveAttribute('title', '剩餘 7 位'); await pill.click();
    const href = await query(page, '2026-04-10', 'fixture-live-apr10');
    await expect(card(page)).toContainText('7');
    await expect(page.locator('a.tp-bottom-bar-cta')).toHaveAttribute('href', href!);
  } finally { await evidence(diagnostics); }
});
test('CalendarModal keeps same external CTA and traps normal Tab; calendar date parity', async ({ page }) => {
  const diagnostics = await fixture(page);
  try {
    await select(page, diagnostics);
    const cta = card(page).locator('a.kkd-plan-select-btn');
    const identity = await cta.elementHandle(), href = await cta.getAttribute('href');
    await picker(page).locator('.kkd-more-dates-btn').click();
    const modal = page.locator('.kkd-cal-modal'); await expect(modal).toBeVisible();
    expect(await cta.evaluate((el, original) => el === original, identity)).toBe(true);
    await expect(cta).toHaveAttribute('href', href!);
    const controls = await modal.locator('button:not([disabled])').count();
    const focus: object[] = [];
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < controls + 2; i++) {
        await page.keyboard.press(key);
        const state = await modal.evaluate(el => ({ inside: el.contains(document.activeElement), text: document.activeElement?.getAttribute('aria-label'), tag: document.activeElement?.tagName }));
        focus.push({ key, ...state }); expect(state.inside).toBe(true);
      }
    }
    await test.info().attach('focus-order', { body: JSON.stringify(focus), contentType: 'application/json' });
    await expect(modal.locator('#calendar-title')).toHaveText('2026 年 4月');
    expect(await modal.locator('.kkd-cal-weekday').allTextContents()).toEqual(['日', '一', '二', '三', '四', '五', '六']);
    const cells = await modal.locator('.kkd-cal-grid > *').evaluateAll(els => els.map((el, index) => ({ index, day: el.querySelector('.kkd-cal-day-num')?.textContent, aria: el.getAttribute('aria-label') })));
    expect(cells).toHaveLength(33);
    expect(cells.slice(0, 3)).toEqual([0, 1, 2].map(index => ({ index, day: undefined, aria: null })));
    expect(cells.slice(3).map(cell => cell.day)).toEqual(Array.from({ length: 30 }, (_, index) => String(index + 1)));
    expect(cells[32].day).toBe('30');
    for (const cell of cells.slice(3)) {
      expect(cell.index).toBe(Number(cell.day) + 2); // April 1 2026 is Wednesday, grid index 3.
      expect(cell.aria).toMatch(new RegExp(`^2026年4月${Number(cell.day)}日，`));
    }
    await test.info().attach('calendar-state', { body: JSON.stringify(cells), contentType: 'application/json' });
    await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
    expect(await cta.evaluate((el, original) => el === original, identity)).toBe(true);
    await expect(cta).toHaveAttribute('href', href!);
    await picker(page).locator('.kkd-more-dates-btn').click();
    await modal.getByRole('button', { name: /^2026年4月10日，可預約/ }).click();
    await expect(modal).toHaveCount(0);
    await query(page, '2026-04-10', 'kaohsiung-chaishan-cave-experience-schedule-2');
    await picker(page).locator('.kkd-more-dates-btn').click();
    await expect(modal.locator('#calendar-title')).toHaveText('2026 年 4月');
    await expect(modal.locator('.kkd-cal-day.selected')).toHaveCount(1);
    await expect(modal.locator('.kkd-cal-day.selected .kkd-cal-day-num')).toHaveText('10');
    await expect(modal.locator('.kkd-cal-day.selected')).toHaveAttribute('aria-label', /^2026年4月10日，可預約，剩餘 \d+ 位$/);
    await expect(modal.locator('.kkd-cal-selected-summary')).toHaveText('已選：04/10（五）');
    await query(page, '2026-04-10', 'kaohsiung-chaishan-cave-experience-schedule-2');
    await page.keyboard.press('Escape');
  } finally { await evidence(diagnostics); }
});

// The server selector retains its April SSR clock; these browser cases use explicit October local clocks.
const civilSchedules = ['2026-09-30', '2026-10-01', '2026-10-05'].map(date => ({
  id: `civil-${date}`, startAt: `${date}T01:00:00Z`, capacity: 8, bookedCount: 0, status: 'open', planId: null,
}));
for (const timezoneId of ['America/Los_Angeles', 'Asia/Taipei']) {
  test.describe(`civil date ${timezoneId}`, () => {
    test.use({ timezoneId });
    test('October weekdays, today availability, calendar summary and exact query key', async ({ page }) => {
      const diagnostics = await fixture(page, civilSchedules, new Date(timezoneId === 'America/Los_Angeles' ? '2026-10-01T19:00:00Z' : '2026-10-01T04:00:00Z'));
      try {
        const timezone = await page.evaluate(() => ({ zone: Intl.DateTimeFormat().resolvedOptions().timeZone, local: [new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()] }));
        expect(timezone).toEqual({ zone: timezoneId, local: [2026, 10, 1] });
        await test.info().attach('browser-timezone', { body: JSON.stringify(timezone), contentType: 'application/json' });
        await select(page, diagnostics);
        for (const [date, weekday] of [['10/1', '四'], ['10/5', '一']]) {
          const pill = picker(page).locator('.tp-date-pill').filter({ has: page.locator('.tp-date-pill-month', { hasText: new RegExp(`^${date}$`) }) });
          await expect(pill).toBeEnabled(); await expect(pill.locator('.tp-date-pill-week')).toHaveText(`週${weekday}`);
        }
        await picker(page).locator('.kkd-more-dates-btn').click();
        const modal = page.locator('.kkd-cal-modal');
        await expect(modal.locator('#calendar-title')).toHaveText('2026 年 10月');
        const today = modal.getByRole('button', { name: /^2026年10月1日，可預約/ });
        await expect(today).toBeEnabled(); // LA local today must not be treated as past.
        expect(await today.evaluate(el => Array.from(el.parentElement!.children).indexOf(el) % 7)).toBe(4);
        const oct5 = modal.getByRole('button', { name: /^2026年10月5日，可預約/ });
        expect(await oct5.evaluate(el => Array.from(el.parentElement!.children).indexOf(el) % 7)).toBe(1);
        await expect(oct5).not.toHaveClass(/\b(?:sun|sat)\b/);
        await oct5.click();
        await query(page, '2026-10-05', 'civil-2026-10-05');
        await picker(page).locator('.kkd-more-dates-btn').click();
        await expect(modal.locator('.kkd-cal-selected-summary')).toHaveText('已選：10/05（一）');
        await expect(modal.locator('.kkd-cal-day.selected')).not.toHaveClass(/\b(?:sun|sat)\b/);
        await page.keyboard.press('Escape');
      } finally { await evidence(diagnostics); }
    });
    test('fresh browser documents on both sides of local midnight keep display and availability keys aligned', async ({ page }) => {
      const instants = timezoneId === 'America/Los_Angeles'
        ? ['2026-10-01T06:59:59Z', '2026-10-01T07:00:01Z']
        : ['2026-09-30T15:59:59Z', '2026-09-30T16:00:01Z'];
      for (const [index, instant] of instants.entries()) {
        // A new page isolates the mounted useMemo across the boundary; no claim of live rollover.
        const fresh = await page.context().newPage();
        const diagnostics = await fixture(fresh, civilSchedules, new Date(instant));
        try {
          const observed = await fresh.evaluate(() => ({ zone: Intl.DateTimeFormat().resolvedOptions().timeZone, month: new Date().getMonth() + 1, day: new Date().getDate() }));
          expect(observed).toEqual({ zone: timezoneId, month: index === 0 ? 9 : 10, day: index === 0 ? 30 : 1 });
          await select(fresh, diagnostics);
          const first = picker(fresh).locator('.tp-date-pill').first();
          await expect(first.locator('.tp-date-pill-month')).toHaveText(index === 0 ? '9/30' : '10/1');
          await expect(first.locator('.tp-date-pill-week')).toHaveText(index === 0 ? '週三' : '週四');
          await expect(first).toBeEnabled(); await first.click();
          const date = index === 0 ? '2026-09-30' : '2026-10-01';
          await query(fresh, date, `civil-${date}`);
          await test.info().attach(`midnight-${index}`, { body: JSON.stringify({ instant, timezoneId, date, html: await picker(fresh).innerHTML() }), contentType: 'application/json' });
        } finally { await evidence(diagnostics); await fresh.close(); await page.context().unrouteAll({ behavior: 'wait' }); }
      }
    });
  });
}
