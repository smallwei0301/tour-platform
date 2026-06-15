import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSocialProofQuote,
  normalizeSocialProofQuotes,
  resolveSocialProofAuthor,
  SOCIAL_PROOF_DEFAULT_AUTHOR,
} from '../../src/lib/social-proof-quotes.mjs';

test('字串（舊資料）→ author 空字串、rating 5、text 去空白、photos 空陣列', () => {
  assert.deepEqual(normalizeSocialProofQuote('  超值！下次再來  '), {
    author: '',
    rating: 5,
    text: '超值！下次再來',
    photos: [],
  });
});

test('結構化物件保留人名、星數、內容、照片（rating 夾 1–5 並四捨五入）', () => {
  assert.deepEqual(normalizeSocialProofQuote({ author: ' 小明 ', rating: 4, text: ' 很專業 ' }), {
    author: '小明',
    rating: 4,
    text: '很專業',
    photos: [],
  });
  // 照片陣列保留字串 URL、過濾非字串、上限 5 張
  assert.deepEqual(
    normalizeSocialProofQuote({ author: 'A', rating: 5, text: 'x', photos: ['u1', 2, '', 'u2'] }).photos,
    ['u1', 'u2'],
  );
  assert.equal(normalizeSocialProofQuote({ author: 'A', rating: 9, text: 'x' }).rating, 5);
  assert.equal(normalizeSocialProofQuote({ author: 'A', rating: 0, text: 'x' }).rating, 1);
  assert.equal(normalizeSocialProofQuote({ author: 'A', rating: 3.6, text: 'x' }).rating, 4);
});

test('rating 缺漏或非數字 → 預設 5', () => {
  assert.equal(normalizeSocialProofQuote({ author: 'A', text: 'x' }).rating, 5);
  assert.equal(normalizeSocialProofQuote({ author: 'A', rating: 'abc', text: 'x' }).rating, 5);
});

test('空文字／null／非物件 → 視為無效（null）', () => {
  assert.equal(normalizeSocialProofQuote(''), null);
  assert.equal(normalizeSocialProofQuote('   '), null);
  assert.equal(normalizeSocialProofQuote({ author: 'A', rating: 5, text: '   ' }), null);
  assert.equal(normalizeSocialProofQuote(null), null);
  assert.equal(normalizeSocialProofQuote(123), null);
});

test('normalizeSocialProofQuotes：混合字串與物件並過濾無效項', () => {
  const out = normalizeSocialProofQuotes([
    '舊字串',
    { author: '小華', rating: 5, text: '推薦' },
    { author: '', rating: 5, text: '' }, // 無效
    null,
  ]);
  assert.deepEqual(out, [
    { author: '', rating: 5, text: '舊字串', photos: [] },
    { author: '小華', rating: 5, text: '推薦', photos: [] },
  ]);
});

test('normalizeSocialProofQuotes：非陣列 → 空陣列', () => {
  assert.deepEqual(normalizeSocialProofQuotes(undefined), []);
  assert.deepEqual(normalizeSocialProofQuotes(null), []);
  assert.deepEqual(normalizeSocialProofQuotes('x'), []);
});

test('resolveSocialProofAuthor：空人名 fallback 為「旅客回饋」', () => {
  assert.equal(resolveSocialProofAuthor(''), SOCIAL_PROOF_DEFAULT_AUTHOR);
  assert.equal(resolveSocialProofAuthor('  '), SOCIAL_PROOF_DEFAULT_AUTHOR);
  assert.equal(resolveSocialProofAuthor('小明'), '小明');
  assert.equal(resolveSocialProofAuthor(undefined), SOCIAL_PROOF_DEFAULT_AUTHOR);
});
