// 免費 LINE 訂單查詢（Reply API）— Tour Platform (#302b / #926)
//
// LINE Push API（主動推播）會計入官方帳號方案額度；Reply API（回覆使用者主動傳來的
// 訊息）目前免費且不限量。本模組提供一條「pull」路徑：旅客在 OA 傳「我的訂單／付款」，
// webhook 解析意圖後用 Reply 回覆其最新訂單狀態＋付款連結 —— 零 Messaging API 額度成本。
//
// 設計：訂單／綁定查找以動態 import 取得（沿用 line-binding.mjs 慣例），讓 node:test 與
// edge 不會在載入時就拉進整個 db.mjs 相依圖。函式永不 throw —— 任何錯誤都回退成安全文案。
// PII：只用 lineUserId 反查綁定，回覆內容不落地。

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
  rejected: '❌ 已婉拒',
  completed: '🏁 已完成',
  refund_pending: '↩️ 退款處理中',
  refunded: '↩️ 已退款',
};

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

function formatDate(value) {
  if (!value) return '待確認';
  // 只取日期段，避開時區格式化相依。
  return String(value).slice(0, 10);
}

function amount(totalTwd) {
  return `NT$ ${Number(totalTwd || 0).toLocaleString('en-US')}`;
}

/**
 * 依 lineUserId 組出訂單查詢的 Reply 訊息陣列。永不 throw（Reply API 免費）。
 * @param {{ lineUserId?: string }} input
 * @returns {Promise<Array<{ type: 'text', text: string }>>}
 */
export async function buildOrderQueryReplyMessages({ lineUserId } = {}) {
  const site = baseUrl();
  const ordersUrl = `${site}/me/orders`;

  const mapping = await getLineMappingByLineUserId(lineUserId).catch(() => null);
  if (!mapping || (!mapping.userId && !mapping.contactEmail)) {
    return [{
      type: 'text',
      text: [
        '您好，這個 LINE 帳號目前尚未綁定任何訂單。',
        '',
        '請至「我的帳號」完成綁定後即可隨時查詢訂單：',
        `${site}/me/profile`,
      ].join('\n'),
    }];
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
    return [{
      type: 'text',
      text: [
        '目前查無您的訂單紀錄。',
        '',
        '想開始一趟旅程嗎？來看看這些行程：',
        `${site}/activities`,
      ].join('\n'),
    }];
  }

  const recent = rows.slice(0, 3);
  const blocks = recent.map((o) => {
    const parts = [
      `🗺️ ${o.title || '行程'}`,
      `📅 ${formatDate(o.scheduleStartAt)}　👥 ${o.peopleCount || 1} 人`,
      `${statusLabel(o.status)}　${amount(o.totalTwd)}`,
      `📋 ${shortId(o.id)}`,
    ];
    if (PENDING_STATUSES.has(o.status)) {
      parts.push(`👉 前往付款：${ordersUrl}`);
    }
    return parts.join('\n');
  });

  const header = recent.length >= rows.length
    ? `您共有 ${rows.length} 筆訂單：`
    : `您最近的 ${recent.length} 筆訂單（共 ${rows.length} 筆）：`;

  return [{
    type: 'text',
    text: [header, '', blocks.join('\n\n'), '', `查看全部訂單：${ordersUrl}`].join('\n'),
  }];
}
