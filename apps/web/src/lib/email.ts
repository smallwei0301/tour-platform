/**
 * Email notification service via Resend
 * Phase 9 — Tour Platform
 *
 * All functions are fire-and-forget (async, non-blocking).
 * API failures are logged but do NOT throw — they must never affect API response.
 *
 * Setup: set RESEND_API_KEY and EMAIL_FROM in .env.local
 */

import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM || 'Tour Platform <noreply@resend.dev>';

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export interface OrderEmailData {
  orderId: string;
  activityTitle: string;
  scheduleDate?: string | null;
  peopleCount?: number;
  totalTwd?: number;
  contactName?: string;
  contactEmail: string;
}

// ── HTML template helper ───────────────────────────────────────────────────────

function wrapEmail(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Noto Sans TC',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#ec4899,#f97316);padding:28px 32px;">
              <p style="margin:0;font-size:22px;font-weight:800;color:#fff;">🗺️ Tour Platform</p>
              <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">台灣在地導遊平台</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                此信由系統自動發送，請勿直接回覆。<br/>
                如有問題請聯絡 <a href="mailto:support@tourplatform.tw" style="color:#ec4899;">support@tourplatform.tw</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function orderInfoBlock(data: OrderEmailData): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin:20px 0;">
    <tr style="background:#f9fafb;">
      <td style="padding:10px 16px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;" colspan="2">訂單資訊</td>
    </tr>
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 16px;font-size:13px;color:#6b7280;width:40%;">行程名稱</td>
      <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111827;">${data.activityTitle}</td>
    </tr>
    ${data.scheduleDate ? `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 16px;font-size:13px;color:#6b7280;">出發日期</td>
      <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111827;">${data.scheduleDate}</td>
    </tr>` : ''}
    ${data.peopleCount ? `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 16px;font-size:13px;color:#6b7280;">預訂人數</td>
      <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111827;">${data.peopleCount} 人</td>
    </tr>` : ''}
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 16px;font-size:13px;color:#6b7280;">訂單編號</td>
      <td style="padding:10px 16px;font-size:11px;font-family:monospace;color:#6b7280;">${data.orderId}</td>
    </tr>
    ${data.totalTwd !== undefined ? `<tr>
      <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#111827;">金額</td>
      <td style="padding:12px 16px;font-size:16px;font-weight:800;color:#ec4899;">NT$ ${data.totalTwd.toLocaleString()}</td>
    </tr>` : ''}
  </table>`;
}

// ── Email functions ────────────────────────────────────────────────────────────

/**
 * 訂單建立確認 email
 */
export async function sendOrderConfirmation(data: OrderEmailData): Promise<void> {
  const subject = `您的預訂已建立 — ${data.activityTitle}`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">預訂建立成功 🎉</h1>
    <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">嗨 ${data.contactName || '旅客'}，</p>
    <p style="font-size:14px;color:#374151;margin:0 0 20px;">
      您的行程預訂已成功建立！請在付款期限內完成付款以確保席位。
    </p>
    ${orderInfoBlock(data)}
    <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://tour-platform.vercel.app'}/me/orders"
       style="display:inline-block;background:#ec4899;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;margin-top:8px;">
      查看我的訂單
    </a>
  `);

  try {
    await getResend()?.emails.send({
      from: FROM,
      to: data.contactEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error('[email] sendOrderConfirmation failed:', err);
  }
}

/**
 * 付款成功 email
 */
export async function sendPaymentSuccess(data: OrderEmailData): Promise<void> {
  const subject = `付款成功！預訂確認 — ${data.activityTitle}`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">付款成功 ✅</h1>
    <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">嗨 ${data.contactName || '旅客'}，</p>
    <p style="font-size:14px;color:#374151;margin:0 0 4px;">
      我們已收到您的付款，訂單已確認！導遊將會與您聯絡行程細節。
    </p>
    <p style="font-size:14px;color:#374151;margin:0 0 20px;">期待和您一起探索台灣！🌿</p>
    ${orderInfoBlock(data)}
    <div style="background:#d1fae5;border-left:4px solid #10b981;border-radius:8px;padding:12px 16px;margin-top:16px;">
      <p style="margin:0;font-size:13px;color:#065f46;font-weight:600;">📋 出發前請注意</p>
      <p style="margin:4px 0 0;font-size:13px;color:#065f46;">請準時到達集合地點，並攜帶訂單編號。如有疑問請聯絡導遊。</p>
    </div>
  `);

  try {
    await getResend()?.emails.send({
      from: FROM,
      to: data.contactEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error('[email] sendPaymentSuccess failed:', err);
  }
}

/**
 * 訂單取消 email
 */
export async function sendOrderCancellation(data: OrderEmailData): Promise<void> {
  const subject = `預訂已取消 — ${data.activityTitle}`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">訂單已取消</h1>
    <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">嗨 ${data.contactName || '旅客'}，</p>
    <p style="font-size:14px;color:#374151;margin:0 0 20px;">
      您的訂單已成功取消。如果您希望重新預訂，歡迎再次造訪我們的平台。
    </p>
    ${orderInfoBlock(data)}
    <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://tour-platform.vercel.app'}/activities"
       style="display:inline-block;background:#6b7280;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;margin-top:8px;">
      探索更多行程
    </a>
  `);

  try {
    await getResend()?.emails.send({
      from: FROM,
      to: data.contactEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error('[email] sendOrderCancellation failed:', err);
  }
}

/**
 * 退款申請收到 email
 */
export async function sendRefundRequested(data: OrderEmailData): Promise<void> {
  const subject = `退款申請已收到 — 訂單 #${data.orderId.slice(0, 8).toUpperCase()}`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">退款申請已收到 🔄</h1>
    <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">嗨 ${data.contactName || '旅客'}，</p>
    <p style="font-size:14px;color:#374151;margin:0 0 20px;">
      我們已收到您的退款申請，客服團隊將在 3-5 個工作天內完成審核。
    </p>
    ${orderInfoBlock(data)}
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-top:16px;">
      <p style="margin:0;font-size:13px;color:#92400e;font-weight:600;">⏳ 退款處理時間</p>
      <p style="margin:4px 0 0;font-size:13px;color:#92400e;">審核通過後，款項將於 3-5 個工作天退回原付款方式。</p>
    </div>
  `);

  try {
    await getResend()?.emails.send({
      from: FROM,
      to: data.contactEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error('[email] sendRefundRequested failed:', err);
  }
}
