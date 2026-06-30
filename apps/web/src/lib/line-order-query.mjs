// 免費 LINE 訂單查詢（Reply API，Flex 卡片）— Tour Platform (#302b / #926)
//
// LINE Push API（主動推播）會計入官方帳號方案額度；Reply API（回覆使用者主動傳來的
// 訊息）目前免費且不限量。本模組提供一條「pull」路徑：旅客在 OA 傳「我的訂單／付款」，
// webhook 解析意圖後用 Reply 回覆其最新訂單狀態＋付款連結 —— 零 Messaging API 額度成本。
//
// 回覆為 Flex 卡片：單筆用 bubble、多筆用 carousel（最多 3 筆）。不論幾個 bubble，
// 一次 Reply 仍只算一則、且 Reply 本身免費，所以升級成卡片不增加任何成本。
//
// 設計：訂單／綁定查找以動態 import 取得（沿用 line-binding.mjs 慣例），讓 node:test 與
// edge 不會在載入時就拉進整個 db.mjs 相依圖。函式永不 throw —— 任何錯誤都回退成安全卡片。
// PII：只用 lineUserId 反查本人綁定，回覆內容不落地。

import { getLineMappingByLineUserId } from './line-binding.mjs';

// 觸發訂單查詢的關鍵字（繁體中文，貼近 Midao / 祕島 語氣）。
const QUERY_KEYWORDS = [
  '我的訂單', '查訂單', '查詢訂單', '訂單查詢', '訂單狀態', '訂單',
  '我的預約', '查詢預約', '預約查詢',
  '付款', '繳費', '我要付',
];

const STATUS_LABEL = {
  pending_payment: '⏳ 待付款',
  paid: '💳 已付款',
  confirmed: '✅ 已確認',
  cancelled_by_user: '🚫 已取消',
  cancelled_by_guide: '🚫 已取消（導遊）',
  cancelled_unpaid: '⌛ 已逾時取消',
  rejected: '❌ 已婉拒',
  completed: '🏁 已完成',
  refund_pending: '↩️ 退款處理中',
  refunded: '↩️ 已退款',
};

const STATUS_COLOR = {
  pending_payment: '#f59e0b',
  paid: '#3b82f6',
  confirmed: '#10b981',
  cancelled_by_user: '#6b7280',
  cancelled_by_guide: '#6b7280',
  cancelled_unpaid: '#6b7280',
  rejected: '#ef4444',
  completed: '#8b5cf6',
  refund_pending: '#f97316',
  refunded: '#6b7280',
};

const BRAND_COLOR = '#a8511f';
const MAX_CARDS = 3;

// 仍需旅客行動（前往付款）的狀態。
const PENDING_STATUSES = new Set(['pending_payment']);

/**
 * 判斷一段使用者自由文字是否為「訂單／付款查詢」意圖。
 * 綁定碼（TBIND-/BIND-）一律不視為查詢 —— webhook 會先處理綁定，這裡只是雙重保險，
 * 避免有人把綁定碼夾在含「訂單」的句子裡時被誤導向查詢分支。
 * @param {unknown} text
 * @returns {boolean}
 */
export function parseOrderQueryIntent(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/(?:TBIND|BIND)-[A-Z0-9]{6}/i.test(t)) return false;
  return QUERY_KEYWORDS.some((kw) => t.includes(kw));
}

function baseUrl() {
  const raw = String(process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  return raw || 'https://midao.tw';
}

function shortId(id) {
  return String(id || '').slice(0, 8).toUpperCase();
}

function statusLabel(status) {
  return STATUS_LABEL[status] || status || '處理中';
}

function statusColor(status) {
  return STATUS_COLOR[status] || '#6b7280';
}

function formatDate(value) {
  if (!value) return '待確認';
  // 只取日期段，避開時區格式化相依。
  return String(value).slice(0, 10);
}

function amount(totalTwd) {
  return `NT$ ${Number(totalTwd || 0).toLocaleString('en-US')}`;
}

function flex(altText, contents) {
  return [{ type: 'flex', altText: altText.slice(0, 400), contents }];
}

function kvRow(label, value) {
  return {
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, color: '#8c8c8c', size: 'sm', flex: 2 },
      { type: 'text', text: value, color: '#333333', size: 'sm', flex: 5, wrap: true, align: 'end' },
    ],
  };
}

function linkButton(label, uri, { primary = false } = {}) {
  return {
    type: 'button',
    style: primary ? 'primary' : 'secondary',
    height: 'sm',
    color: primary ? BRAND_COLOR : undefined,
    action: { type: 'uri', label, uri },
  };
}

function orderBubble(o, ordersUrl) {
  const pending = PENDING_STATUSES.has(o.status);
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: BRAND_COLOR,
      paddingAll: '16px',
      contents: [
        { type: 'text', text: o.title || '行程', color: '#ffffff', weight: 'bold', size: 'lg', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        {
          type: 'box',
          layout: 'baseline',
          contents: [
            { type: 'text', text: statusLabel(o.status), color: statusColor(o.status), weight: 'bold', size: 'md', flex: 0 },
            { type: 'text', text: amount(o.totalTwd), align: 'end', weight: 'bold', size: 'md', color: BRAND_COLOR },
          ],
        },
        { type: 'separator', margin: 'md' },
        kvRow('📅 日期', formatDate(o.scheduleStartAt)),
        kvRow('👥 人數', `${o.peopleCount || 1} 人`),
        kvRow('📋 訂單', shortId(o.id)),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        pending ? linkButton('前往付款', ordersUrl, { primary: true }) : linkButton('查看訂單', ordersUrl),
      ],
    },
  };
}

function infoBubble({ title, body, buttonLabel, buttonUri }) {
  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true, color: '#333333' },
        { type: 'text', text: body, size: 'sm', color: '#666666', wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [linkButton(buttonLabel, buttonUri, { primary: true })],
    },
  };
}

/**
 * 依 lineUserId 組出訂單查詢的 Reply 訊息（Flex）。永不 throw（Reply API 免費）。
 * @param {{ lineUserId?: string }} input
 * @returns {Promise<Array<{ type: 'flex', altText: string, contents: object }>>}
 */
export async function buildOrderQueryReplyMessages({ lineUserId } = {}) {
  const site = baseUrl();
  const ordersUrl = `${site}/me/orders`;

  const mapping = await getLineMappingByLineUserId(lineUserId).catch(() => null);
  if (!mapping || (!mapping.userId && !mapping.contactEmail)) {
    // 綁定唯一入口：未綁定者按「我的訂單／付款」皆落到這張卡，引導完成綁定。
    return flex(
      '這個 LINE 帳號還沒綁定，完成綁定即可查詢訂單與付款。',
      infoBubble({
        title: '先綁定，才能查訂單',
        body: [
          '這個 LINE 帳號還沒綁定訂單。完成綁定後，就能在這裡隨時查詢訂單狀態與付款。',
          '',
          '綁定方式：',
          '1️⃣ 點下方按鈕登入「我的帳號」',
          '2️⃣ 產生綁定碼（TBIND-…）',
          '3️⃣ 把綁定碼貼回這個聊天室傳給我',
        ].join('\n'),
        buttonLabel: '前往綁定',
        buttonUri: `${site}/me/profile`,
      }),
    );
  }

  let rows = [];
  try {
    const { listMyOrdersDb } = await import('./db.mjs');
    rows = await listMyOrdersDb({
      userId: mapping.userId || null,
      contactEmail: mapping.contactEmail || null,
    });
  } catch {
    rows = [];
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return flex(
      '目前查無您的訂單紀錄。',
      infoBubble({
        title: '查無訂單',
        body: '目前查無您的訂單紀錄。想開始一趟旅程嗎？來看看我們的行程吧！',
        buttonLabel: '探索行程',
        buttonUri: `${site}/activities`,
      }),
    );
  }

  const recent = rows.slice(0, MAX_CARDS);
  const bubbles = recent.map((o) => orderBubble(o, ordersUrl));
  const contents = bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles };

  const top = recent[0];
  const altParts = [
    rows.length > recent.length
      ? `您最近的 ${recent.length} 筆訂單（共 ${rows.length} 筆）`
      : `您共有 ${rows.length} 筆訂單`,
    `最新：${top.title || '行程'} ${statusLabel(top.status)}`,
  ];
  return flex(altParts.join('｜'), contents);
}
