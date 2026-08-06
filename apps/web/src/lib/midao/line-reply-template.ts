/**
 * Task 36：LINE reply template（純函式）
 *
 * 不變式：
 * - 零 IO、零環境變數讀取、零 `new Date()` / `Date.now()`；相同輸入完全決定性。
 * - 輸入型別為顯式白名單，不含 email / phone / 任何 `*Id`；即使呼叫端誤傳多餘 key
 *   也不會進入輸出。
 * - 文案可見識別碼只用 `bookingNo` / `inquiryNo`，不得使用內嵌 UUID 的 requestRef。
 * - `payment_link` 缺合法 https confirmation URL 時直接拒絕，不降級輸出付款字樣。
 */

export type LineReplyIntent = 'acknowledge' | 'approve' | 'ask_more' | 'payment_link';

export interface LineReplyTemplateInput {
  intent: LineReplyIntent;
  kind: 'booking' | 'inquiry';
  referenceNo: string | null;
  guideName: string | null;
  travelerName: string | null;
  serviceTitle: string | null;
  planName: string | null;
  startAtLocalText: string | null;
  partySize: number | null;
  totalTwd: number | null;
  confirmationUrl: string | null;
}

export interface LineReplyTemplateResult {
  intent: LineReplyIntent;
  text: string;
  shareUrl: string;
}

type InvalidLineReplyTemplateCode = 'INVALID_LINE_REPLY_INPUT' | 'PAYMENT_LINK_UNAVAILABLE';

export class InvalidLineReplyTemplateError extends TypeError {
  readonly code: InvalidLineReplyTemplateCode;

  constructor(code: InvalidLineReplyTemplateCode, message: string) {
    super(message);
    this.name = 'InvalidLineReplyTemplateError';
    this.code = code;
  }
}

export const LINE_REPLY_INTENTS: readonly LineReplyIntent[] = Object.freeze([
  'acknowledge',
  'approve',
  'ask_more',
  'payment_link',
] as const);

const LINE_SHARE_BASE = 'https://line.me/R/share?text=';
const REQUEST_KINDS = new Set(['booking', 'inquiry']);
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/u;
const PHONE_PATTERN = /\+?\d[\d\s()-]{7,}\d/u;

function invalidInput(message: string): never {
  throw new InvalidLineReplyTemplateError('INVALID_LINE_REPLY_INPUT', message);
}

function paymentLinkUnavailable(): never {
  throw new InvalidLineReplyTemplateError(
    'PAYMENT_LINK_UNAVAILABLE',
    'Confirmation link is unavailable for this request',
  );
}

/** 移除 PII / UUID 樣式片段；整段若失去內容則回 null（該句子省略）。 */
function sanitizeText(value: string | null, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') invalidInput(`${field} must be a string or null`);

  const cleaned = value
    .replace(new RegExp(UUID_PATTERN.source, 'giu'), ' ')
    .replace(new RegExp(EMAIL_PATTERN.source, 'gu'), ' ')
    .replace(new RegExp(PHONE_PATTERN.source, 'gu'), ' ')
    .replace(/[\r\n]+/gu, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

function normalizeCount(value: number | null, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    invalidInput(`${field} must be a positive integer or null`);
  }
  return value;
}

function normalizeAmount(value: number | null, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    invalidInput(`${field} must be a non-negative finite number or null`);
  }
  return value;
}

function formatTwd(amount: number): string {
  const rounded = Math.round(amount);
  const grouped = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return `NT$ ${grouped}`;
}

function resolveConfirmationUrl(value: string | null): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') invalidInput('confirmationUrl must be a string or null');

  const trimmed = value.trim();
  if (!trimmed.startsWith('https://')) return null;
  if (UUID_PATTERN.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) return null;

  return parsed.toString();
}

export function buildLineShareUrl(text: string): string {
  if (typeof text !== 'string' || text.length === 0) {
    invalidInput('share text must be a non-empty string');
  }
  return `${LINE_SHARE_BASE}${encodeURIComponent(text)}`;
}

type NormalizedInput = {
  intent: LineReplyIntent;
  kind: 'booking' | 'inquiry';
  referenceNo: string | null;
  guideName: string | null;
  travelerName: string | null;
  serviceTitle: string | null;
  planName: string | null;
  startAtLocalText: string | null;
  partySize: number | null;
  totalTwd: number | null;
  confirmationUrl: string | null;
};

function normalizeInput(input: LineReplyTemplateInput): NormalizedInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalidInput('input must be an object');
  }
  const intent = input.intent;
  if (typeof intent !== 'string' || !LINE_REPLY_INTENTS.includes(intent as LineReplyIntent)) {
    invalidInput('intent must be one of the supported LINE reply intents');
  }
  const kind = input.kind;
  if (typeof kind !== 'string' || !REQUEST_KINDS.has(kind)) {
    invalidInput('kind must be "booking" or "inquiry"');
  }

  return {
    intent: intent as LineReplyIntent,
    kind: kind as 'booking' | 'inquiry',
    referenceNo: sanitizeText(input.referenceNo ?? null, 'referenceNo'),
    guideName: sanitizeText(input.guideName ?? null, 'guideName'),
    travelerName: sanitizeText(input.travelerName ?? null, 'travelerName'),
    serviceTitle: sanitizeText(input.serviceTitle ?? null, 'serviceTitle'),
    planName: sanitizeText(input.planName ?? null, 'planName'),
    startAtLocalText: sanitizeText(input.startAtLocalText ?? null, 'startAtLocalText'),
    partySize: normalizeCount(input.partySize ?? null, 'partySize'),
    totalTwd: normalizeAmount(input.totalTwd ?? null, 'totalTwd'),
    confirmationUrl: resolveConfirmationUrl(input.confirmationUrl ?? null),
  };
}

function greetingLine(data: NormalizedInput): string | null {
  return data.travelerName ? `${data.travelerName} 您好，` : '您好，';
}

function referenceLine(data: NormalizedInput): string | null {
  if (!data.referenceNo) return null;
  const label = data.kind === 'booking' ? '預約編號' : '諮詢編號';
  return `${label}：${data.referenceNo}`;
}

function detailLines(data: NormalizedInput): string[] {
  const lines: string[] = [];
  if (data.serviceTitle) lines.push(`行程：${data.serviceTitle}`);
  if (data.planName) lines.push(`方案：${data.planName}`);
  if (data.startAtLocalText) lines.push(`時間：${data.startAtLocalText}`);
  if (data.partySize !== null) lines.push(`人數：${data.partySize} 位`);
  return lines;
}

function signatureLine(data: NormalizedInput): string | null {
  return data.guideName ? `— ${data.guideName}` : null;
}

function bodyLines(data: NormalizedInput): string[] {
  switch (data.intent) {
    case 'acknowledge':
      return ['我已收到您的需求，感謝您的預訂與信任。', '我會盡快確認可行時段後回覆您。'];
    case 'approve':
      return ['您的行程我已確認，可以順利成行。', '若行程內容有需要調整，隨時再與我說。'];
    case 'ask_more':
      return ['為了幫您安排得更合適，想再向您確認幾項資訊。', '方便的話，請補充您的偏好時段與特殊需求，謝謝您。'];
    case 'payment_link':
      return ['您的行程已確認，接下來可以完成付款以保留名額。'];
    default:
      return invalidInput('unsupported intent');
  }
}

function paymentLines(data: NormalizedInput): string[] {
  if (data.intent !== 'payment_link') return [];
  if (!data.confirmationUrl) paymentLinkUnavailable();

  const lines: string[] = [];
  if (data.totalTwd !== null) lines.push(`應付金額：${formatTwd(data.totalTwd)}`);
  lines.push(`付款連結：${data.confirmationUrl}`);
  return lines;
}

export function buildLineReplyTemplate(input: LineReplyTemplateInput): LineReplyTemplateResult {
  const data = normalizeInput(input);
  const payment = paymentLines(data);

  const blocks: string[] = [];
  const greeting = greetingLine(data);
  if (greeting) blocks.push(greeting);
  blocks.push(bodyLines(data).join('\n'));

  const reference = referenceLine(data);
  const details = detailLines(data);
  const factBlock = [reference, ...details].filter((line): line is string => Boolean(line));
  if (factBlock.length > 0) blocks.push(factBlock.join('\n'));
  if (payment.length > 0) blocks.push(payment.join('\n'));

  const signature = signatureLine(data);
  if (signature) blocks.push(signature);

  const text = blocks.join('\n\n');
  return {
    intent: data.intent,
    text,
    shareUrl: buildLineShareUrl(text),
  };
}
