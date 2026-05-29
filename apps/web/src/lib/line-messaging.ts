/**
 * LINE Messaging API client — Tour Platform (#302b)
 *
 * Replaces the retired LINE Notify (shut down 2025-03-31) for ops/admin
 * notifications and adds per-traveler push. All functions are fire-and-forget
 * friendly: they never throw, returning a PushResult the caller can log.
 *
 * Kill-switch: LINE_MESSAGING_ENABLED (default OFF) gates every outbound call,
 * so the whole Messaging API surface can be disabled instantly.
 *
 * Env:
 * - LINE_CHANNEL_ACCESS_TOKEN — push/reply bearer
 * - LINE_OPS_GROUP_ID         — target group for ops notifications
 */

import { isLineMessagingEnabled } from '../config/feature-flags.mjs';

const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push';
const LINE_REPLY_API = 'https://api.line.me/v2/bot/message/reply';

export type LineTextMessage = { type: 'text'; text: string };
export type LineFlexMessage = { type: 'flex'; altText: string; contents: unknown };
export type LineMessage = LineTextMessage | LineFlexMessage;

export type PushStatus = 'sent' | 'skipped' | 'failed';
export interface PushResult {
  status: PushStatus;
  reason?: string;
  error?: string;
}

function toArray(messages: LineMessage | LineMessage[]): LineMessage[] {
  return Array.isArray(messages) ? messages : [messages];
}

function accessToken(): string {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
}

async function postToLine(url: string, payload: Record<string, unknown>): Promise<PushResult> {
  if (!isLineMessagingEnabled()) {
    return { status: 'skipped', reason: 'messaging_disabled' };
  }
  const token = accessToken();
  if (!token) {
    return { status: 'skipped', reason: 'no_access_token' };
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      return { status: 'sent' };
    }
    // 403 = recipient has blocked the bot / is not a friend. Treat as skip, not
    // a hard failure, so callers don't alert on an unreachable user.
    if (response.status === 403) {
      return { status: 'skipped', reason: 'forbidden' };
    }
    return { status: 'failed', error: `LINE push error: ${response.status} ${response.statusText}` };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Push one or more messages to a LINE userId/groupId. */
export async function pushMessage(to: string, messages: LineMessage | LineMessage[]): Promise<PushResult> {
  if (!to) return { status: 'skipped', reason: 'no_recipient' };
  return postToLine(LINE_PUSH_API, { to, messages: toArray(messages) });
}

/** Reply to a webhook event using its replyToken. */
export async function replyMessage(replyToken: string, messages: LineMessage | LineMessage[]): Promise<PushResult> {
  if (!replyToken) return { status: 'skipped', reason: 'no_reply_token' };
  return postToLine(LINE_REPLY_API, { replyToken, messages: toArray(messages) });
}

/** Push a plain-text notification to the ops/admin group. */
export async function pushToOps(text: string): Promise<PushResult> {
  const groupId = process.env.LINE_OPS_GROUP_ID || '';
  if (!groupId) return { status: 'skipped', reason: 'no_ops_group' };
  return pushMessage(groupId, { type: 'text', text });
}
