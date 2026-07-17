// 通知通道 env 存在性診斷 — admin 遠端查修用。
//
// 只回報布林（旗標是否開啟、secret 是否有值），**絕不回傳 env 值本身**。
// 住在 src/config（env 直讀 ratchet 豁免區）；診斷 route 端不得直讀 process.env。
// 對應端點：GET /api/v2/admin/notification-env-status（admin auth 由 middleware 守門）。
import {
  isLineMessagingEnabled,
  isLinePushEnabled,
  isLineGuidePushEnabled,
  isTelegramNotifyEnabled,
  isTelegramGuideNotifyEnabled,
  isTelegramTravelerNotifyEnabled,
} from './feature-flags.mjs';

function hasValue(env, key) {
  const v = env[key];
  return typeof v === 'string' ? v.trim().length > 0 : !!v;
}

/**
 * 各通知通道的 env 狀態布林地圖。
 * flags＝功能旗標是否為真（isTruthy 語意）；secrets＝該變數是否有非空值。
 * @param {Record<string, string|undefined>} [env]
 */
export function getNotificationEnvStatus(env = process.env) {
  return {
    email: {
      secrets: {
        RESEND_API_KEY: hasValue(env, 'RESEND_API_KEY'),
      },
    },
    line: {
      flags: {
        LINE_MESSAGING_ENABLED: isLineMessagingEnabled(env),
        LINE_PUSH_ENABLED: isLinePushEnabled(env),
        LINE_GUIDE_PUSH_ENABLED: isLineGuidePushEnabled(env),
      },
      secrets: {
        LINE_CHANNEL_ACCESS_TOKEN: hasValue(env, 'LINE_CHANNEL_ACCESS_TOKEN'),
        LINE_OPS_GROUP_ID: hasValue(env, 'LINE_OPS_GROUP_ID'),
      },
    },
    telegram: {
      flags: {
        TELEGRAM_NOTIFY_ENABLED: isTelegramNotifyEnabled(env),
        TELEGRAM_GUIDE_NOTIFY_ENABLED: isTelegramGuideNotifyEnabled(env),
        TELEGRAM_TRAVELER_NOTIFY_ENABLED: isTelegramTravelerNotifyEnabled(env),
      },
      secrets: {
        TELEGRAM_BOT_TOKEN: hasValue(env, 'TELEGRAM_BOT_TOKEN'),
        TELEGRAM_WEBHOOK_SECRET: hasValue(env, 'TELEGRAM_WEBHOOK_SECRET'),
        TELEGRAM_BOT_USERNAME: hasValue(env, 'TELEGRAM_BOT_USERNAME'),
        TELEGRAM_ORDER_CHAT_ID: hasValue(env, 'TELEGRAM_ORDER_CHAT_ID'),
      },
    },
    // 系統告警 bot（#1215）——與訂單通知 bot 分開。
    telegramAlert: {
      secrets: {
        TELEGRAM_ALERT_BOT_TOKEN: hasValue(env, 'TELEGRAM_ALERT_BOT_TOKEN'),
        TELEGRAM_ALERT_CHAT_ID: hasValue(env, 'TELEGRAM_ALERT_CHAT_ID'),
      },
    },
  };
}
