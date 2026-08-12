import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createHttpCookieJar } from '../integration/support/http-cookie-jar.mjs';

function responseWithSetCookies(...setCookies) {
  return {
    headers: {
      getSetCookie: () => setCookies,
      get: () => null,
    },
  };
}

describe('createHttpCookieJar', () => {
  it('stores a normal Set-Cookie and serializes it for a Cookie header', () => {
    const jar = createHttpCookieJar();

    jar.add(responseWithSetCookies('tp_csrf=csrf-value; Path=/; SameSite=Lax'));

    assert.equal(jar.get('tp_csrf'), 'csrf-value');
    assert.equal(jar.header(), 'tp_csrf=csrf-value');
  });

  it('removes an existing cookie for the empty-value clear format', () => {
    const jar = createHttpCookieJar();
    jar.set('midao_impersonation_actor', 'actor-1');

    jar.add(responseWithSetCookies('midao_impersonation_actor=; Path=/; Max-Age=0'));

    assert.equal(jar.get('midao_impersonation_actor'), undefined);
    assert.equal(jar.header(), '');
  });

  it("removes an existing cookie for guide-auth's literal '' clear format", () => {
    const jar = createHttpCookieJar();
    jar.set('guide_token', 'old-token');

    jar.add(responseWithSetCookies("guide_token=''; Path=/; HttpOnly; Max-Age=0"));

    assert.equal(jar.get('guide_token'), undefined);
    assert.equal(jar.header(), '');
  });

  it('overwrites a rotated cookie value and returns the fresh value', () => {
    const jar = createHttpCookieJar();
    jar.add(responseWithSetCookies('tp_csrf=before-login; Path=/'));

    jar.add(responseWithSetCookies('tp_csrf=after-login; Path=/'));

    assert.equal(jar.get('tp_csrf'), 'after-login');
    assert.equal(jar.header(), 'tp_csrf=after-login');
  });

  it('serializes multiple cookies and supports the set-cookie fallback path', () => {
    const jar = createHttpCookieJar();
    const fallbackResponse = {
      headers: {
        get: (name) => (name === 'set-cookie' ? 'guide_token=guide-value; Path=/' : null),
      },
    };

    jar.add(fallbackResponse);
    jar.add(responseWithSetCookies('tp_csrf=csrf-value; Path=/'));

    assert.equal(jar.header(), 'guide_token=guide-value; tp_csrf=csrf-value');
  });
});
