import assert from 'node:assert/strict';
import test from 'node:test';

const {
  LINE_REPLY_INTENTS,
  InvalidLineReplyTemplateError,
  buildLineReplyTemplate,
  buildLineShareUrl,
} = await import('../../src/lib/midao/line-reply-template.ts');

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const EMAIL_REGEX = /[^\s@]+@[^\s@]+/u;
const PHONE_REGEX = /(?:\+?\d[\d\s()-]{7,}\d)/u;
const CONFIRMATION_URL = 'https://tour-platform-nine.vercel.app/booking/confirm/example-token';

function bookingInput(overrides = {}) {
  return {
    intent: 'acknowledge',
    kind: 'booking',
    referenceNo: 'BK-1111',
    guideName: '林導遊',
    travelerName: '王小明',
    serviceTitle: '島嶼散步',
    planName: '半日方案',
    startAtLocalText: '2026年8月1日 上午10:00',
    partySize: 2,
    totalTwd: 3600,
    confirmationUrl: null,
    ...overrides,
  };
}

function inquiryInput(overrides = {}) {
  return bookingInput({
    kind: 'inquiry',
    referenceNo: 'IQ-2222',
    serviceTitle: null,
    planName: null,
    totalTwd: null,
    ...overrides,
  });
}

test('LINE_REPLY_INTENTS 恰為四種意圖', () => {
  assert.deepEqual([...LINE_REPLY_INTENTS], ['acknowledge', 'approve', 'ask_more', 'payment_link']);
});

test('acknowledge 產生已收到需求的繁中文案並帶入可見識別碼', () => {
  const result = buildLineReplyTemplate(bookingInput());

  assert.equal(result.intent, 'acknowledge');
  assert.match(result.text, /已收到/u);
  assert.match(result.text, /BK-1111/u);
  assert.match(result.text, /島嶼散步/u);
  assert.match(result.text, /王小明/u);
  assert.match(result.text, /林導遊/u);
  assert.doesNotMatch(result.text, /付款|匯款|刷卡/u);
  assert.equal(result.shareUrl, buildLineShareUrl(result.text));
});

test('approve 產生確認成行文案', () => {
  const result = buildLineReplyTemplate(bookingInput({ intent: 'approve' }));

  assert.equal(result.intent, 'approve');
  assert.match(result.text, /已確認/u);
  assert.match(result.text, /2026年8月1日 上午10:00/u);
  assert.match(result.text, /2 位/u);
});

test('ask_more 產生詢問補充資訊文案', () => {
  const result = buildLineReplyTemplate(bookingInput({ intent: 'ask_more' }));

  assert.equal(result.intent, 'ask_more');
  assert.match(result.text, /確認|補充/u);
  assert.doesNotMatch(result.text, /付款|匯款/u);
});

test('payment_link 在具備合法 https confirmation URL 時輸出付款連結', () => {
  const result = buildLineReplyTemplate(
    bookingInput({ intent: 'payment_link', confirmationUrl: CONFIRMATION_URL }),
  );

  assert.equal(result.intent, 'payment_link');
  assert.equal(new URL(CONFIRMATION_URL).pathname, '/booking/confirm/example-token');
  assert.match(result.text, /付款/u);
  assert.ok(result.text.includes(CONFIRMATION_URL));
  assert.doesNotMatch(result.text, /\/api\/v2\/me\/booking-confirmations\/.*\/accept/u);
  assert.match(result.text, /NT\$ 3,600/u);
});

test('inquiry 缺欄位時整段省略，不輸出 null/undefined 佔位', () => {
  const result = buildLineReplyTemplate(inquiryInput());

  assert.match(result.text, /IQ-2222/u);
  assert.doesNotMatch(result.text, /null|undefined|\{\}|：\s*$/u);
  assert.doesNotMatch(result.text, /行程：/u);
  assert.doesNotMatch(result.text, /方案：/u);
  assert.doesNotMatch(result.text, /金額/u);
});

test('未知或缺漏 intent 丟 INVALID_LINE_REPLY_INPUT', () => {
  for (const intent of ['unknown', '', null, undefined, 'ACKNOWLEDGE', 42]) {
    assert.throws(
      () => buildLineReplyTemplate(bookingInput({ intent })),
      (error) => error instanceof InvalidLineReplyTemplateError
        && error.code === 'INVALID_LINE_REPLY_INPUT',
      String(intent),
    );
  }
});

test('未知 kind 或非法欄位型別丟 INVALID_LINE_REPLY_INPUT', () => {
  const badInputs = [
    bookingInput({ kind: 'order' }),
    bookingInput({ referenceNo: 123 }),
    bookingInput({ travelerName: {} }),
    bookingInput({ partySize: 'two' }),
    bookingInput({ partySize: 1.5 }),
    bookingInput({ totalTwd: Number.NaN }),
    null,
    'not-an-object',
  ];

  for (const input of badInputs) {
    assert.throws(
      () => buildLineReplyTemplate(input),
      (error) => error instanceof InvalidLineReplyTemplateError
        && error.code === 'INVALID_LINE_REPLY_INPUT',
      JSON.stringify(input),
    );
  }
});

test('buildLineShareUrl 逐字使用 line.me/R/share 並完整 URL encode', () => {
  const text = '你好 & 世界 #標籤\n第二行';
  const url = buildLineShareUrl(text);

  assert.equal(url, `https://line.me/R/share?text=${encodeURIComponent(text)}`);
  assert.ok(url.startsWith('https://line.me/R/share?text='));
  assert.ok(url.includes('%26'));
  assert.ok(url.includes('%23'));
  assert.ok(url.includes('%0A'));
  assert.ok(url.includes('%20'));
  assert.doesNotMatch(url.slice('https://line.me/R/share?text='.length), /[ &#\n]/u);
  assert.equal(decodeURIComponent(url.slice('https://line.me/R/share?text='.length)), text);
});

test('buildLineShareUrl 拒絕非字串輸入', () => {
  for (const value of [null, undefined, 42, {}]) {
    assert.throws(
      () => buildLineShareUrl(value),
      (error) => error instanceof InvalidLineReplyTemplateError
        && error.code === 'INVALID_LINE_REPLY_INPUT',
    );
  }
});

test('輸出的 text 與 shareUrl 皆不含任何內部 UUID', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  for (const intent of LINE_REPLY_INTENTS) {
    const result = buildLineReplyTemplate(bookingInput({
      intent,
      referenceNo: uuid,
      travelerName: `王小明 ${uuid}`,
      serviceTitle: `島嶼散步 ${uuid.toUpperCase()}`,
      guideName: `林導遊 ${uuid}`,
      confirmationUrl: CONFIRMATION_URL,
    }));

    assert.equal(result.text.match(UUID_REGEX), null, `${intent} text`);
    assert.equal(result.shareUrl.match(UUID_REGEX), null, `${intent} shareUrl`);
    assert.equal(decodeURIComponent(result.shareUrl.split('text=')[1]).match(UUID_REGEX), null, intent);
  }
});

test('payment_link 的 confirmationUrl 含 UUID 時視為不可用', () => {
  assert.throws(
    () => buildLineReplyTemplate(bookingInput({
      intent: 'payment_link',
      confirmationUrl: 'https://example.test/me/orders/11111111-1111-4111-8111-111111111111',
    })),
    (error) => error instanceof InvalidLineReplyTemplateError
      && error.code === 'PAYMENT_LINK_UNAVAILABLE',
  );
});

test('敵意 PII 輸入不會出現在輸出（email／phone）', () => {
  for (const intent of LINE_REPLY_INTENTS) {
    const result = buildLineReplyTemplate(bookingInput({
      intent,
      travelerName: '王小明 traveler@example.com',
      guideName: '林導遊 0912345678',
      serviceTitle: '島嶼散步 +886 912 345 678',
      planName: '半日方案 evil.person@mail.example.org',
      referenceNo: 'BK-1111',
      confirmationUrl: CONFIRMATION_URL,
      contactEmail: 'leak@example.com',
      contactPhone: '0987654321',
      bookingId: '11111111-1111-4111-8111-111111111111',
      orderId: '22222222-2222-4222-8222-222222222222',
    }));

    const decoded = decodeURIComponent(result.shareUrl.split('text=')[1]);
    for (const value of [result.text, decoded]) {
      assert.doesNotMatch(value, EMAIL_REGEX, `${intent} email`);
      assert.doesNotMatch(value, PHONE_REGEX, `${intent} phone`);
      assert.doesNotMatch(value, /leak@example\.com|0987654321/u, `${intent} extra keys`);
      assert.equal(value.match(UUID_REGEX), null, `${intent} uuid`);
    }
    assert.match(result.text, /王小明/u);
  }
});

test('payment_link 缺合法 confirmation URL 時直接拒絕且不輸出任何付款字樣', () => {
  for (const confirmationUrl of [null, '', '   ', 'http://example.test/me/orders', '/me/orders', 'javascript:alert(1)', 'ftp://example.test']) {
    assert.throws(
      () => buildLineReplyTemplate(bookingInput({ intent: 'payment_link', confirmationUrl })),
      (error) => error instanceof InvalidLineReplyTemplateError
        && error.code === 'PAYMENT_LINK_UNAVAILABLE'
        && !/付款|http/u.test(String(error.message)),
      String(confirmationUrl),
    );
  }
});

test('非 payment_link 意圖即使帶入 confirmationUrl 也不輸出付款連結', () => {
  for (const intent of ['acknowledge', 'approve', 'ask_more']) {
    const result = buildLineReplyTemplate(bookingInput({ intent, confirmationUrl: CONFIRMATION_URL }));
    assert.ok(!result.text.includes(CONFIRMATION_URL), intent);
    assert.doesNotMatch(result.text, /付款/u, intent);
  }
});

test('相同輸入完全決定性（純函式、零時鐘、零 env）', () => {
  const first = buildLineReplyTemplate(bookingInput({ intent: 'payment_link', confirmationUrl: CONFIRMATION_URL }));
  const second = buildLineReplyTemplate(bookingInput({ intent: 'payment_link', confirmationUrl: CONFIRMATION_URL }));
  assert.deepEqual(first, second);
});
