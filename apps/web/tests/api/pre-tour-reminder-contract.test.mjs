/**
 * Issue #341 — Pre-tour Reminder Pipeline Contract Tests (AC1–AC10)
 * Uses node:test + readFileSync/existsSync pattern (no live server).
 * ONE behavioral unit test for AC5/AC6 (imports composePreTourReminder).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── AC1: Migration file ───────────────────────────────────────────────────────

test('AC1: migration 20260511_issue341_tour_reminder_log.sql exists with required DDL', () => {
  const migrationPath = path.resolve(ROOT, '../../supabase/migrations/20260511_issue341_tour_reminder_log.sql');
  assert.ok(existsSync(migrationPath), `Migration file not found: ${migrationPath}`);

  const sql = readFileSync(migrationPath, 'utf8');

  // Table creation
  assert.match(sql, /CREATE TABLE IF NOT EXISTS tour_reminder_log/, 'Must have CREATE TABLE IF NOT EXISTS tour_reminder_log');

  // Required columns
  assert.match(sql, /id\s+uuid\s+PRIMARY KEY/, 'Must have id uuid PRIMARY KEY');
  assert.match(sql, /order_id/, 'Must have order_id column');
  assert.match(sql, /schedule_id/, 'Must have schedule_id column');
  assert.match(sql, /reminder_kind/, 'Must have reminder_kind column');
  assert.match(sql, /['"]h24['"].*['"]h1['"]|['"]h1['"].*['"]h24['"]|CHECK.*h24|CHECK.*h1/, 'Must have reminder_kind CHECK(h24, h1)');
  assert.match(sql, /channel/, 'Must have channel column');
  assert.match(sql, /['"]email['"]/, 'Must have email in channel CHECK');
  assert.match(sql, /['"]line_notify_admin['"]/, 'Must have line_notify_admin in channel CHECK');
  assert.match(sql, /status/, 'Must have status column');
  assert.match(sql, /['"]sent['"]/, 'Must have sent in status CHECK');
  assert.match(sql, /['"]failed['"]/, 'Must have failed in status CHECK');
  assert.match(sql, /['"]skipped['"]/, 'Must have skipped in status CHECK');
  assert.match(sql, /sent_at/, 'Must have sent_at column');
  assert.match(sql, /created_at/, 'Must have created_at column');

  // UNIQUE constraint
  assert.match(sql, /UNIQUE\s*\(.*order_id.*reminder_kind.*channel|UNIQUE\s*\(.*reminder_kind.*order_id/, 'Must have UNIQUE(order_id, reminder_kind, channel) constraint');

  // RLS
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/, 'Must enable RLS');
  assert.match(sql, /service_role/, 'Must reference service_role in RLS policy');
});

test('AC1b: rollback file 20260511_issue341_tour_reminder_log.rollback.sql exists', () => {
  const rollbackPath = path.resolve(ROOT, '../../supabase/migrations/20260511_issue341_tour_reminder_log.rollback.sql');
  assert.ok(existsSync(rollbackPath), `Rollback file not found: ${rollbackPath}`);

  const sql = readFileSync(rollbackPath, 'utf8');
  assert.match(sql, /DROP TABLE IF EXISTS tour_reminder_log/, 'Must drop tour_reminder_log table in rollback');
});

// ── AC2: Sweep endpoint auth guard ───────────────────────────────────────────

test('AC2: pre-tour-sweep route.ts exists with 401 auth guard', () => {
  const routePath = path.resolve(ROOT, 'app/api/internal/reminders/pre-tour-sweep/route.ts');
  assert.ok(existsSync(routePath), `Sweep route not found: ${routePath}`);

  const src = readFileSync(routePath, 'utf8');

  // Auth guard pattern
  assert.match(src, /x-internal-token/, 'Must check x-internal-token header');
  assert.match(src, /INTERNAL_ALERT_TOKEN/, 'Must compare against INTERNAL_ALERT_TOKEN env var');
  assert.match(src, /status:\s*401/, 'Must return 401 when unauthorized');
  assert.match(src, /Unauthorized/, 'Must return Unauthorized message');
});

// ── AC3: Start_at window query logic ─────────────────────────────────────────

test('AC3: sweep source queries correct start_at windows for h24 and h1', () => {
  const routePath = path.resolve(ROOT, 'app/api/internal/reminders/pre-tour-sweep/route.ts');
  assert.ok(existsSync(routePath), `Sweep route not found: ${routePath}`);

  const src = readFileSync(routePath, 'utf8');

  // h24 window: now+23h to now+25h
  assert.match(src, /23\s*\*\s*60\s*\*\s*60|23\s*\*\s*3600|82800/, 'Must define 23h window boundary for h24');
  assert.match(src, /25\s*\*\s*60\s*\*\s*60|25\s*\*\s*3600|90000/, 'Must define 25h window boundary for h24');

  // h1 window: now+30min to now+90min
  assert.match(src, /30\s*\*\s*60|1800/, 'Must define 30min window boundary for h1');
  assert.match(src, /90\s*\*\s*60|5400/, 'Must define 90min window boundary for h1');

  // Orders status filter
  assert.match(src, /['"]paid['"]/, 'Must filter for paid orders');
  assert.match(src, /['"]confirmed['"]/, 'Must filter for confirmed orders');
});

// ── AC4: Idempotency check ────────────────────────────────────────────────────

test('AC4: sweep source checks tour_reminder_log before sending (idempotency)', () => {
  const routePath = path.resolve(ROOT, 'app/api/internal/reminders/pre-tour-sweep/route.ts');
  assert.ok(existsSync(routePath), `Sweep route not found: ${routePath}`);

  const src = readFileSync(routePath, 'utf8');

  // Must reference tour_reminder_log for idempotency check
  assert.match(src, /tour_reminder_log/, 'Must reference tour_reminder_log table');

  // ON CONFLICT DO NOTHING pattern for upsert/insert idempotency
  assert.match(src, /ON CONFLICT DO NOTHING|onConflict.*ignore|upsert.*ignoreDuplicates/, 'Must use ON CONFLICT DO NOTHING or equivalent for idempotency');
});

// ── AC5: composePreTourReminder export ────────────────────────────────────────

test('AC5: pre-tour-reminder.ts exports composePreTourReminder with correct content per kind', () => {
  const libPath = path.resolve(ROOT, 'src/lib/pre-tour-reminder.ts');
  assert.ok(existsSync(libPath), `pre-tour-reminder.ts not found: ${libPath}`);

  const src = readFileSync(libPath, 'utf8');

  // Export
  assert.match(src, /export.*function composePreTourReminder|export.*const composePreTourReminder/, 'Must export composePreTourReminder');

  // Parameters
  assert.match(src, /kind.*['"]h24['"].*['"]h1['"]|kind.*:.*'h24'\s*\|.*'h1'/, 'Must accept kind parameter (h24 | h1)');
  assert.match(src, /meeting_point/, 'Must reference meeting_point in h24 output');
  assert.match(src, /meeting_point_map_url/, 'Must reference meeting_point_map_url in h1 output');
  assert.match(src, /Asia\/Taipei/, 'Must use Asia/Taipei timezone for time formatting');
});

// ── AC6: Behavioral — Asia/Taipei timezone formatting ────────────────────────

test('AC6: composePreTourReminder formats UTC midnight as Asia/Taipei 08:00', async () => {
  const libPath = path.resolve(ROOT, 'src/lib/pre-tour-reminder.ts');
  assert.ok(existsSync(libPath), `pre-tour-reminder.ts not found: ${libPath}`);

  // Dynamic import of the compiled/source module
  const mod = await import(libPath);
  assert.ok(typeof mod.composePreTourReminder === 'function', 'composePreTourReminder must be a function');

  const order = { contact_name: 'Test User', contact_email: 'test@example.com' };
  const activity = {
    title: 'Test Activity',
    meeting_point: 'Test Meeting Point',
    meeting_point_map_url: 'https://maps.google.com/?q=test',
    notices: '請攜帶防曬乳'
  };
  const schedule = { start_at: '2026-05-12T00:00:00.000Z' }; // UTC midnight = 08:00 Taipei
  const kind = 'h1';

  const result = mod.composePreTourReminder(order, activity, schedule, kind);

  assert.ok(typeof result === 'string', 'Must return a string');
  assert.ok(result.length > 0, 'Must return non-empty string');
  // UTC midnight = 08:00 Asia/Taipei
  assert.ok(result.includes('08:00'), `Must include 08:00 Taipei time (got: ${result.slice(0, 200)})`);
});

// ── AC7: Skip cancelled / no-email orders ─────────────────────────────────────

test('AC7: sweep source skips cancelled orders and orders without contact_email', () => {
  const routePath = path.resolve(ROOT, 'app/api/internal/reminders/pre-tour-sweep/route.ts');
  assert.ok(existsSync(routePath), `Sweep route not found: ${routePath}`);

  const src = readFileSync(routePath, 'utf8');

  // Must NOT send to cancelled orders — filter by status
  assert.match(src, /['"]paid['"].*['"]confirmed['"]|status.*paid|status.*confirmed/, 'Must filter to only paid/confirmed orders (implicitly skipping cancelled)');

  // Must check for missing contact_email
  assert.match(src, /contact_email/, 'Must reference contact_email for email channel');
  assert.match(src, /!.*contact_email|contact_email.*null|contact_email.*undefined|skipped/, 'Must skip or guard when contact_email is missing');
});

// ── AC8: sendReminder channel abstraction ─────────────────────────────────────

test('AC8: pre-tour-reminder.ts exports sendReminder with channel parameter', () => {
  const libPath = path.resolve(ROOT, 'src/lib/pre-tour-reminder.ts');
  assert.ok(existsSync(libPath), `pre-tour-reminder.ts not found: ${libPath}`);

  const src = readFileSync(libPath, 'utf8');

  // Export sendReminder
  assert.match(src, /export.*function sendReminder|export.*const sendReminder|export.*async.*sendReminder/, 'Must export sendReminder');

  // Channel type alias covers email + line_notify_admin (#302b adds line_push)
  assert.match(src, /ReminderChannel\s*=\s*'email'\s*\|\s*'line_notify_admin'\s*\|\s*'line_push'/, 'ReminderChannel must include email | line_notify_admin | line_push');
  assert.match(src, /channel:\s*ReminderChannel/, 'sendReminder must accept channel: ReminderChannel');

  // Routes to email, ops LINE, and per-traveler LINE push
  assert.match(src, /channel\s*===\s*['"]email['"]|channel.*email/, 'Must route email channel');
  assert.match(src, /channel\s*===\s*['"]line_notify_admin['"]|channel.*line_notify_admin/, 'Must route line_notify_admin channel');
  assert.match(src, /channel\s*===\s*['"]line_push['"]/, 'Must route line_push channel');
});

// ── AC9: GitHub Actions workflow ──────────────────────────────────────────────

test('AC9: .github/workflows/pre-tour-reminder-sweep.yml exists with cron */30 and correct endpoint', () => {
  const workflowPath = path.resolve(ROOT, '../../.github/workflows/pre-tour-reminder-sweep.yml');
  assert.ok(existsSync(workflowPath), `Workflow file not found: ${workflowPath}`);

  const src = readFileSync(workflowPath, 'utf8');

  // Cron schedule hourly（降頻省 GitHub 分鐘；h1 視窗 60 分鐘寬、半開相接無缺口）
  assert.match(src, /cron:\s*'0 \* \* \* \*'/, 'Must have hourly cron: 0 * * * *');

  // Must POST to the sweep endpoint
  assert.match(src, /pre-tour-sweep/, 'Must reference pre-tour-sweep endpoint');

  // Must use INTERNAL_ALERT_TOKEN secret
  assert.match(src, /INTERNAL_ALERT_TOKEN/, 'Must use INTERNAL_ALERT_TOKEN secret for auth header');

  // Must use NEXT_PUBLIC_VERCEL_URL or equivalent for base URL
  assert.match(src, /NEXT_PUBLIC_VERCEL_URL|VERCEL_URL|APP_URL|BASE_URL/, 'Must reference a base URL env var for the POST endpoint');
});

// ── AC10: Error handling with recordIncident ──────────────────────────────────

test('AC10: sweep source wraps handler in try/catch and calls recordIncident on error', () => {
  const routePath = path.resolve(ROOT, 'app/api/internal/reminders/pre-tour-sweep/route.ts');
  assert.ok(existsSync(routePath), `Sweep route not found: ${routePath}`);

  const src = readFileSync(routePath, 'utf8');

  // Must import/use recordIncident
  assert.match(src, /recordIncident/, 'Must reference recordIncident');
  assert.match(src, /from.*incidents|import.*recordIncident/, 'Must import recordIncident from incidents lib');

  // Try/catch wrapping the handler
  assert.match(src, /try\s*\{[\s\S]*\}\s*catch/, 'Must wrap handler in try/catch');
  assert.match(src, /source\s*:\s*['"]pre_tour_reminder_sweep['"]/, "Must call recordIncident with source:'pre_tour_reminder_sweep'");
});
