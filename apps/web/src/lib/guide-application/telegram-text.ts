/**
 * 嚮導申請的 Telegram 訊息組裝（pure function，無 I/O）。
 *
 * 內容＝申請表全部欄位（含未填的），欄位清單與管理者通知信、後台詳情頁同源
 * （./summary），避免三個介面各列一套而漂移。
 */
import {
  formatGuideApplicationPlainText,
  listUnfilledLabels,
  type GuideApplicationLike,
} from './summary.ts';

/** UUID 太長會把訊息撐爆，只取前 8 碼供對照（與 telegram-messages 的慣例一致）。 */
function shortId(id?: string | null): string {
  const value = String(id || '');
  return value.length > 8 ? value.slice(0, 8) : value;
}

export function buildGuideApplicationTelegramText(app: GuideApplicationLike): string {
  const name = String(app?.fullName || '').trim() || '（未具名）';
  const unfilled = listUnfilledLabels(app);
  return [
    '🧭 有人申請成為嚮導',
    '',
    formatGuideApplicationPlainText(app),
    '',
    unfilled.length
      ? `⚠️ 未填寫（${unfilled.length}）：${unfilled.join('、')}`
      : '✅ 所有欄位都已填寫',
    app?.id ? `📋 申請編號：${shortId(app.id)}` : null,
    `👉 後台「嚮導管理 → 申請」點「${name}」可審核上線`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
