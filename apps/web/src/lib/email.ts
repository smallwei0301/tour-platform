/**
 * Email notification service via Resend
 *
 * Single failure contract:
 * - never throw from send* functions
 * - always return EmailDeliveryResult
 * - call sites can keep main flow success while explicitly surfacing email failures
 */

import { Resend, type CreateEmailOptions } from 'resend';

// ── Delivery logger ────────────────────────────────────────────────────────────

interface EmailLogEntry {
  fn: string;
  to: string;
  subject: string;
  orderId?: string;
  messageId?: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
  ts: string;
}

export type EmailFailureCode = 'EMAIL_PROVIDER_NOT_CONFIGURED' | 'EMAIL_SEND_FAILED';

export interface EmailDeliveryResult {
  ok: boolean;
  fn: string;
  to: string;
  subject: string;
  orderId?: string;
  status: 'sent' | 'failed' | 'skipped';
  messageId?: string;
  errorCode?: EmailFailureCode;
  errorMessage?: string;
  retriable?: boolean;
}

function logEmail(entry: EmailLogEntry): void {
  const icon = entry.status === 'sent' ? '✉️' : entry.status === 'skipped' ? '⏭️' : '❌';
  const base = `[email] ${icon} ${entry.fn} → ${entry.to} | subject="${entry.subject}"`;
  if (entry.status === 'sent') {
    console.log(`${base} | messageId=${entry.messageId} | orderId=${entry.orderId ?? '-'}`);
  } else if (entry.status === 'skipped') {
    console.log(`${base} | reason=no_api_key`);
  } else {
    console.error(`${base} | error=${entry.error}`);
  }
}

const FROM = process.env.EMAIL_FROM || 'Tour Platform <noreply@resend.dev>';

type EmailClient = { emails: { send: (args: CreateEmailOptions) => Promise<{ data: { id?: string } | null }> } };
let _resend: Resend | null = null;
let _emailClientOverride: EmailClient | null = null;

function getResend(): EmailClient | null {
  if (_emailClientOverride) return _emailClientOverride;
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// test hook
export function __setEmailClientForTest(client: EmailClient | null): void {
  _emailClientOverride = client;
}

async function sendEmailWithContract(input: {
  fn: string;
  to: string;
  subject: string;
  html: string;
  orderId?: string;
}): Promise<EmailDeliveryResult> {
  const resend = getResend();
  const base = {
    fn: input.fn,
    to: input.to,
    subject: input.subject,
    orderId: input.orderId,
  };

  if (!resend) {
    logEmail({ ...base, status: 'skipped', ts: new Date().toISOString() });
    return {
      ...base,
      ok: false,
      status: 'skipped',
      errorCode: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      errorMessage: 'RESEND_API_KEY is not configured',
      retriable: false,
    };
  }

  try {
    const result = await resend.emails.send({ from: FROM, to: input.to, subject: input.subject, html: input.html });
    logEmail({ ...base, messageId: result.data?.id, status: 'sent', ts: new Date().toISOString() });
    return {
      ...base,
      ok: true,
      status: 'sent',
      messageId: result.data?.id,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logEmail({ ...base, status: 'failed', error: errorMessage, ts: new Date().toISOString() });
    return {
      ...base,
      ok: false,
      status: 'failed',
      errorCode: 'EMAIL_SEND_FAILED',
      errorMessage,
      retriable: true,
    };
  }
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
export async function sendOrderConfirmation(data: OrderEmailData): Promise<EmailDeliveryResult> {
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

  return sendEmailWithContract({
    fn: 'sendOrderConfirmation',
    to: data.contactEmail,
    subject,
    html,
    orderId: data.orderId,
  });
}

/**
 * 付款成功 email
 */
export async function sendPaymentSuccess(data: OrderEmailData): Promise<EmailDeliveryResult> {
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

  return sendEmailWithContract({
    fn: 'sendPaymentSuccess',
    to: data.contactEmail,
    subject,
    html,
    orderId: data.orderId,
  });
}

/**
 * 管理員付款通知 email
 */
export async function sendAdminPaymentNotification(data: OrderEmailData): Promise<void> {
  const adminEmails = (process.env.ADMIN_EMAIL_ALLOWLIST || '').split(',').map(e => e.trim()).filter(Boolean);
  if (adminEmails.length === 0) return;

  const subject = `[Tour Platform] 新訂單付款確認 — ${data.activityTitle}`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">💳 收到新訂單付款</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">以下訂單已付款成功，請做後續安排。</p>
    ${orderInfoBlock(data)}
    <div style="background:#dbeafe;border-left:4px solid #3b82f6;border-radius:8px;padding:12px 16px;margin-top:16px;">
      <p style="margin:0;font-size:13px;color:#1e40af;font-weight:600;">📋 訂單 ID</p>
      <p style="margin:4px 0 0;font-size:13px;color:#1e40af;font-family:monospace;">${data.orderId}</p>
    </div>
  `);

  for (const adminEmail of adminEmails) {
    await sendEmailWithContract({
      fn: 'sendAdminPaymentNotification',
      to: adminEmail,
      subject,
      html,
      orderId: data.orderId,
    }).catch(() => {});
  }
}

/**
 * 訂單取消 email
 */
export async function sendOrderCancellation(data: OrderEmailData): Promise<EmailDeliveryResult> {
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

  return sendEmailWithContract({
    fn: 'sendOrderCancellation',
    to: data.contactEmail,
    subject,
    html,
    orderId: data.orderId,
  });
}

/**
 * 退款申請收到 email
 */
export async function sendRefundRequested(data: OrderEmailData): Promise<EmailDeliveryResult> {
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

  return sendEmailWithContract({
    fn: 'sendRefundRequested',
    to: data.contactEmail,
    subject,
    html,
    orderId: data.orderId,
  });
}

/**
 * 退款已完成 email — 僅在 REFUND_AUTO_EXECUTE 自動執行成功時發送
 */
export async function sendRefundExecuted(data: OrderEmailData): Promise<EmailDeliveryResult> {
  const subject = `【${data.activityTitle}】退款已完成`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">退款已完成 ✅</h1>
    <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">嗨 ${data.contactName || '旅客'}，</p>
    <p style="font-size:14px;color:#374151;margin:0 0 20px;">
      您的訂單退款已完成處理。款項將於 3-5 個工作天退回至原付款工具。
    </p>
    ${orderInfoBlock(data)}
    <div style="background:#d1fae5;border-left:4px solid #10b981;border-radius:8px;padding:12px 16px;margin-top:16px;">
      <p style="margin:0;font-size:13px;color:#065f46;font-weight:600;">💳 退款時間</p>
      <p style="margin:4px 0 0;font-size:13px;color:#065f46;">款項將於 3-5 個工作天退回至原付款工具。感謝您的耐心等候。</p>
    </div>
  `);

  return sendEmailWithContract({
    fn: 'sendRefundExecuted',
    to: data.contactEmail,
    subject,
    html,
    orderId: data.orderId,
  });
}
