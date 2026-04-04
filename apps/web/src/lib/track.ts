/**
 * track.ts — 前端事件追蹤 helper
 * 用法：
 *   import { track } from '@/lib/track';
 *   track({ event_name: 'view_item', properties: { item_id: '...', item_name: '...' } });
 *
 * 設計原則：
 * - fire-and-forget（不 await，不 throw，不阻塞 UX）
 * - session_id 自動產生並存入 sessionStorage
 * - 靜默失敗（console.debug only）
 */

import type { TrackRequest } from './events';

const SESSION_KEY = 'tp_session_id';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return '';
  }
}

/**
 * 發送事件到 /api/events
 * Fire-and-forget：不 await，不 throw
 */
export function track(payload: TrackRequest): void {
  if (typeof window === 'undefined') return; // SSR 不追蹤

  const body: TrackRequest = {
    ...payload,
    session_id: payload.session_id ?? getSessionId(),
    page_path: payload.page_path ?? window.location.pathname,
    referrer: payload.referrer ?? document.referrer || undefined,
  };

  // fire-and-forget
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.debug('[track] failed silently:', err);
  });
}

/**
 * Server-side track（用於 API routes，如 payment callback）
 * 需要傳入 request 物件以取得 IP / User-Agent
 */
export async function trackServer(
  payload: TrackRequest,
  req?: Request
): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // 內部呼叫帶 service token，避免被 rate limit
      'x-internal-track': process.env.INTERNAL_TRACK_SECRET ?? '',
    };
    if (req) {
      const ua = req.headers.get('user-agent') ?? '';
      const ip = req.headers.get('x-forwarded-for') ?? '';
      Object.assign(headers, {
        'x-forwarded-for': ip,
        'x-user-agent': ua,
      });
    }
    await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.debug('[trackServer] failed silently:', err);
  }
}
