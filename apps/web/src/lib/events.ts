/**
 * Event Tracking Types — TP-001
 * 所有事件名稱與 payload 型別定義
 */

// ── 事件名稱 ────────────────────────────────────────────────────────────────

export type EventName =
  | 'page_view'
  | 'view_item_list'
  | 'select_item'
  | 'view_item'
  | 'begin_checkout'
  | 'purchase_intent'
  | 'payment_callback_received'
  | 'payment_succeeded'
  | 'error';

// ── 各事件 properties ────────────────────────────────────────────────────────

export interface PageViewProperties {
  title?: string;
  path: string;
}

export interface ViewItemListProperties {
  items: Array<{ id: string; name: string; price?: number }>;
  count: number;
}

export interface SelectItemProperties {
  item_id: string;
  item_name: string;
  position?: number; // 在列表中的位置（0-indexed）
}

export interface ViewItemProperties {
  item_id: string;
  item_name: string;
  price?: number;
  guide_id?: string;
}

export interface BeginCheckoutProperties {
  item_id: string;
  item_name?: string;
  schedule_id: string;
  price?: number;
}

export interface PurchaseIntentProperties {
  order_id?: string;
  amount: number;
  schedule_id?: string;
  item_id?: string;
  item_name?: string;
}

export interface PaymentCallbackReceivedProperties {
  order_id: string;
  trade_no: string;
  raw_result_code?: string;
}

export interface PaymentSucceededProperties {
  order_id: string;
  amount: number;
  payment_provider?: string;
}

export interface ErrorProperties {
  message: string;
  stack_summary?: string;
  context?: string; // 發生在哪個操作
}

// ── Event union type ─────────────────────────────────────────────────────────

export type TrackEventPayload =
  | { event_name: 'page_view'; properties: PageViewProperties }
  | { event_name: 'view_item_list'; properties: ViewItemListProperties }
  | { event_name: 'select_item'; properties: SelectItemProperties }
  | { event_name: 'view_item'; properties: ViewItemProperties }
  | { event_name: 'begin_checkout'; properties: BeginCheckoutProperties }
  | { event_name: 'purchase_intent'; properties: PurchaseIntentProperties }
  | { event_name: 'payment_callback_received'; properties: PaymentCallbackReceivedProperties }
  | { event_name: 'payment_succeeded'; properties: PaymentSucceededProperties }
  | { event_name: 'error'; properties: ErrorProperties; error_code?: string };

// ── API request body ─────────────────────────────────────────────────────────

export type TrackRequest = TrackEventPayload & {
  session_id?: string;
  contact_email?: string;
  order_id?: string;
  activity_id?: string;
  schedule_id?: string;
  page_path?: string;
  referrer?: string;
  // UTM（從 getStoredUtm() 帶入）
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

// ── DB insert row type ───────────────────────────────────────────────────────

export interface EventInsert {
  event_name: EventName;
  session_id?: string | null;
  contact_email?: string | null;
  order_id?: string | null;
  activity_id?: string | null;
  schedule_id?: string | null;
  properties: Record<string, unknown>;
  error_code?: string | null;
  page_path?: string | null;
  referrer?: string | null;
  user_agent?: string | null;
  ip_hash?: string | null;
  // UTM 欄位（009_events_utm migration）
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
}
