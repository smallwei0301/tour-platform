/**
 * Pre-tour reminder pipeline
 * Issue #341 — Tour Platform (302a)
 *
 * composePreTourReminder: pure function, Asia/Taipei timezone, h24/h1 content variants
 * sendReminder: channel abstraction (email | line_notify_admin), extensible for future push
 *
 * Risk: HIGH (pii, email, LINE notify)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReminderKind = 'h24' | 'h1';
export type ReminderChannel = 'email' | 'line_notify_admin' | 'line_push';

export interface ReminderOrder {
  contact_name: string;
  contact_email?: string;
}

export interface ReminderActivity {
  title: string;
  meeting_point: string;
  meeting_point_map_url: string;
  notices?: unknown;
}

export interface ReminderSchedule {
  start_at: string;
}

export interface ReminderPayload {
  to?: string;
  subject?: string;
  body: string;
  /** Target LINE userId for channel='line_push'. */
  lineUserId?: string;
}

// ── Timezone helper ───────────────────────────────────────────────────────────

function formatTaipeiTime(isoString: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoString));
}

function formatTaipeiDate(isoString: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString));
}

// ── Content composer ──────────────────────────────────────────────────────────

/**
 * Compose a pre-tour reminder message.
 * Pure function — no side effects, no network calls.
 *
 * h24: 24h before departure — includes meeting_point, notices, safety keywords
 * h1:  1h before departure  — includes meeting_point_map_url, formatted startTime
 */
export function composePreTourReminder(
  order: ReminderOrder,
  activity: ReminderActivity,
  schedule: ReminderSchedule,
  kind: 'h24' | 'h1'
): string {
  const startTime = formatTaipeiTime(schedule.start_at);
  const startDate = formatTaipeiDate(schedule.start_at);
  const name = order.contact_name || '旅客';

  if (kind === 'h24') {
    const noticesText = activity.notices
      ? `\n📋 注意事項／安全須知：\n${String(activity.notices)}`
      : '\n📋 安全須知：請穿著適合的服裝與鞋子，並攜帶足夠的飲用水。';

    return [
      `嗨 ${name}，明天就是您的出遊日了！`,
      '',
      `🗺️ 行程：${activity.title}`,
      `📅 出發日期：${startDate} ${startTime}（台北時間）`,
      `📍 集合地點：${activity.meeting_point}`,
      noticesText,
      '',
      '請提前 10 分鐘到達集合地點，如有任何問題請提前聯絡導遊。',
      '',
      '期待明天與您同行！🌿',
    ].join('\n');
  }

  // kind === 'h1'
  return [
    `嗨 ${name}，您的行程即將在 1 小時後出發！`,
    '',
    `🗺️ 行程：${activity.title}`,
    `⏰ 出發時間：${startTime}（台北時間）`,
    `📍 集合地點：${activity.meeting_point}`,
    `🗺️ 地圖連結：${activity.meeting_point_map_url}`,
    '',
    '請確認您已準備完畢，提前出發前往集合地點。',
    '如臨時有突發狀況請立即聯絡導遊。',
    '',
    '祝您旅途愉快！🌸',
  ].join('\n');
}

// ── Send abstraction ──────────────────────────────────────────────────────────

/**
 * sendReminder — channel abstraction allowing future channel substitution.
 *
 * channel='email'              → sends via Resend email lib
 * channel='line_notify_admin'  → sends ops alert via Messaging API (notifySystemError)
 * channel='line_push'          → per-traveler LINE Messaging API push (#302b)
 */
export async function sendReminder(
  channel: ReminderChannel,
  payload: ReminderPayload
): Promise<void> {
  if (channel === 'email') {
    // Dynamically import to avoid circular deps and allow test isolation
    const { Resend } = await import('resend');
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log('[pre-tour-reminder] email skipped: RESEND_API_KEY not configured');
      return;
    }
    const resend = new Resend(apiKey);
    const from = process.env.EMAIL_FROM || 'Midao 祕島 <noreply@resend.dev>';
    await resend.emails.send({
      from,
      to: payload.to!,
      subject: payload.subject || '出團前提醒 — Midao 祕島',
      text: payload.body,
    });
    return;
  }

  if (channel === 'line_notify_admin') {
    const { notifySystemError } = await import('./line-notify.ts');
    await notifySystemError(
      'pre_tour_reminder',
      payload.body,
      {}
    );
    return;
  }

  if (channel === 'line_push') {
    // Per-traveler push; no-op without a resolved recipient.
    if (!payload.lineUserId) return;
    const { pushMessage } = await import('./line-messaging.ts');
    await pushMessage(payload.lineUserId, [{ type: 'text', text: payload.body }]);
    return;
  }
}
