/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/orders/[orderId]）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
import { reportRouteError } from '../../../../../../src/lib/route-error';
import { ok, fail } from '../../../../../../src/lib/api';
import { getAdminOrderDetailDb, updateAdminOrderDb } from '../../../../../../src/lib/db.mjs';
import { dispatchOrderEventTelegram } from '../../../../../../src/lib/order-telegram-notify.mjs';
import { adminStatusToTelegramKind } from '../../../../../../src/lib/admin-order-event-kind.mjs';
import { pushTravelerOrderEvent } from '../../../../../../src/lib/line-traveler-push.mjs';
import { pushGuideOrderEvent } from '../../../../../../src/lib/line-guide-push.mjs';

const LOCKED_STATUSES = ['refunded', 'refund_pending', 'completed', 'cancelled_by_user', 'cancelled_by_guide'] as const;

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  try {
    return Response.json(ok(await getAdminOrderDetailDb({ orderId })));
  } catch (err) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(err, { route: 'v2/admin/orders/[orderId]' });
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    // 取得變更前狀態，用來判斷狀態是否真的改變（避免重設同狀態時重複通知）。
    const before = await getAdminOrderDetailDb({ orderId }).catch((): null => null);

    const result = await updateAdminOrderDb({
      orderId,
      status: body?.status,
      adminNote: body?.adminNote,
      contactName: body?.contactName,
      contactPhone: body?.contactPhone,
      contactEmail: body?.contactEmail,
      peopleCount: body?.peopleCount,
    });

    // 🔔 Fire-and-forget：管理員手動改狀態時，比照自動化流程派送 Telegram
    //（管理員群組 + 導遊 + 旅客）。只有狀態真的改變、且該狀態對應到一個
    // 有意義的事件種類時才發送。
    const statusChanged = !!body?.status && before?.status !== result?.status;
    const kind = statusChanged ? adminStatusToTelegramKind(result?.status) : null;
    if (kind) {
      void dispatchOrderEventTelegram({
        orderId,
        kind,
        activityTitle: result?.title || undefined,
        peopleCount: result?.peopleCount,
        totalTwd: result?.totalTwd,
        experienceId: result?.experienceId || undefined,
        contactEmail: result?.contactEmail || undefined,
      }).catch(() => {});

      // 🔔 同步派送 LINE（旅客 + 導遊）；皆受後台通知矩陣與綁定/總開關約束，
      // 未綁定 / 旗標關 / 該格關閉皆自動 skip。
      void pushTravelerOrderEvent({
        kind,
        orderId,
        activityTitle: result?.title || undefined,
        peopleCount: result?.peopleCount,
        totalTwd: result?.totalTwd,
        userId: result?.userId || undefined,
        contactEmail: result?.contactEmail || undefined,
      }).catch(() => {});
      void pushGuideOrderEvent({
        kind: `guide_${kind}`,
        orderId,
        experienceId: result?.experienceId || undefined,
        activityTitle: result?.title || undefined,
        peopleCount: result?.peopleCount,
        totalTwd: result?.totalTwd,
      }).catch(() => {});
    }

    return Response.json(ok(result));
  } catch (err) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(err, { route: 'v2/admin/orders/[orderId]' });
    const message = err instanceof Error ? err.message : 'unknown error';
    // AC5: locked order edit → 409 Conflict (locked statuses: LOCKED_STATUSES)
    if (message.startsWith('order_edit_locked:')) {
      return Response.json(fail('ORDER_EDIT_LOCKED',
        `cannot edit order in current status (locked: ${LOCKED_STATUSES.join(', ')})`
      ), { status: 409 });
    }
    // 防呆：不得手動把狀態改成終端狀態（須走專用流程）→ 409
    if (message.startsWith('manual_status_change_blocked:')) {
      const target = message.split(':')[1] || '';
      return Response.json(fail('MANUAL_STATUS_CHANGE_BLOCKED',
        `不可手動將訂單狀態改為「${target}」。退款請用「取消＋退款」按鈕（進行中訂單）或「執行退款」按鈕（已是退款中）；取消請用「取消＋退款」。`
      ), { status: 409 });
    }
    // AC1.1: capacity check → 400
    if (message.startsWith('capacity insufficient')) {
      return Response.json(fail('CAPACITY_INSUFFICIENT', message), { status: 400 });
    }
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
