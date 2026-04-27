import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlPath = new URL('../../scripts/sql/fk_precheck_164.sql', import.meta.url);
const fixturePath = new URL('./fixtures/fk-precheck-164-observed-summary.txt', import.meta.url);

function parseCsv(text) {
  const [header, ...rows] = text.trim().split('\n');
  const keys = header.split(',');
  return rows.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  });
}

test('fk precheck SQL aligns to real schema-only relations', () => {
  const sql = fs.readFileSync(sqlPath, 'utf8');

  assert.match(sql, /bookings\.order_id/);
  assert.match(sql, /orders\.booking_id/);
  assert.match(sql, /payments\.order_id/);

  assert.doesNotMatch(sql, /payments\.booking_id/);
});

test('fixture keeps observational facts (not auto-errors)', () => {
  const fixture = fs.readFileSync(fixturePath, 'utf8');
  const rows = parseCsv(fixture);

  const bookings = rows.find((r) => r.relation === 'bookings.order_id');
  const orders = rows.find((r) => r.relation === 'orders.booking_id');
  const payments = rows.find((r) => r.relation === 'payments.order_id');

  assert.equal(bookings.total_rows, '0');
  assert.equal(bookings.orphan_count, '0');

  assert.equal(orders.total_rows, '32');
  assert.equal(orders.null_or_blank, '32');
  assert.equal(orders.orphan_count, '0');

  assert.equal(payments.total_rows, '11');
  assert.equal(payments.orphan_count, '0');
});
