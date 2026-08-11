export function createHttpCookieJar() {
  const values = new Map();

  function add(response) {
    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (() => {
        const single = response.headers.get('set-cookie');
        return single ? [single] : [];
      })();

    for (const setCookie of setCookies) {
      const pair = setCookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;

      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (!value || value === "''") values.delete(name);
      else values.set(name, value);
    }
  }

  return {
    add,
    set(name, value) {
      values.set(name, value);
    },
    get(name) {
      return values.get(name);
    },
    header() {
      return [...values].map(([name, value]) => `${name}=${value}`).join('; ');
    },
  };
}
