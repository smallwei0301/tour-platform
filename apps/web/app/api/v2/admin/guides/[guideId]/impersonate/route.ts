/**
 * Admin → Guide impersonation (讓管理員直接進入導遊後台)
 *
 * POST /api/v2/admin/guides/[guideId]/impersonate
 *
 * 管理員在後台針對某位正式導遊按「進入導遊後台」時呼叫。此路由為目標導遊簽發一組
 * 合法的 guide session cookie（沿用 createGuideSessionCookies 的 HMAC 簽章 + 該導遊
 * 當前的 guide_session_version），管理員取得 cookie 後即可像該導遊一樣進入 /guide/**。
 *
 * 安全邊界：
 * - 本路由位於 /api/v2/admin/**，middleware 已強制 admin 授權（token + email allowlist
 *   + session-version）與 CSRF 雙提交，故 handler 本身不需重驗 admin 身分。
 * - 僅允許代入「已建檔且 approved 的正式導遊」；申請中/停權者拒絕。
 * - 另下一顆非 HttpOnly 標記 cookie（guide_impersonation），供導遊後台顯示「管理員代入
 *   模式」橫幅與結束代入入口；此 cookie 不含機密、不參與簽章驗證。
 */
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';
import { createGuideSessionCookies } from '../../../../../../../src/lib/guide-auth';
import { getGuideAuthSupabaseClient, type GuideAuthSingleResult } from '../../../../../../../src/lib/guide-auth-session-supabase';
import { getSupabaseUrl } from '../../../../../../../src/config/supabase-service-env.mjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 代入標記 cookie（非 HttpOnly，供導遊後台前端顯示橫幅）。與 guide session 同壽命。
// 注意：Next.js App Router route 檔只允許匯出 HTTP method 與框架保留欄位，故此常數
// 不得 export；導遊後台 layout 另有自己的同名本地常數。
const IMPERSONATION_COOKIE_NAME = 'guide_impersonation';
const IMPERSONATION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 與 guide session 一致

type GuideImpersonationProfile = {
  id: string;
  display_name: string;
  guide_session_version: number | null;
  verification_status: string;
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;

  if (!UUID_REGEX.test(guideId)) {
    return jsonError('VALIDATION_ERROR', 'Invalid guideId', 422);
  }

  if (!getSupabaseUrl()) {
    return jsonError('NOT_AVAILABLE', 'Auth not configured', 503);
  }

  try {
    const supabase = await getGuideAuthSupabaseClient();

    const { data: guide, error } = (await supabase
      .from('guide_profiles')
      .select<GuideImpersonationProfile>('id, display_name, guide_session_version, verification_status')
      .eq('id', guideId)
      .single()) as GuideAuthSingleResult<GuideImpersonationProfile>;

    if (error || !guide) {
      return jsonError('NOT_FOUND', '找不到導遊檔案', 404);
    }

    if (guide.verification_status !== 'approved') {
      return jsonError('GUIDE_NOT_ACTIVE', '此導遊尚未上線或已停權，無法進入其後台', 409);
    }

    const sessionVersion = guide.guide_session_version ?? 1;
    const cookies = createGuideSessionCookies(guide.id, guide.display_name, sessionVersion, false);

    // 與 guide session cookie 一致的 Secure 屬性（production 由 createGuideSessionCookies
    // 加上 '; Secure'）；此處鏡射同一結果，避免在本檔另行直讀環境變數。
    const securePart = cookies.some((c) => c.includes('; Secure')) ? '; Secure' : '';
    const markerCookie =
      `${IMPERSONATION_COOKIE_NAME}=1; Path=/; SameSite=Lax; Max-Age=${IMPERSONATION_MAX_AGE_SECONDS}${securePart}`;

    const headers = new Headers();
    cookies.forEach((c) => headers.append('set-cookie', c));
    headers.append('set-cookie', markerCookie);

    return jsonOk({ guideId: guide.id, guideName: guide.display_name }, { headers });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/admin/guides/impersonate' });
  }
}
