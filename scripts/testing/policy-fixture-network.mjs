// Classification does not authorize the request: caller must still abort every POST.
export function isExpectedAbortedDevDiagnostic(requestUrl, method) {
  if (method !== 'POST') return false;
  try {
    const url = new URL(requestUrl);
    return url.origin === 'http://127.0.0.1:3108' &&
      url.pathname === '/__nextjs_original-stack-frames' && url.search === '' && url.hash === '';
  } catch { return false; }
}
