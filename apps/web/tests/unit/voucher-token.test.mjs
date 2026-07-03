/**
 * Issue #1565 — 電子憑證 QR token 純函式（HMAC 簽章）。
 * token 由 server 簽發（旅客訂單頁渲染成 QR）、由導遊核銷 API 驗證。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { signVoucherToken, verifyVoucherToken, shortCodeForOrder } = await import(
  '../../src/lib/voucher-token.mjs'
);

const SECRET = 'test-voucher-secret-0123456789abcdef0123456789';

describe('signVoucherToken / verifyVoucherToken', () => {
  it('簽發後可驗回同一 orderId', () => {
    const token = signVoucherToken('ord_abc', SECRET);
    assert.equal(verifyVoucherToken(token, SECRET), 'ord_abc');
  });

  it('token 含版本前綴 v1.', () => {
    assert.match(signVoucherToken('ord_abc', SECRET), /^v1\./);
  });

  it('竄改簽章 → 驗證失敗回 null', () => {
    const token = signVoucherToken('ord_abc', SECRET);
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    assert.equal(verifyVoucherToken(tampered, SECRET), null);
  });

  it('竄改 orderId（重簽需 secret）→ 驗證失敗', () => {
    const token = signVoucherToken('ord_abc', SECRET);
    const parts = token.split('.');
    const forged = `v1.ord_evil.${parts[2]}`;
    assert.equal(verifyVoucherToken(forged, SECRET), null);
  });

  it('錯誤 secret → 驗證失敗', () => {
    const token = signVoucherToken('ord_abc', SECRET);
    assert.equal(verifyVoucherToken(token, 'wrong-secret'), null);
  });

  it('格式錯誤/空值 → null，不丟錯', () => {
    assert.equal(verifyVoucherToken('', SECRET), null);
    assert.equal(verifyVoucherToken('garbage', SECRET), null);
    assert.equal(verifyVoucherToken('v1.only-two', SECRET), null);
    assert.equal(verifyVoucherToken(null, SECRET), null);
  });

  it('簽章為常數時間比較（不因短路提前返回）— 行為上仍正確拒絕', () => {
    const token = signVoucherToken('ord_xyz', SECRET);
    assert.equal(verifyVoucherToken(token, SECRET), 'ord_xyz');
  });
});

describe('shortCodeForOrder', () => {
  it('產生 MID- 前綴、去除易混字元的短碼，且對同 orderId 穩定', () => {
    const a = shortCodeForOrder('ord_abc');
    const b = shortCodeForOrder('ord_abc');
    assert.match(a, /^MID-[0-9A-HJ-NP-Z]{4,8}$/); // 無 I/O/0/1 之類易混字元
    assert.equal(a, b, '同 orderId 短碼需穩定');
  });

  it('不同 orderId → 不同短碼（極高機率）', () => {
    assert.notEqual(shortCodeForOrder('ord_a'), shortCodeForOrder('ord_b'));
  });
});
