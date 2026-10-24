/**
 * #1916：同一次使用者操作必須重用同一把 idempotency-key。
 *
 * 每次呼叫 requests.api 都產生新 key，server 端的冪等（決策／轉單 replay）永遠不會命中。
 * 這裡提供與 React 無關的純函式，讓元件用 useRef 保存 key，並可直接做行為測試。
 */

export interface IdempotencyKeyRef {
  current: string | null;
}

export interface PayloadKeyState {
  key: string;
  fingerprint: string;
}

export interface PayloadKeyRef {
  current: PayloadKeyState | null;
}

function newKey(): string {
  return crypto.randomUUID();
}

/** 沒有 key 才產生；重試時沿用同一把。 */
export function getOrCreateKey(ref: IdempotencyKeyRef): string {
  if (!ref.current) ref.current = newKey();
  return ref.current;
}

/** 操作結束（成功、取消、action 改變）後清掉，下一次操作才會換新 key。 */
export function resetKey(ref: IdempotencyKeyRef | PayloadKeyRef): void {
  ref.current = null;
}

/**
 * 同 key 不同 payload 在 server 端會回 409 IDEMPOTENCY_CONFLICT，
 * 所以 payload 內容一變就必須換新 key；內容不變（純重試）才沿用。
 */
export function getKeyForPayload(ref: PayloadKeyRef, payload: unknown): string {
  const fingerprint = JSON.stringify(payload);
  if (!ref.current || ref.current.fingerprint !== fingerprint) {
    ref.current = { key: newKey(), fingerprint };
  }
  return ref.current.key;
}

/**
 * decide 實際送出的 body 就是 fingerprint：approve 只有 action，reject 帶 trim 後的 note
 * （與 requests.api 的 `note?.trim() || ''` 一致）。
 */
export function decideFingerprint(input: { action: 'approve' | 'reject'; note?: string }): string {
  return JSON.stringify(
    input.action === 'reject'
      ? { action: input.action, note: input.note?.trim() || '' }
      : { action: input.action },
  );
}

/** convert 每個會送出的欄位都納入；guideNote 以 trim 後的值比對，與實際送出的 body 一致。 */
export function conversionFingerprint(form: {
  inquiryId: string;
  activityPlanId: string;
  confirmationTtlHours: number;
  endAt: string;
  participants: number;
  quotedTotalTwd: number;
  startAt: string;
  guideNote?: string;
}): string {
  return JSON.stringify({
    inquiryId: form.inquiryId,
    activityPlanId: form.activityPlanId,
    confirmationTtlHours: form.confirmationTtlHours,
    endAt: form.endAt,
    participants: form.participants,
    quotedTotalTwd: form.quotedTotalTwd,
    startAt: form.startAt,
    guideNote: form.guideNote?.trim() || '',
  });
}
