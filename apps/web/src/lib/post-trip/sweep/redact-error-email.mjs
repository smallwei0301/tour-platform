/**
 * #1926：上報例外前遮罩 email。
 * recordIncident 的 redactPii 只處理 metadata 的 key，原始 message 仍會寫進 Sentry／Telegram／
 * incidents.message，所以 sweep 在上報前先把 message 內的 email 換成 [email]。
 */
const EMAIL_RE = /[^\s@]+@[^\s@]+/g;

export function redactEmailsInText(text) {
  return String(text ?? '').replace(EMAIL_RE, '[email]');
}

/** 回傳新的 Error（message 已遮罩；保留 name，不帶原 stack 以免 stack 內含 email）。 */
export function redactErrorForReport(err) {
  const message = err instanceof Error ? err.message : String(err);
  const out = new Error(redactEmailsInText(message));
  out.name = err instanceof Error ? redactEmailsInText(err.name) : 'Error';
  return out;
}
