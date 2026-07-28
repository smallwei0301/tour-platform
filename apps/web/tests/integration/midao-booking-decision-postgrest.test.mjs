import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { lexPostgresSql } from '../helpers/sql-source-lexer.mjs';

const MIGRATION_URL = new URL(
  '../../../../supabase/migrations/20260723011000_midao_atomic_booking_decision_command.sql',
  import.meta.url,
);
const MIGRATION_PATH = fileURLToPath(MIGRATION_URL);
const FUNCTION_PREFIX = 'CREATE OR REPLACE FUNCTION PUBLIC.MIDAO_DECIDE_BOOKING_REQUEST';
const PROJECTION_KEYS = ['BOOKINGID', 'BOOKINGNO', 'ORDERID', 'STATUS', 'GUIDEAPPROVALSTATUS', 'PAYMENTDEADLINEAT', 'ACTION'];

function migrationSql() {
  assert.equal(existsSync(MIGRATION_PATH), true, `missing decision command migration: ${MIGRATION_PATH}`);
  return readFileSync(MIGRATION_PATH, 'utf8');
}

function normalize(sql) {
  return sql.replace(/\s+/gu, ' ').trim().toUpperCase();
}

function parseContract(sql) {
  const { statements } = lexPostgresSql(sql);
  const functionStatement = statements.find((statement) => statement.startsWith(FUNCTION_PREFIX));
  assert.ok(functionStatement, 'canonical decision RPC statement must exist');
  const bodyMatch = functionStatement.match(/\$MIDAO\$([\s\S]*)\$MIDAO\$/u);
  assert.ok(bodyMatch, 'canonical decision RPC must use the expected dollar-quoted body');
  return {
    statements,
    functionStatement,
    body: normalize(lexPostgresSql(bodyMatch[1]).executable),
  };
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function assertDecisionContract(sql) {
  const { statements, functionStatement, body } = parseContract(sql);
  assert.match(
    functionStatement,
    /^CREATE OR REPLACE FUNCTION PUBLIC\.MIDAO_DECIDE_BOOKING_REQUEST\(\s*P_GUIDE_ID UUID, P_ACTOR_TYPE TEXT, P_ACTOR_ID TEXT, P_BOOKING_ID UUID, P_ACTION TEXT, P_NOTE TEXT, P_IDEMPOTENCY_KEY TEXT, P_REQUEST_HASH TEXT\s*\) RETURNS JSONB LANGUAGE PLPGSQL SECURITY DEFINER SET SEARCH_PATH = PG_CATALOG AS \$MIDAO\$/u,
  );
  assert.doesNotMatch(functionStatement, /SET SEARCH_PATH = PUBLIC/iu);

  const acl = statements.filter((statement) => /^(?:GRANT|REVOKE)\s/u.test(statement));
  assert.deepEqual(acl, [
    'REVOKE ALL ON FUNCTION PUBLIC.MIDAO_DECIDE_BOOKING_REQUEST(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, ANON, AUTHENTICATED',
    'GRANT EXECUTE ON FUNCTION PUBLIC.MIDAO_DECIDE_BOOKING_REQUEST(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO SERVICE_ROLE',
    'REVOKE EXECUTE ON FUNCTION PUBLIC.MIDAO_DECIDE_BOOKING_REQUEST(UUID, TEXT, TEXT) FROM SERVICE_ROLE',
  ]);

  for (const token of [
    'P_GUIDE_ID', 'P_ACTOR_TYPE', 'P_ACTOR_ID', 'P_BOOKING_ID', 'P_ACTION', 'P_NOTE', 'P_IDEMPOTENCY_KEY', 'P_REQUEST_HASH',
  ]) assert.match(body, new RegExp(`\\b${token}\\b`, 'u'));
  assert.match(body, /INSERT INTO PUBLIC\.MIDAO_IDEMPOTENCY_RECORDS\b/u);
  assert.match(body, /ON CONFLICT \(SCOPE_TYPE, SCOPE_ID, COMMAND_NAME, IDEMPOTENCY_KEY\) DO NOTHING/u);
  assert.match(body, /'DECIDE_BOOKING_REQUEST', 'BOOKING', P_BOOKING_ID/u);
  assert.match(body, /V_STORED_HASH <> V_REQUEST_HASH/u);
  assert.match(body, /IDEMPOTENCY_CONFLICT/u);
  assert.match(body, /IDEMPOTENCY_IN_PROGRESS/u);
  assert.match(body, /STATE = 'COMPLETED'/u);
  assert.match(body, /RESPONSE_STATUS = 200/u);
  assert.match(body, /RESPONSE_BODY = V_RESPONSE_BODY/u);
  assert.match(body, /RETURN V_RESPONSE_BODY/u);

  const orderLock = body.match(/FOR V_ORDER_CANDIDATE IN SELECT O\.\* FROM PUBLIC\.ORDERS AS O WHERE O\.BOOKING_ID = P_BOOKING_ID FOR UPDATE/u);
  const bookingLock = body.match(/SELECT B\.\* INTO V_BOOKING FROM PUBLIC\.BOOKINGS AS B WHERE B\.ID = P_BOOKING_ID AND B\.ORDER_ID = V_ORDER\.ID FOR UPDATE/u);
  const scheduleLock = body.match(/SELECT S\.ID INTO V_SCHEDULE_ID FROM PUBLIC\.ACTIVITY_SCHEDULES AS S WHERE S\.ID = V_ORDER\.SCHEDULE_ID FOR UPDATE/u);
  assert.ok(orderLock, 'orders must be locked by reciprocal booking_id');
  assert.ok(bookingLock, 'booking must be locked by reciprocal order_id');
  assert.ok(scheduleLock, 'activity schedule must be locked by canonical order schedule_id');
  assert.ok(orderLock.index < bookingLock.index, 'orders lock must precede bookings lock');
  assert.ok(bookingLock.index < scheduleLock.index, 'bookings lock must precede activity_schedules lock');
  const zeroOrderStart = body.indexOf('IF V_ORDER_COUNT = 0 THEN');
  const missingBookingRaise = "RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'BOOKING_NOT_FOUND';";
  const missingBookingRaiseIndex = body.indexOf(missingBookingRaise, zeroOrderStart);
  assert.ok(zeroOrderStart >= 0 && missingBookingRaiseIndex > zeroOrderStart, 'zero-order handling must classify the missing booking');
  const zeroOrderHandling = body.slice(zeroOrderStart, missingBookingRaiseIndex + missingBookingRaise.length);
  assert.match(
    zeroOrderHandling,
    /SELECT B\.\* INTO V_BOOKING FROM PUBLIC\.BOOKINGS AS B WHERE B\.ID = P_BOOKING_ID FOR UPDATE/u,
    'zero reciprocal orders must probe the booking row before returning 404',
  );
  const relationInvalidIndex = zeroOrderHandling.indexOf("MESSAGE = 'MIDAO_BOOKING_RELATION_INVALID'");
  const missingBookingMessageIndex = zeroOrderHandling.indexOf("MESSAGE = 'BOOKING_NOT_FOUND'");
  assert.ok(
    relationInvalidIndex >= 0 && relationInvalidIndex < missingBookingMessageIndex,
    'an existing booking without a reciprocal order must fail closed as relation corruption',
  );
  assert.match(body, /V_BOOKING\.GUIDE_ID IS DISTINCT FROM P_GUIDE_ID[\s\S]*?BOOKING_NOT_FOUND/u);
  assert.match(body, /MIDAO_BOOKING_RELATION_INVALID/u);
  assert.match(body, /MIDAO_SCHEDULE_RELATION_INVALID/u);
  assert.doesNotMatch(body, /\b(?:NOWAIT|SKIP LOCKED)\b/u);

  const validationIndexes = [
    body.indexOf('IF P_BOOKING_ID IS NULL THEN'),
    body.indexOf('IF V_IDEMPOTENCY_KEY IS NULL'),
    body.indexOf('IF V_REQUEST_HASH IS NULL'),
    orderLock.index,
  ];
  assert.ok(validationIndexes.slice(0, 3).every((index) => index >= 0 && index < orderLock.index), 'input validation must precede business row locks');

  assert.match(body, /UPDATE PUBLIC\.BOOKINGS SET[\s\S]*?GUIDE_APPROVAL_STATUS = 'APPROVED'/u);
  assert.match(body, /UPDATE PUBLIC\.BOOKINGS SET[\s\S]*?GUIDE_APPROVAL_STATUS = 'REJECTED'/u);
  assert.match(body, /UPDATE PUBLIC\.ORDERS SET[\s\S]*?STATUS = 'PENDING_PAYMENT'/u);
  assert.match(body, /UPDATE PUBLIC\.ORDERS SET[\s\S]*?STATUS = 'CANCELLED_BY_GUIDE'/u);
  assert.equal(countMatches(body, /INSERT INTO PUBLIC\.BOOKING_STATUS_LOGS\b/gu), 1);
  assert.equal(countMatches(body, /INSERT INTO PUBLIC\.MIDAO_NOTIFICATION_OUTBOX\b/gu), 1);
  assert.match(body, /PG_CATALOG\.JSONB_BUILD_OBJECT\('ACTION', V_ACTION\)/u);
  const observabilityStart = body.indexOf('INSERT INTO PUBLIC.BOOKING_STATUS_LOGS');
  const observabilityEnd = body.indexOf('V_RESPONSE_BODY :=', observabilityStart);
  const observability = body.slice(observabilityStart, observabilityEnd);
  assert.doesNotMatch(observability, /\b(?:NOTE|EMAIL|PHONE|TOKEN|SECRET|PASSWORD|CONTACT|ADMIN_NOTE|INTERNAL_NOTE|P_NOTE)\b/u);

  const projectionStart = body.indexOf('V_RESPONSE_BODY := PG_CATALOG.JSONB_BUILD_OBJECT');
  assert.ok(projectionStart >= 0, 'fixed response projection must be built before idempotency completion');
  const projection = body.slice(projectionStart, body.indexOf(');', projectionStart) + 2);
  const projectionKeys = [...projection.matchAll(/'([A-Z][A-Z0-9]*)'\s*,/gu)].map((match) => match[1]);
  assert.deepEqual(projectionKeys, PROJECTION_KEYS);
  assert.doesNotMatch(projection, /\b(?:NOTE|EMAIL|PHONE|TOKEN|SECRET|ADMIN|INTERNAL|CONTACT)\b/u);

  assert.doesNotMatch(body, /\b(?:COMMIT|ROLLBACK|SAVEPOINT)\b/u);
  assert.doesNotMatch(body, /\bEXCEPTION\s+WHEN\b/u);
  assert.doesNotMatch(body, /\b(?:SQLERRM|MESSAGE_TEXT|GET STACKED DIAGNOSTICS|RAISE NOTICE|RAISE WARNING)\b/u);
}

test('atomic booking decision migration has the canonical overload and ACL posture', () => {
  assertDecisionContract(migrationSql());
});

test('atomic decision source contract rejects idempotency, lock-order, ownership, and safe-projection mutations', () => {
  const sql = migrationSql();
  const mutations = [
    ['missing idempotency claim', sql.replace('INSERT INTO public.midao_idempotency_records', 'INSERT INTO public.midao_idempotency_recordz')],
    ['different idempotency scope', sql.replace("    'decide_booking_request',\n    'booking',\n    p_booking_id,", "    'decide_booking_request',\n    'order',\n    p_booking_id,")],
    ['different request hash no conflict', sql.replace('IF v_stored_hash <> v_request_hash THEN', 'IF v_stored_hash = v_request_hash THEN')],
    ['processing placeholder returned', sql.replace("MESSAGE = 'IDEMPOTENCY_IN_PROGRESS'", "MESSAGE = 'BOOKING_NOT_FOUND'")],
    ['zero-order booking existence probe removed', sql.replace(
      '      SELECT b.*\n      INTO v_booking\n      FROM public.bookings AS b\n      WHERE b.id = p_booking_id\n      FOR UPDATE;',
      '      -- booking existence probe removed',
    )],
    ['zero-order corruption classified as missing', sql.replace(
      "      IF FOUND THEN\n        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_BOOKING_RELATION_INVALID';\n      END IF;",
      "      IF FOUND THEN\n        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'BOOKING_NOT_FOUND';\n      END IF;",
    )],
    ['orders lock removed', sql.replace('    FOR UPDATE\n  LOOP', '    -- FOR UPDATE\n  LOOP')],
    ['business lock nowait', sql.replace('FOR UPDATE;', 'FOR UPDATE NOWAIT;')],
    ['ownership guard removed', sql.replace("IF v_booking.guide_id IS DISTINCT FROM p_guide_id THEN", 'IF FALSE THEN')],
    ['outbox note leaked', sql.replace("'action', v_action,\n      'guideApprovalStatus'", "'action', v_action,\n      'note', v_note,\n      'guideApprovalStatus'")],
    ['projection key removed', sql.replace("'bookingId', p_booking_id,\n    'bookingNo'", "'bookingNo', p_booking_id,\n    'bookingNo'")],
    ['old overload service role revoke removed', sql.replace('REVOKE EXECUTE ON FUNCTION public.midao_decide_booking_request(uuid, text, text)', 'REVOKE EXECUTE ON FUNCTION public.midao_decide_booking_request(uuid, text, text, text)')],
    ['transaction control added', sql.replace('$midao$\nDECLARE', '$midao$\nCOMMIT;\nDECLARE')],
  ];
  for (const [name, mutant] of mutations) {
    assert.notEqual(mutant, sql, `${name} mutation must change SQL`);
    assert.throws(() => assertDecisionContract(mutant), `${name} mutation must fail`);
  }
});

test('SQL comments cannot hide an active unsafe decision statement', () => {
  const sql = migrationSql();
  const benign = `${sql}\n/* GRANT EXECUTE ON FUNCTION public.midao_decide_booking_request(uuid, text, text) TO PUBLIC; */\n-- COMMIT;`;
  assert.doesNotThrow(() => assertDecisionContract(benign));
  const hostile = `${sql}\nGRANT EXECUTE ON FUNCTION public.midao_decide_booking_request(uuid, text, text) TO PUBLIC;`;
  assert.throws(() => assertDecisionContract(hostile));
});
