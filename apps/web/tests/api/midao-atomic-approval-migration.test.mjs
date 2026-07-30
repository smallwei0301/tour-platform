import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { lexPostgresSql } from '../helpers/sql-source-lexer.mjs';

const MIGRATION_URL = new URL(
  '../../../../supabase/migrations/20260723010000_midao_atomic_booking_approval.sql',
  import.meta.url,
);
const MIGRATION_PATH = fileURLToPath(MIGRATION_URL);
const FUNCTION_NAME = 'CREATE OR REPLACE FUNCTION PUBLIC.MIDAO_DECIDE_BOOKING_REQUEST';
const EXPECTED_PROJECTION_KEYS = [
  'BOOKINGID',
  'BOOKINGNO',
  'ORDERID',
  'STATUS',
  'GUIDEAPPROVALSTATUS',
  'PAYMENTDEADLINEAT',
  'ACTION',
];

function migrationSql() {
  assert.equal(existsSync(MIGRATION_PATH), true, `missing migration: ${MIGRATION_PATH}`);
  return readFileSync(MIGRATION_PATH, 'utf8');
}

function normalize(sql) {
  return sql.replace(/\s+/gu, ' ').trim().toUpperCase();
}

function parseContract(sql) {
  const { statements } = lexPostgresSql(sql);
  const functionStatement = statements.find((statement) => statement.startsWith(FUNCTION_NAME));
  assert.ok(functionStatement, 'atomic approval function statement must exist');

  const bodyMatch = functionStatement.match(/\$MIDAO\$([\s\S]*)\$MIDAO\$/u);
  assert.ok(bodyMatch, 'atomic approval function must use the expected dollar-quoted body');
  const body = normalize(lexPostgresSql(bodyMatch[1]).executable);
  return { body, functionStatement, statements };
}

function blockAfter(text, marker) {
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `missing block marker: ${marker}`);
  const end = text.indexOf(');', start);
  assert.ok(end >= 0, `unterminated block: ${marker}`);
  return text.slice(start, end + 2);
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function assertAtomicApprovalContract(sql) {
  const { body, functionStatement, statements } = parseContract(sql);

  assert.match(
    functionStatement,
    /^CREATE OR REPLACE FUNCTION PUBLIC\.MIDAO_DECIDE_BOOKING_REQUEST\(\s*P_BOOKING_ID UUID, P_ACTION TEXT, P_NOTE TEXT DEFAULT NULL\s*\) RETURNS JSONB LANGUAGE PLPGSQL SECURITY DEFINER SET SEARCH_PATH = PG_CATALOG AS \$MIDAO\$/u,
  );
  assert.doesNotMatch(functionStatement, /SET SEARCH_PATH = PUBLIC/iu);

  const aclStatements = statements.filter((statement) => /^(?:GRANT|REVOKE)\s/u.test(statement));
  assert.deepEqual(aclStatements, [
    'REVOKE ALL ON FUNCTION PUBLIC.MIDAO_DECIDE_BOOKING_REQUEST(UUID, TEXT, TEXT) FROM PUBLIC, ANON, AUTHENTICATED',
    'GRANT EXECUTE ON FUNCTION PUBLIC.MIDAO_DECIDE_BOOKING_REQUEST(UUID, TEXT, TEXT) TO SERVICE_ROLE',
  ]);

  for (const table of ['ORDERS', 'BOOKINGS', 'ACTIVITY_SCHEDULES', 'BOOKING_STATUS_LOGS', 'MIDAO_NOTIFICATION_OUTBOX']) {
    assert.match(body, new RegExp(`(?:FROM|UPDATE|INSERT INTO) PUBLIC\\.${table}\\b`, 'u'));
  }
  assert.doesNotMatch(body, /\b(?:BOOKINGS|B)\.SCHEDULE_ID\b/u);

  const orderLock = body.match(
    /FOR V_ORDER_CANDIDATE IN SELECT O\.\* FROM PUBLIC\.ORDERS AS O WHERE O\.BOOKING_ID = P_BOOKING_ID FOR UPDATE/u,
  );
  const bookingLock = body.match(
    /SELECT B\.\* INTO V_BOOKING FROM PUBLIC\.BOOKINGS AS B WHERE B\.ID = P_BOOKING_ID AND B\.ORDER_ID = V_ORDER\.ID FOR UPDATE/u,
  );
  const scheduleLock = body.match(
    /SELECT S\.ID INTO V_SCHEDULE_ID FROM PUBLIC\.ACTIVITY_SCHEDULES AS S WHERE S\.ID = V_ORDER\.SCHEDULE_ID FOR UPDATE/u,
  );
  assert.ok(orderLock, 'orders must be locked by reciprocal booking_id');
  assert.ok(bookingLock, 'booking must be locked by reciprocal order_id');
  assert.ok(scheduleLock, 'canonical order schedule must be locked');
  assert.ok(orderLock.index < bookingLock.index, 'orders lock must precede bookings lock');
  assert.ok(bookingLock.index < scheduleLock.index, 'bookings lock must precede schedule lock');
  assert.match(body, /V_ORDER_COUNT := V_ORDER_COUNT \+ 1/u);
  assert.match(body, /IF V_ORDER_COUNT <> 1 THEN[\s\S]*?ERRCODE = 'P0002'/u);
  assert.match(body, /IF V_ORDER\.SCHEDULE_ID IS NOT NULL THEN/u);
  assert.doesNotMatch(body, /\b(?:NOWAIT|SKIP LOCKED)\b/u);

  const validationIndexes = [
    body.indexOf('IF P_BOOKING_ID IS NULL THEN'),
    body.indexOf("IF V_ACTION IS NULL OR V_ACTION NOT IN ('APPROVE', 'REJECT') THEN"),
    body.indexOf('IF P_NOTE IS NOT NULL AND PG_CATALOG.OCTET_LENGTH(P_NOTE) > 1000 THEN'),
  ];
  assert.ok(validationIndexes.every((index) => index >= 0 && index < orderLock.index), 'input validation must precede row locks');
  assert.match(body, /V_ACTION := PG_CATALOG\.LOWER\(PG_CATALOG\.BTRIM\(P_ACTION\)\)/u);
  assert.match(body, /V_NOTE := NULLIF\(PG_CATALOG\.BTRIM\(P_NOTE\), ''\)/u);

  const scheduleGuardIndex = body.indexOf('IF V_ORDER.SCHEDULE_ID IS NOT NULL THEN');
  const pendingGuardIndex = body.indexOf('IF NOT ( V_BOOKING.GUIDE_APPROVAL_STATUS IS NOT DISTINCT FROM \'PENDING\'');
  assert.ok(pendingGuardIndex > scheduleGuardIndex, 'pending state guard must run after all locks');
  assert.match(
    body,
    /IF NOT \(\s*V_BOOKING\.GUIDE_APPROVAL_STATUS IS NOT DISTINCT FROM 'PENDING'\s+AND V_BOOKING\.STATUS IS NOT DISTINCT FROM 'DRAFT'\s+AND V_ORDER\.STATUS IS NOT DISTINCT FROM 'PENDING_PAYMENT'\s*\) THEN[\s\S]*?ERRCODE = 'P0001', MESSAGE = 'NOT_PENDING_APPROVAL'/u,
  );

  const errorCodes = [...body.matchAll(/ERRCODE = '([^']+)'/gu)].map((match) => match[1]);
  assert.deepEqual([...new Set(errorCodes)].sort(), ['22023', 'P0001', 'P0002']);
  assert.match(body, /ERRCODE = '22023', MESSAGE = 'INVALID_BOOKING_ID'/u);
  assert.match(body, /ERRCODE = '22023', MESSAGE = 'INVALID_ACTION'/u);
  assert.match(body, /ERRCODE = '22023', MESSAGE = 'INVALID_NOTE'/u);
  assert.match(body, /ERRCODE = 'P0002', MESSAGE = 'BOOKING_NOT_FOUND'/u);
  assert.match(body, /ERRCODE = 'P0002', MESSAGE = 'MIDAO_BOOKING_RELATION_INVALID'/u);
  assert.match(body, /ERRCODE = 'P0002', MESSAGE = 'MIDAO_SCHEDULE_RELATION_INVALID'/u);
  assert.doesNotMatch(body, /\b(?:SQLERRM|MESSAGE_TEXT|GET STACKED DIAGNOSTICS|RAISE NOTICE|RAISE WARNING)\b/u);
  assert.doesNotMatch(body, /RAISE EXCEPTION\s+'[^']*%/u);
  assert.doesNotMatch(body, /\b(?:COMMIT|ROLLBACK|SAVEPOINT)\b/u);
  assert.doesNotMatch(body, /\bEXCEPTION\s+WHEN\b/u);
  assert.doesNotMatch(body, /\bEXECUTE\s+(?:IMMEDIATE|FORMAT|USING)\b/u);

  const approveStart = body.indexOf("IF V_ACTION = 'APPROVE' THEN");
  const rejectStart = body.indexOf('ELSE', approveStart);
  assert.ok(approveStart >= 0 && rejectStart > approveStart, 'approve and reject branches must exist');
  const approveBlock = body.slice(approveStart, rejectStart);
  const rejectBlock = body.slice(rejectStart);
  const decidedAtIndex = body.indexOf('V_DECIDED_AT := PG_CATALOG.NOW()');
  assert.ok(decidedAtIndex > pendingGuardIndex && decidedAtIndex < approveStart, 'one decision timestamp must be captured after locking');
  assert.match(body, /V_DECIDED_AT := PG_CATALOG\.NOW\(\)/u);
  assert.match(approveBlock, /V_PAYMENT_DEADLINE_AT := V_DECIDED_AT \+ INTERVAL '24 HOURS'/u);
  assert.match(approveBlock, /UPDATE PUBLIC\.BOOKINGS SET[\s\S]*?GUIDE_APPROVAL_STATUS = 'APPROVED'[\s\S]*?STATUS = 'DRAFT'/u);
  assert.match(approveBlock, /UPDATE PUBLIC\.ORDERS SET[\s\S]*?STATUS = 'PENDING_PAYMENT'[\s\S]*?PAYMENT_DEADLINE_AT = V_PAYMENT_DEADLINE_AT/u);
  assert.match(approveBlock, /V_APPROVAL_STATUS := 'APPROVED'/u);
  assert.match(approveBlock, /V_BOOKING_STATUS := 'DRAFT'/u);
  assert.match(approveBlock, /V_ORDER_STATUS := 'PENDING_PAYMENT'/u);
  assert.match(rejectBlock, /UPDATE PUBLIC\.BOOKINGS SET[\s\S]*?GUIDE_APPROVAL_STATUS = 'REJECTED'[\s\S]*?STATUS = 'CANCELLED'/u);
  assert.match(rejectBlock, /UPDATE PUBLIC\.ORDERS SET[\s\S]*?STATUS = 'CANCELLED_BY_GUIDE'[\s\S]*?PAYMENT_DEADLINE_AT = NULL/u);
  assert.match(rejectBlock, /V_APPROVAL_STATUS := 'REJECTED'/u);
  assert.match(rejectBlock, /V_BOOKING_STATUS := 'CANCELLED'/u);
  assert.match(rejectBlock, /V_ORDER_STATUS := 'CANCELLED_BY_GUIDE'/u);

  assert.equal(countMatches(body, /INSERT INTO PUBLIC\.BOOKING_STATUS_LOGS\b/gu), 1);
  assert.equal(countMatches(body, /INSERT INTO PUBLIC\.MIDAO_NOTIFICATION_OUTBOX\b/gu), 1);
  const logBlock = blockAfter(body, 'INSERT INTO PUBLIC.BOOKING_STATUS_LOGS');
  assert.match(logBlock, /ACTOR_USER_ID, ACTOR_ROLE, REASON, METADATA/u);
  assert.match(logBlock, /NULL::UUID, 'GUIDE'/u);
  assert.match(logBlock, /GUIDE_APPROVED|GUIDE_REJECTED/u);
  assert.match(logBlock, /PG_CATALOG\.JSONB_BUILD_OBJECT\('ACTION', V_ACTION\)/u);

  const outboxBlock = blockAfter(body, 'INSERT INTO PUBLIC.MIDAO_NOTIFICATION_OUTBOX');
  assert.match(outboxBlock, /'BOOKING\.REQUEST_APPROVED'| 'BOOKING\.REQUEST_REJECTED'/u);
  assert.match(outboxBlock, /'BOOKING', P_BOOKING_ID::TEXT/u);
  for (const key of ['BOOKINGID', 'ORDERID', 'ACTION', 'GUIDEAPPROVALSTATUS', 'BOOKINGSTATUS', 'ORDERSTATUS', 'PAYMENTDEADLINEAT']) {
    assert.match(outboxBlock, new RegExp(`'${key}'`, 'u'));
  }
  assert.doesNotMatch(outboxBlock, /\b(?:NOTE|PII|EMAIL|PHONE|TOKEN|SECRET|ADMIN|INTERNAL|CONTACT|CONTACTEMAIL|P_NOTE)\b/u);

  const projection = blockAfter(body, 'RETURN PG_CATALOG.JSONB_BUILD_OBJECT');
  const projectionKeys = [...projection.matchAll(/'([A-Z][A-Z0-9]*)'\s*,/gu)].map((match) => match[1]);
  assert.deepEqual(projectionKeys, EXPECTED_PROJECTION_KEYS);
  assert.match(projection, /'BOOKINGID', P_BOOKING_ID/u);
  assert.match(projection, /'BOOKINGNO', V_BOOKING\.BOOKING_NO/u);
  assert.match(projection, /'ORDERID', V_ORDER\.ID/u);
  assert.match(projection, /'STATUS', V_BOOKING_STATUS/u);
  assert.match(projection, /'GUIDEAPPROVALSTATUS', V_APPROVAL_STATUS/u);
  assert.match(projection, /'PAYMENTDEADLINEAT', V_PAYMENT_DEADLINE_AT/u);
  assert.match(projection, /'ACTION', V_ACTION/u);
  assert.doesNotMatch(projection, /\b(?:ADMIN|INTERNAL|CONTACT|EMAIL|NOTE|SECRET|TOKEN)\b/u);
}

test('atomic approval migration file exists before any source contract is evaluated', () => {
  assert.equal(existsSync(MIGRATION_PATH), true, `missing migration: ${MIGRATION_PATH}`);
});

test('atomic approval RPC has exact signature, security posture, and service-role-only ACL', () => {
  assertAtomicApprovalContract(migrationSql());
});

test('atomic approval RPC locks reciprocal rows in orders → bookings → activity_schedules order', () => {
  assertAtomicApprovalContract(migrationSql());
});

test('atomic approval RPC validates input, guards pending state, and exposes only fixed safe errors', () => {
  assertAtomicApprovalContract(migrationSql());
});

test('atomic approval RPC covers approve and reject transitions with the fixed projection', () => {
  assertAtomicApprovalContract(migrationSql());
});

test('atomic approval RPC writes exactly one minimal status log and one safe notification outbox row', () => {
  assertAtomicApprovalContract(migrationSql());
});

test('atomic approval source contract rejects every named mutation without writing temporary fixtures', () => {
  const sql = migrationSql();
  const mutations = [
    ['missing orders lock', sql.replace('    FOR UPDATE\n  LOOP', '    -- FOR UPDATE\n  LOOP')],
    ['swapped order lock table', sql.replace(
      '    FROM public.orders AS o\n    WHERE o.booking_id = p_booking_id\n    FOR UPDATE',
      '    FROM public.bookings AS o\n    WHERE o.booking_id = p_booking_id\n    FOR UPDATE',
    )],
    ['schedule lock before booking', (() => {
      const bookingLock = `  SELECT b.*\n  INTO v_booking\n  FROM public.bookings AS b\n  WHERE b.id = p_booking_id\n    AND b.order_id = v_order.id\n  FOR UPDATE;\n\n  IF NOT FOUND THEN\n    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_BOOKING_RELATION_INVALID';\n  END IF;`;
      const scheduleLock = `  IF v_order.schedule_id IS NOT NULL THEN\n    SELECT s.id\n    INTO v_schedule_id\n    FROM public.activity_schedules AS s\n    WHERE s.id = v_order.schedule_id\n    FOR UPDATE;\n\n    IF NOT FOUND THEN\n      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_SCHEDULE_RELATION_INVALID';\n    END IF;\n  END IF;`;
      return sql.replace(`${bookingLock}\n\n${scheduleLock}`, `${scheduleLock}\n\n${bookingLock}\n\n${scheduleLock}`);
    })()],
    ['NOWAIT lock', sql.replace('FOR UPDATE;', 'FOR UPDATE NOWAIT;')],
    ['SKIP LOCKED lock', sql.replace('FOR UPDATE;', 'FOR UPDATE SKIP LOCKED;')],
    ['missing approval pending predicate', sql.replace("    v_booking.guide_approval_status IS NOT DISTINCT FROM 'pending'\n", '')],
    ['missing booking draft predicate', sql.replace("AND v_booking.status IS NOT DISTINCT FROM 'draft'", '')],
    ['missing order pending predicate', sql.replace("AND v_order.status IS NOT DISTINCT FROM 'pending_payment'", '')],
    ['pending guard changed from AND to OR', sql.replace(
      "AND v_booking.status IS NOT DISTINCT FROM 'draft'",
      "OR v_booking.status IS NOT DISTINCT FROM 'draft'",
    )],
    ['transaction control COMMIT', sql.replace('$midao$\nDECLARE', '$midao$\nCOMMIT;\nDECLARE')],
    ['transaction control SAVEPOINT', sql.replace('$midao$\nDECLARE', '$midao$\nSAVEPOINT accidental;\nDECLARE')],
    ['swallowed exception', sql.replace('$midao$\nDECLARE', '$midao$\nEXCEPTION WHEN OTHERS THEN NULL;\nDECLARE')],
    ['missing status log', sql.replace('INSERT INTO public.booking_status_logs', 'INSERT INTO public.booking_status_logz')],
    ['duplicate status log', sql.replace('INSERT INTO public.booking_status_logs', 'INSERT INTO public.booking_status_logs\n  INSERT INTO public.booking_status_logs')],
    ['missing outbox', sql.replace('INSERT INTO public.midao_notification_outbox', 'INSERT INTO public.midao_notification_outboz')],
    ['duplicate outbox', sql.replace('INSERT INTO public.midao_notification_outbox', 'INSERT INTO public.midao_notification_outbox\n  INSERT INTO public.midao_notification_outbox')],
    ['raw SQLERRM', sql.replace("MESSAGE = 'NOT_PENDING_APPROVAL'", 'MESSAGE = SQLERRM')],
    ['raw MESSAGE_TEXT', sql.replace('$midao$\nDECLARE', '$midao$\nGET STACKED DIAGNOSTICS message_text = MESSAGE_TEXT;\nDECLARE')],
    ['outbox PII', sql.replace("      'action', v_action,\n      'guideApprovalStatus'", "      'action', v_action,\n      'contactEmail', p_note,\n      'guideApprovalStatus'")],
    ['projection key removed', sql.replace("    'bookingId', p_booking_id,\n    'bookingNo'", "    'bookingNo', p_booking_id,\n    'bookingNo'")],
    ['projection source swapped', sql.replace("    'bookingId', p_booking_id,\n    'bookingNo'", "    'bookingId', v_order.id,\n    'bookingNo'")],
    ['projection note leaked', sql.replace("    'action', v_action\n  );\nEND;", "    'action', v_action,\n    'note', v_note\n  );\nEND;")],
    ['extra public execute grant', `${sql}\nGRANT EXECUTE ON FUNCTION public.midao_decide_booking_request(uuid, text, text) TO PUBLIC;`],
    ['relaxed search_path', sql.replace('SET search_path = pg_catalog', 'SET search_path = public')],
    ['relaxed anonymous ACL', sql.replace('FROM PUBLIC, anon, authenticated', 'FROM PUBLIC, anon')],
    ['relaxed authenticated ACL', sql.replace('TO service_role;', 'TO authenticated;')],
    ['commented lock cannot satisfy contract', sql.replace('    FOR UPDATE\n  LOOP', '    /* FOR UPDATE */\n  LOOP')],
  ];

  for (const [name, mutant] of mutations) {
    assert.notEqual(mutant, sql, `${name} mutation must change SQL`);
    assert.throws(() => assertAtomicApprovalContract(mutant), `${name} mutation must fail`);
  }
});

test('SQL lexer strips hostile comments while preserving the original contract', () => {
  const sql = migrationSql();
  const hostileComment = `${sql}\n/* GRANT EXECUTE ON FUNCTION public.midao_decide_booking_request(uuid, text, text) TO PUBLIC; */\n-- COMMIT;`;
  assert.doesNotThrow(() => assertAtomicApprovalContract(hostileComment));

  const lockCommented = sql.replace(
    '    FOR UPDATE\n  LOOP',
    '    /* FOR UPDATE */\n  LOOP',
  );
  assert.throws(() => assertAtomicApprovalContract(lockCommented));
});
