// LINE LIFF idToken verification — Tour Platform (#302b)
//
// Verifies a LIFF-issued idToken against LINE's OAuth verify endpoint and
// confirms the audience matches our LINE Login channel. This replaces the
// previous "trust the query param" handoff: the lineUserId now comes from a
// cryptographically verified token (sub), not the URL.
//
// Returns a discriminated result; never throws on network/validation errors.

const LINE_VERIFY_ENDPOINT = 'https://api.line.me/oauth2/v2.1/verify';

/**
 * @param {string} idToken - the LIFF idToken (liff.getIDToken()).
 * @returns {Promise<{ ok: true, lineUserId: string, email?: string, name?: string }
 *   | { ok: false, reason: string }>}
 */
export async function verifyLiffIdToken(idToken) {
  const token = String(idToken || '').trim();
  if (!token) return { ok: false, reason: 'no_id_token' };

  const channelId = String(process.env.LINE_LOGIN_CHANNEL_ID || '').trim();
  if (!channelId) return { ok: false, reason: 'no_login_channel' };

  let data;
  try {
    const response = await fetch(LINE_VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: token, client_id: channelId }).toString(),
    });
    if (!response.ok) {
      return { ok: false, reason: 'invalid_token' };
    }
    data = await response.json();
  } catch (err) {
    return { ok: false, reason: 'verify_failed', error: err instanceof Error ? err.message : String(err) };
  }

  // Audience must be our channel — defends against tokens minted for other apps.
  if (String(data?.aud) !== channelId) {
    return { ok: false, reason: 'aud_mismatch' };
  }

  // Reject expired tokens (LINE also validates, but guard against clock/replay).
  const exp = Number(data?.exp || 0);
  if (exp && exp * 1000 <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  const lineUserId = String(data?.sub || '').trim();
  if (!lineUserId) return { ok: false, reason: 'no_subject' };

  return {
    ok: true,
    lineUserId,
    email: data?.email ? String(data.email).trim().toLowerCase() : undefined,
    name: data?.name ? String(data.name) : undefined,
  };
}
