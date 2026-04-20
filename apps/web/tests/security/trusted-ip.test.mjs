import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveTrustedClientIp, TRUSTED_IP_FALLBACK } from '../../src/lib/trusted-ip.mjs';

describe('trusted client ip resolver', () => {
  it('prefers trusted provider header and ignores spoofed x-forwarded-for', () => {
    const request = new Request('http://localhost/api/events', {
      headers: {
        'cf-connecting-ip': '198.51.100.10',
        'x-forwarded-for': '203.0.113.99',
      },
    });

    const resolved = resolveTrustedClientIp(request);
    assert.equal(resolved.ip, '198.51.100.10');
    assert.equal(resolved.source, 'cf-connecting-ip');
  });

  it('uses x-real-ip when provider header is absent', () => {
    const request = new Request('http://localhost/api/me/orders', {
      headers: {
        'x-real-ip': '192.0.2.20',
        'x-forwarded-for': '203.0.113.200',
      },
    });

    const resolved = resolveTrustedClientIp(request);
    assert.equal(resolved.ip, '192.0.2.20');
    assert.equal(resolved.source, 'x-real-ip');
  });

  it('falls back to canonical fallback ip when only untrusted forwarded header exists', () => {
    const request = new Request('http://localhost/api/events', {
      headers: {
        'x-forwarded-for': '203.0.113.50',
      },
    });

    const resolved = resolveTrustedClientIp(request);
    assert.equal(resolved.ip, TRUSTED_IP_FALLBACK);
    assert.equal(resolved.source, 'fallback');
  });
});
