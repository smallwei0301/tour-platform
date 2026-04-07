import { fail, ok } from '../../../src/lib/api';
import { createOrderDb } from '../../../src/lib/db.mjs';
import { sendOrderConfirmation } from '../../../src/lib/email';

function statusFromErrorMessage(message: string) {
  if (message.includes('not enough seats') || message.includes('schedule is full')) return 409;
  if (message.includes('not found')) return 404;
  if (message.includes('required') || message.includes('peopleCount')) return 400;
  return 400;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  try {
    const order = await createOrderDb(body);

    // 🔔 Fire-and-forget: 訂單建立確認 email
    if (order.contactEmail) {
      sendOrderConfirmation({
        orderId: order.id,
        activityTitle: order.title || body?.experienceSlug || '行程',
        scheduleDate: order.scheduleStartAt
          ? new Date(order.scheduleStartAt).toLocaleDateString('zh-TW')
          : null,
        peopleCount: order.peopleCount,
        totalTwd: order.totalTwd,
        contactName: order.contactName,
        contactEmail: order.contactEmail,
      }).catch(() => {}); // 絕對不阻塞 response
    }

    return Response.json(ok(order));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = statusFromErrorMessage(message);
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
