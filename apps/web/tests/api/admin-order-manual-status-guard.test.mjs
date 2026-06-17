/**
 * 防呆：後台訂單詳情「狀態下拉」不得手動把訂單改成需要正規流程的終端狀態。
 *
 * 背景：updateAdminOrderDb 的 lockedStatuses 只擋「目前已是 locked」的訂單，
 * 不擋「從進行中轉換成 locked」，因此維運可用下拉把 paid → refund_pending /
 * cancelled_by_guide，造成孤兒訂單（不釋放名額、不建退款記錄、之後鎖死）。
 *
 * 本檔鎖定後端 guard：cancelled_by_user / cancelled_by_guide / refund_pending /
 * refunded 必須走專用流程（取消＋退款、退款執行、旅客申請），下拉手動設定一律擋下。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOrderDb,
  updateAdminOrderDb,
  getMyOrderDetailDb,
} from '../../src/lib/db.mjs';

async function seedPaidOrder(email) {
  const order = await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 1,
    contactName: 'Manual Guard',
    contactPhone: '0900000008',
    contactEmail: email,
  });
  await updateAdminOrderDb({ orderId: order.id, status: 'paid', actor: 'admin', sourceChannel: 'admin_pos' });
  return order;
}

const BLOCKED = ['cancelled_by_user', 'cancelled_by_guide', 'refund_pending', 'refunded'];

for (const target of BLOCKED) {
  test(`下拉手動改成 ${target} 必須被擋下（manual_status_change_blocked）`, async () => {
    const order = await seedPaidOrder(`manual-guard-${target}@example.com`);
    await assert.rejects(
      () => updateAdminOrderDb({ orderId: order.id, status: target }),
      (err) => {
        assert.match(err.message, /manual_status_change_blocked/);
        return true;
      },
    );
    // 訂單狀態不得被改動
    const detail = await getMyOrderDetailDb({ orderId: order.id });
    assert.equal(detail.status, 'paid', `${target}: 被擋後訂單應維持 paid`);
  });
}

test('允許的狀態轉換（confirmed / completed / rejected）不受影響', async () => {
  const o1 = await seedPaidOrder('manual-guard-confirmed@example.com');
  const r1 = await updateAdminOrderDb({ orderId: o1.id, status: 'confirmed' });
  assert.equal(r1.status, 'confirmed');

  const o2 = await seedPaidOrder('manual-guard-completed@example.com');
  const r2 = await updateAdminOrderDb({ orderId: o2.id, status: 'completed' });
  assert.equal(r2.status, 'completed');

  const o3 = await seedPaidOrder('manual-guard-rejected@example.com');
  const r3 = await updateAdminOrderDb({ orderId: o3.id, status: 'rejected' });
  assert.equal(r3.status, 'rejected');
});

test('僅改 adminNote（未帶 status）不受 guard 影響', async () => {
  const order = await seedPaidOrder('manual-guard-note@example.com');
  const r = await updateAdminOrderDb({ orderId: order.id, adminNote: '備註更新' });
  assert.equal(r.status, 'paid');
});
