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

export type EmailFailureCode = 'EMAIL_PROVIDER_NOT_CONFIGURED' | 'EMAIL_SEND_FAILED' | 'NO_GUIDE_EMAIL';

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

const FROM = process.env.EMAIL_FROM || 'Midao 祕島 <noreply@resend.dev>';

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
              <p style="margin:0;font-size:22px;font-weight:800;color:#fff;">🗺️ Midao 祕島</p>
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
                如有問題請聯絡 <a href="mailto:midao2026@gmail.com" style="color:#ec4899;">midao2026@gmail.com</a>
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

  const subject = `[Midao 祕島] 新訂單付款確認 — ${data.activityTitle}`;
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

// ── Guide / Admin order-event notifications (#302b notification architecture) ──
// Guides receive NO email on core order events today; admins only on payment.
// These fill that gap (target architecture: every audience gets event email).

export type OrderEventEmailKind =
  | 'new_order'
  | 'payment_received'
  | 'order_cancelled'
  | 'refund_requested'
  | 'refund_executed';

const ORDER_EVENT_COPY: Record<OrderEventEmailKind, { label: string; emoji: string; note: string }> = {
  new_order: { label: '新預約（待付款）', emoji: '🆕', note: '旅客完成付款後會再通知。' },
  payment_received: { label: '訂單已付款確認', emoji: '💰', note: '名額已確認，請安排出團準備。' },
  order_cancelled: { label: '訂單已取消', emoji: '❌', note: '名額已釋出，請更新出團名單。' },
  refund_requested: { label: '退款申請', emoji: '🔄', note: '平台將進行審核，結果會再通知。' },
  refund_executed: { label: '退款已完成', emoji: '✅', note: '該名額已正式結案。' },
};

/**
 * 導遊訂單事件通知 email（無 guide email 時靜默略過）。
 * `data.to` = 導遊 email；其餘為訂單欄位。
 */
export async function sendGuideOrderNotification(
  data: OrderEmailData & { to: string; kind: OrderEventEmailKind },
): Promise<EmailDeliveryResult> {
  const to = String(data.to || '').trim();
  const copy = ORDER_EVENT_COPY[data.kind] ?? ORDER_EVENT_COPY.new_order;
  if (!to) {
    return { fn: 'sendGuideOrderNotification', to: '', subject: '', ok: false, status: 'skipped',
      errorCode: 'NO_GUIDE_EMAIL', errorMessage: 'guide email not available', retriable: false };
  }
  const subject = `[Midao 祕島｜導遊通知] ${copy.label} — ${data.activityTitle}`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">${copy.emoji} ${copy.label}</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">你負責的行程有訂單動態。</p>
    ${orderInfoBlock(data)}
    <div style="background:#eef2ff;border-left:4px solid #6366f1;border-radius:8px;padding:12px 16px;margin-top:16px;">
      <p style="margin:0;font-size:13px;color:#3730a3;">${copy.note}</p>
    </div>
  `);
  return sendEmailWithContract({ fn: 'sendGuideOrderNotification', to, subject, html, orderId: data.orderId });
}

export interface ConflictOverrideNoticeData {
  to: string; // 導遊 email
  activityTitle: string;
  startAt: string;
  endAt: string;
  reason: string;
  requiresHelper: boolean;
  guideNote?: string | null;
}

function formatTaipeiRange(startAt: string, endAt: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  };
  return `${fmt(startAt)} ~ ${fmt(endAt)}`;
}

// #1493 — 單一時間點的台灣時間格式（付款期限顯示用）。
function formatTaipeiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

/**
 * #1497 — 管理者「例外開放衝突時段」後通知導遊（無 guide email 時靜默略過）。
 * 隱私：只含導遊可見的 reason / guideNote，不含 admin_note / created_by_admin_email。
 */
export async function sendGuideConflictOverrideNotice(
  data: ConflictOverrideNoticeData,
): Promise<EmailDeliveryResult> {
  const to = String(data.to || '').trim();
  if (!to) {
    return { fn: 'sendGuideConflictOverrideNotice', to: '', subject: '', ok: false, status: 'skipped',
      errorCode: 'NO_GUIDE_EMAIL', errorMessage: 'guide email not available', retriable: false };
  }
  const subject = `[Midao 祕島｜導遊通知] 時段例外開放 — ${data.activityTitle}`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">⚠️ 時段例外開放通知</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">管理者已為你的行程例外開放一個原本與既有預約衝突的時段。</p>
    <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:8px;padding:12px 16px;margin:0 0 16px;">
      <p style="font-weight:700;color:#166534;margin:0 0 8px;">${escapeHtml(data.activityTitle)}</p>
      <p style="margin:0;font-size:13px;color:#15803d;line-height:1.7;">
        時段：${escapeHtml(formatTaipeiRange(data.startAt, data.endAt))}（台灣時間）<br/>
        原因：${escapeHtml(data.reason)}
      </p>
    </div>
    ${data.requiresHelper ? `
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:0 0 16px;">
        <p style="font-weight:700;color:#b45309;margin:0 0 4px;">需要幫手</p>
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.7;">此時段需協調幫手，請至導遊後台「待確認幫手」確認或婉拒。</p>
      </div>` : ''}
    ${data.guideNote ? `
      <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;padding:12px 16px;">
        <p style="font-weight:700;color:#1e40af;margin:0 0 4px;">管理者備註</p>
        <p style="margin:0;font-size:13px;color:#1e3a8a;line-height:1.7;">${escapeHtml(data.guideNote)}</p>
      </div>` : ''}
  `);
  return sendEmailWithContract({ fn: 'sendGuideConflictOverrideNotice', to, subject, html });
}

/**
 * 管理員訂單事件通知 email（寄給 ADMIN_EMAIL_ALLOWLIST 全員）。
 * 付款事件已由 sendAdminPaymentNotification 覆蓋，這裡補其餘事件。
 */
export async function sendAdminOrderNotification(
  data: OrderEmailData & { kind: OrderEventEmailKind },
): Promise<void> {
  const adminEmails = (process.env.ADMIN_EMAIL_ALLOWLIST || '').split(',').map((e) => e.trim()).filter(Boolean);
  if (adminEmails.length === 0) return;
  const copy = ORDER_EVENT_COPY[data.kind] ?? ORDER_EVENT_COPY.new_order;
  const subject = `[Midao 祕島｜營運] ${copy.label} — ${data.activityTitle}`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">${copy.emoji} ${copy.label}</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">以下訂單有狀態變更，請做後續安排。</p>
    ${orderInfoBlock(data)}
  `);
  for (const adminEmail of adminEmails) {
    await sendEmailWithContract({ fn: 'sendAdminOrderNotification', to: adminEmail, subject, html, orderId: data.orderId }).catch(() => {});
  }
}

// ── 導遊新行程投稿通知（給管理者的 AI 提示詞） ───────────────────────────────────

export interface GuideActivityIntakeEmailData {
  /** 行程名稱 */
  title: string;
  /** 已組裝好、可直接複製貼給 AI 的完整提示詞 */
  prompt: string;
  /** 導遊姓名（顯示用，可空） */
  guideName?: string;
  /** 導遊聯絡 email（顯示用，可空） */
  guideContactEmail?: string;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 導遊投稿新行程後，寄給 ADMIN_EMAIL_ALLOWLIST 全員。
 * 信件主體是一段可整段複製、貼給 AI 即可產出可匯入 JSON 的提示詞。
 * 回傳每位管理者的寄送結果（無管理者時回空陣列）。
 */
export async function sendGuideActivityIntakeNotification(
  data: GuideActivityIntakeEmailData,
): Promise<EmailDeliveryResult[]> {
  const adminEmails = (process.env.ADMIN_EMAIL_ALLOWLIST || '').split(',').map((e) => e.trim()).filter(Boolean);
  if (adminEmails.length === 0) return [];

  const subject = `[Midao 祕島｜新行程投稿] ${data.title}`;
  const guideLine = data.guideName || data.guideContactEmail
    ? `<p style="font-size:13px;color:#6b7280;margin:0 0 16px;">投稿導遊：${escapeHtml(data.guideName || '（未具名）')}${data.guideContactEmail ? `（${escapeHtml(data.guideContactEmail)}）` : ''}</p>`
    : '';
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">🗺️ 有導遊投稿新行程</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 4px;">行程名稱：<strong>${escapeHtml(data.title)}</strong></p>
    ${guideLine}
    <div style="background:#eef2ff;border-left:4px solid #6366f1;border-radius:8px;padding:12px 16px;margin:0 0 16px;">
      <p style="margin:0;font-size:13px;color:#3730a3;font-weight:600;">📋 使用方式</p>
      <p style="margin:4px 0 0;font-size:13px;color:#3730a3;">將下方整段提示詞複製，貼給 AI，AI 會回傳可匯入的行程 JSON；再到後台「行程編輯 → 匯入 JSON」貼上、檢查 diff 後儲存。</p>
    </div>
    <pre style="white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;color:#111827;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:0;">${escapeHtml(data.prompt)}</pre>
  `);

  const results: EmailDeliveryResult[] = [];
  for (const adminEmail of adminEmails) {
    const result = await sendEmailWithContract({
      fn: 'sendGuideActivityIntakeNotification',
      to: adminEmail,
      subject,
      html,
    }).catch((): EmailDeliveryResult => ({
      fn: 'sendGuideActivityIntakeNotification', to: adminEmail, subject,
      ok: false, status: 'failed', errorCode: 'EMAIL_SEND_FAILED', retriable: true,
    }));
    results.push(result);
  }
  return results;
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

/**
 * 旅客評價邀請 email (post-trip)
 *
 * Sent when isReviewInvitationEligible() returns true (24h+ after activity ended,
 * not cancelled/refunded/no-show/disputed). See src/lib/post-trip-eligibility.mjs.
 */
export interface ReviewInvitationData {
  contactEmail: string;
  contactName?: string;
  activityTitle: string;
  orderId: string;
  reviewUrl: string;
  /** #1408 — 老客專屬碼區塊（行銷性質，呼叫端已依 opt-in 過濾；空值不渲染） */
  returningPromoHtml?: string;
}

export async function sendReviewInvitation(data: ReviewInvitationData): Promise<EmailDeliveryResult> {
  const subject = `分享您的旅遊體驗 — ${data.activityTitle}`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">行程完成！希望聽到您的回饋 ⭐</h1>
    <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">嗨 ${data.contactName || '旅客'}，</p>
    <p style="font-size:14px;color:#374151;margin:0 0 20px;">
      感謝您參加「${data.activityTitle}」！您的評價對其他旅客與導遊都非常有幫助。
      只需 1 分鐘，分享您的真實體驗。
    </p>
    <a href="${data.reviewUrl}"
       style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;margin-bottom:20px;">
      立即評價 →
    </a>
    ${data.returningPromoHtml || ''}
    <p style="font-size:12px;color:#9ca3af;margin:0;">
      如果您不希望收到此類通知，請忽略此信。您的訂單編號：${data.orderId.slice(0, 8).toUpperCase()}
    </p>
  `);

  return sendEmailWithContract({
    fn: 'sendReviewInvitation',
    to: data.contactEmail,
    subject,
    html,
    orderId: data.orderId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// #1383 — 改期通知（交易類，不受行銷 opt-out 影響）
// ─────────────────────────────────────────────────────────────────────────────

export interface RescheduleRequestNoticeData {
  to: string;
  activityTitle: string;
  contactName?: string;
  orderId: string;
  fromStartAt?: string | null;
  toStartAt?: string | null;
}

function formatSlotTime(iso?: string | null): string {
  if (!iso) return '—';
  return String(iso).replace('T', ' ').slice(0, 16);
}

/** 旅客送出改期申請 → 通知嚮導。 */
export async function sendRescheduleRequestNotice(data: RescheduleRequestNoticeData): Promise<EmailDeliveryResult> {
  const subject = `改期申請待確認 — ${data.activityTitle}`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">有旅客申請改期 🔄</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">
      旅客 ${data.contactName || ''} 希望將「${data.activityTitle}」改期：
    </p>
    <p style="font-size:14px;color:#374151;margin:0 0 4px;">原場次：${formatSlotTime(data.fromStartAt)}</p>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">新場次：${formatSlotTime(data.toStartAt)}</p>
    <p style="font-size:13px;color:#6b7280;margin:0;">
      請於 72 小時內至嚮導後台確認或婉拒，逾時申請將自動失效、訂單維持原場次。
    </p>
  `);
  return sendEmailWithContract({ fn: 'sendRescheduleRequestNotice', to: data.to, subject, html, orderId: data.orderId });
}

export interface RescheduleDecisionNoticeData {
  to: string;
  activityTitle: string;
  contactName?: string;
  orderId: string;
  approved: boolean;
  toStartAt?: string | null;
  note?: string;
}

/** 嚮導確認/婉拒 → 通知旅客。 */
export async function sendRescheduleDecisionNotice(data: RescheduleDecisionNoticeData): Promise<EmailDeliveryResult> {
  const subject = data.approved
    ? `改期完成 — ${data.activityTitle}`
    : `改期未能成立 — ${data.activityTitle}`;
  const body = data.approved
    ? `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">改期完成 ✅</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">
      嗨 ${data.contactName || '旅客'}，您的「${data.activityTitle}」已改至新場次：
    </p>
    <p style="font-size:15px;font-weight:700;color:#111827;margin:0 0 16px;">${formatSlotTime(data.toStartAt)}</p>
    <p style="font-size:13px;color:#6b7280;margin:0;">訂單金額與內容不變，期待與您見面！</p>`
    : `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">改期未能成立</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">
      嗨 ${data.contactName || '旅客'}，很抱歉，這次的改期申請未能成立${data.note ? `（${data.note}）` : ''}。
      您的訂單維持原場次，亦可於政策時限內申請退款。
    </p>`;
  const html = wrapEmail(subject, body);
  return sendEmailWithContract({ fn: 'sendRescheduleDecisionNotice', to: data.to, subject, html, orderId: data.orderId });
}

// ─────────────────────────────────────────────────────────────────────────────
// 三種預約模式 — request plan 導遊審核結果通知（先審核後付款）
// ─────────────────────────────────────────────────────────────────────────────

export interface BookingApprovalNoticeData {
  to: string;
  activityTitle: string;
  contactName?: string;
  orderId?: string;
  note?: string;
  paymentDeadlineAt?: string | null; // #1493：審核通過後的 24h 付款期限
}

/** 導遊審核通過 → 通知旅客前往付款。 */
export async function sendBookingApprovalApproved(data: BookingApprovalNoticeData): Promise<EmailDeliveryResult> {
  const subject = `預約已通過審核，請完成付款 — ${data.activityTitle}`;
  const payUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://tour-platform.vercel.app'}/me/orders`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">導遊已確認你的預約 ✅</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">
      嗨 ${data.contactName || '旅客'}，「${data.activityTitle}」的預約申請已通過導遊審核。
      請於時限內完成付款以確認名額。
    </p>
    ${data.paymentDeadlineAt ? `<p style="font-size:14px;color:#b45309;margin:0 0 12px;">付款期限：${escapeHtml(formatTaipeiDateTime(data.paymentDeadlineAt))}（台灣時間），逾時將自動取消。</p>` : ''}
    <a href="${payUrl}"
       style="display:inline-block;background:#0f766e;color:#fff;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;">
      前往付款 →
    </a>
  `);
  return sendEmailWithContract({ fn: 'sendBookingApprovalApproved', to: data.to, subject, html, orderId: data.orderId });
}

/** 導遊婉拒 → 通知旅客。 */
export async function sendBookingApprovalRejected(data: BookingApprovalNoticeData): Promise<EmailDeliveryResult> {
  const subject = `預約申請未能成立 — ${data.activityTitle}`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">預約申請未能成立</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">
      嗨 ${data.contactName || '旅客'}，很抱歉，「${data.activityTitle}」這次的預約申請未能成立${data.note ? `（${data.note}）` : ''}。
      這筆申請尚未付款，不會產生任何費用，歡迎再挑選其他日期或行程。
    </p>
  `);
  return sendEmailWithContract({ fn: 'sendBookingApprovalRejected', to: data.to, subject, html, orderId: data.orderId });
}

export interface BookingApprovalRequestedNoticeData {
  to: string;
  activityTitle: string;
  contactName?: string;
  orderId?: string;
  startAt?: string | null;
  peopleCount?: number;
  totalTwd?: number;
}

/** 旅客送出 request 預約申請 → 通知導遊儘速審核（先審核後付款，未審核前旅客不會付款）。 */
export async function sendBookingApprovalRequested(data: BookingApprovalRequestedNoticeData): Promise<EmailDeliveryResult> {
  const subject = `新預約申請待審核 — ${data.activityTitle}`;
  const reviewUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://tour-platform.vercel.app'}/guide/bookings`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">有新的預約申請 🙋</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">
      旅客 ${data.contactName || ''} 送出「${data.activityTitle}」的預約申請：
    </p>
    <p style="font-size:14px;color:#374151;margin:0 0 4px;">預約時段：${formatSlotTime(data.startAt)}</p>
    <p style="font-size:14px;color:#374151;margin:0 0 4px;">人數：${data.peopleCount || 1} 人</p>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">金額：NT$ ${(data.totalTwd || 0).toLocaleString()}</p>
    <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">
      此行程採「先審核後付款」：旅客尚未付款，通過審核後才會收到付款通知；婉拒則直接取消申請。
    </p>
    <a href="${reviewUrl}"
       style="display:inline-block;background:#0f766e;color:#fff;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;">
      前往審核 →
    </a>
  `);
  return sendEmailWithContract({ fn: 'sendBookingApprovalRequested', to: data.to, subject, html, orderId: data.orderId });
}

// ─────────────────────────────────────────────────────────────────────────────
// #1493 — 未付款訂單付款期限通知 / 逾時取消通知
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentDeadlineNoticeData {
  to: string;
  activityTitle: string;
  contactName?: string;
  orderId?: string;
  paymentDeadlineAt: string;
}

/** 建立訂單／開放付款時：通知旅客付款連結與截止時間。 */
export async function sendPaymentDeadlineNotice(data: PaymentDeadlineNoticeData): Promise<EmailDeliveryResult> {
  const subject = `請於期限內完成付款 — ${data.activityTitle}`;
  const payUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://tour-platform.vercel.app'}/me/orders`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">預約已建立，請完成付款 🕐</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">
      嗨 ${escapeHtml(data.contactName || '旅客')}，「${escapeHtml(data.activityTitle)}」的預約已建立。
      請於 <strong>${escapeHtml(formatTaipeiDateTime(data.paymentDeadlineAt))}（台灣時間）</strong> 前完成付款，
      逾時系統將自動取消並釋出名額。
    </p>
    <a href="${payUrl}"
       style="display:inline-block;background:#0f766e;color:#fff;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;">
      前往付款 →
    </a>
  `);
  return sendEmailWithContract({ fn: 'sendPaymentDeadlineNotice', to: data.to, subject, html, orderId: data.orderId });
}

export interface UnpaidOrderCancelledData {
  to: string;
  activityTitle: string;
  contactName?: string;
  orderId?: string;
}

/** 逾時自動取消後：通知旅客訂單已取消、名額已釋出。 */
export async function sendUnpaidOrderCancelledNotice(data: UnpaidOrderCancelledData): Promise<EmailDeliveryResult> {
  const subject = `訂單已逾時自動取消 — ${data.activityTitle}`;
  const browseUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://tour-platform.vercel.app'}/activities`;
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">訂單已逾時自動取消</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">
      嗨 ${escapeHtml(data.contactName || '旅客')}，「${escapeHtml(data.activityTitle)}」這筆預約因未於付款期限內完成付款，
      已自動取消、名額已釋出。此筆未付款，不會產生任何費用，歡迎再挑選其他日期或行程。
    </p>
    <a href="${browseUrl}"
       style="display:inline-block;background:#0f766e;color:#fff;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;">
      重新挑選行程 →
    </a>
  `);
  return sendEmailWithContract({ fn: 'sendUnpaidOrderCancelledNotice', to: data.to, subject, html, orderId: data.orderId });
}

// ─────────────────────────────────────────────────────────────────────────────
// #1411 — 訂單留言通知（交易類，不受行銷 opt-out 影響）
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderMessageNoticeData {
  to: string;
  activityTitle: string;
  orderId: string;
  /** 顯示在信件中的發送者稱呼（例：旅客 王小明、您的嚮導） */
  senderLabel: string;
  /** 留言預覽（純文字，模板會做 HTML escape） */
  preview: string;
  /** 收件者點擊後前往的留言串路徑（traveler/guide 各異） */
  threadPath: string;
}

/** 留言 preview 為使用者輸入 → 進 HTML 模板前必須 escape。 */
function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 訂單留言串有新訊息 → 通知對方（traveler ↔ guide 共用）。 */
export async function sendOrderMessageNotice(data: OrderMessageNoticeData): Promise<EmailDeliveryResult> {
  const subject = `新訊息 — ${data.activityTitle}`;
  const preview = escapeHtmlText(String(data.preview || '').slice(0, 120));
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tour-platform.vercel.app';
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">您有一則新訊息 💬</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">
      ${escapeHtmlText(data.senderLabel)} 在「${escapeHtmlText(data.activityTitle)}」的訂單留言串留下了新訊息：
    </p>
    <blockquote style="font-size:14px;color:#374151;margin:0 0 16px;padding:10px 14px;border-left:3px solid #0f766e;background:#f0fdfa;border-radius:0 8px 8px 0;">
      ${preview}
    </blockquote>
    <p style="font-size:14px;margin:0 0 16px;">
      <a href="${baseUrl}${data.threadPath}" style="color:#0f766e;font-weight:700;">前往查看與回覆 →</a>
    </p>
    <p style="font-size:13px;color:#6b7280;margin:0;">行前的疑問與細節，直接在留言串裡聊最快。</p>
  `);
  return sendEmailWithContract({ fn: 'sendOrderMessageNotice', to: data.to, subject, html, orderId: data.orderId });
}

// ─────────────────────────────────────────────────────────────────────────────
// 旅客提問通知導遊（行程旅客問答 + 認識導遊頁訊息共用，交易類）
// ─────────────────────────────────────────────────────────────────────────────

export interface GuideQuestionNoticeData {
  /** 導遊 email */
  to: string;
  /** 導遊稱呼 */
  guideName: string;
  /** 提問來源：行程名稱，或「導遊頁面」 */
  sourceLabel: string;
  /** 旅客提問內容（使用者輸入，模板會做 HTML escape） */
  question: string;
}

/** 旅客送出提問／訊息 → 通知導遊到後台回覆（無導遊 email 時靜默略過）。 */
export async function sendGuideQuestionNotice(data: GuideQuestionNoticeData): Promise<EmailDeliveryResult> {
  const subject = `有旅客向您提問 — ${data.sourceLabel}`;
  const preview = escapeHtmlText(String(data.question || '').slice(0, 200));
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tour-platform.vercel.app';
  const html = wrapEmail(subject, `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">您有一則新提問 💬</h1>
    <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">嗨 ${escapeHtmlText(data.guideName || '導遊')}，</p>
    <p style="font-size:14px;color:#374151;margin:0 0 12px;">
      有旅客在「${escapeHtmlText(data.sourceLabel)}」向您提問：
    </p>
    <blockquote style="font-size:14px;color:#374151;margin:0 0 16px;padding:10px 14px;border-left:3px solid #7c3aed;background:#f5f3ff;border-radius:0 8px 8px 0;">
      ${preview}
    </blockquote>
    <p style="font-size:14px;margin:0 0 16px;">
      <a href="${baseUrl}/guide/dashboard" style="color:#7c3aed;font-weight:700;">前往後台回覆 →</a>
    </p>
    <p style="font-size:13px;color:#6b7280;margin:0;">回答並發布後，旅客即可在頁面上看到您的回覆。</p>
  `);
  return sendEmailWithContract({ fn: 'sendGuideQuestionNotice', to: data.to, subject, html });
}
