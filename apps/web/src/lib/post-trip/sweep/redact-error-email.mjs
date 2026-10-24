/**
 * #1926：上報例外前遮罩 email。
 * recordIncident 的 redactPii 只處理 metadata 的 key，原始 message 仍會寫進 Sentry／Telegram／
 * incidents.message，所以 sweep 在上報前先把 message 內的 email 換成 [email]。
 */
// 量詞設上限並先截斷輸入：無上限的 /[^\s@]+@[^\s@]+/ 在不含 @ 的長字串上是二次方複雜度（ReDoS）。
const EMAIL_RE = /[^\s@]{1,64}@[^\s@]{1,255}/g;
export const MAX_REDACT_INPUT_CHARS = 2000;
const TRUNCATED_SUFFIX = '…[truncated]';

export function redactEmailsInText(text) {
  let str = String(text ?? '');
  if (str.length > MAX_REDACT_INPUT_CHARS) {
    str = str.slice(0, MAX_REDACT_INPUT_CHARS) + TRUNCATED_SUFFIX;
  }
  return str.replace(EMAIL_RE, '[email]');
}

/** 回傳新的 Error（message 已遮罩；保留 name，不帶原 stack 以免 stack 內含 email）。 */
export function redactErrorForReport(err) {
  const message = err instanceof Error ? err.message : String(err);
  const out = new Error(redactEmailsInText(message));
  out.name = err instanceof Error ? redactEmailsInText(err.name) : 'Error';
  return out;
}
