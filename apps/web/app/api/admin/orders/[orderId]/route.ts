import { ok, fail } from '../../../../../src/lib/api';
import { getAdminOrderDetailDb, updateAdminOrderDb } from '../../../../../src/lib/db.mjs';
import { dispatchOrderEventTelegram } from '../../../../../src/lib/order-telegram-notify.mjs';
import { adminStatusToTelegramKind } from '../../../../../src/lib/admin-order-event-kind.mjs';

const LOCKED_STATUSES = ['refunded', 'refund_pending', 'completed', 'cancelled_by_user', 'cancelled_by_guide'] as const;

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  try {
    return Response.json(ok(await getAdminOrderDetailDb({ orderId })));
  } catch (err) {
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
    }

    return Response.json(ok(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // AC5: locked order edit → 409 Conflict (locked statuses: LOCKED_STATUSES)
    if (message.startsWith('order_edit_locked:')) {
      return Response.json(fail('ORDER_EDIT_LOCKED',
        `cannot edit order in current status (locked: ${LOCKED_STATUSES.join(', ')})`
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
