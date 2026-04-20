/**
 * POST /api/events
 * 接收前端事件，寫入 Supabase events table
 *
 * 設計原則：
 * - 永遠回 200（不讓追蹤失敗影響主流程）
 * - 驗證 event_name 白名單
 * - IP 做 SHA-256 匿名化
 * - user_agent 只保留前 120 字元
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { EventInsert, EventName } from '../../../src/lib/events';
import type { UtmParams } from '../../../src/lib/utm';
import { eventsLimiter, createRateLimitResponse, RateLimiter } from '../../../src/lib/rate-limit';

const VALID_EVENTS: EventName[] = [
  'page_view',
  'view_item_list',
  'select_item',
  'view_item',
  'begin_checkout',
  'purchase_intent',
  'payment_callback_received',
  'payment_succeeded',
  'booking_page_view',
  'booking_v2_fallback_clicked',
  'error',
];

function hashIp(ip: string): string {
  if (!ip) return '';
  return createHash('sha256').update(ip).digest('hex');
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('Supabase env vars missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  // Rate limiting: 50 requests/min per IP
  const clientIp = RateLimiter.getClientIp(req);
  const rlResult = eventsLimiter.check(clientIp);
  const rlResponse = createRateLimitResponse(rlResult);
  if (rlResponse) return rlResponse;

  // 永遠回 200 — 追蹤失敗不能影響主流程
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, reason: 'invalid body' }, { status: 200 });
    }

    const { event_name, properties, session_id, contact_email,
            order_id, activity_id, schedule_id, page_path,
            referrer, error_code,
            utm_source, utm_medium, utm_campaign, utm_content, utm_term } = body;

    // 驗證 event_name
    if (!VALID_EVENTS.includes(event_name)) {
      return NextResponse.json({ ok: false, reason: 'unknown event' }, { status: 200 });
    }

    // 取得 IP（匿名化）
    const ip_hash = clientIp ? hashIp(clientIp) : null;

    // User-Agent（截短）
    const ua = ((req.headers.get('user-agent') ?? '').slice(0, 120)) || null;

    // UTM：優先從 top-level 欄位讀，fallback 從 properties 讀（checkout 舊版寫在 properties 內）
    const props = (properties ?? {}) as Record<string, unknown>;
    const resolvedUtm: UtmParams = {
      utm_source:   (utm_source   ?? props.utm_source   ?? null) as string | undefined,
      utm_medium:   (utm_medium   ?? props.utm_medium   ?? null) as string | undefined,
      utm_campaign: (utm_campaign ?? props.utm_campaign ?? null) as string | undefined,
      utm_content:  (utm_content  ?? props.utm_content  ?? null) as string | undefined,
      utm_term:     (utm_term     ?? props.utm_term     ?? null) as string | undefined,
    };

    const row: EventInsert = {
      event_name,
      session_id: session_id || null,
      contact_email: contact_email || null,
      order_id: order_id || null,
      activity_id: activity_id || null,
      schedule_id: schedule_id || null,
      properties: props,
      error_code: error_code || null,
      page_path: page_path || null,
      referrer: referrer || null,
      user_agent: ua,
      ip_hash,
      // UTM 欄位（009_events_utm migration 新增）
      utm_source:   resolvedUtm.utm_source   || null,
      utm_medium:   resolvedUtm.utm_medium   || null,
      utm_campaign: resolvedUtm.utm_campaign || null,
      utm_content:  resolvedUtm.utm_content  || null,
      utm_term:     resolvedUtm.utm_term     || null,
    };

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('events').insert(row);

    if (error) {
      // 記錄但不回 5xx
      console.error('[/api/events] insert error:', error.message);
      return NextResponse.json({ ok: false, reason: 'db_error' }, { status: 200 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[/api/events] unexpected error:', err);
    return NextResponse.json({ ok: false, reason: 'internal' }, { status: 200 });
  }
}
