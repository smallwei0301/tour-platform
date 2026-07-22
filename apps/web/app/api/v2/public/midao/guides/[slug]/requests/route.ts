/**
 * POST /api/v2/public/midao/guides/[slug]/requests — 旅客送需求單。
 * 無 auth。防濫用：IP rate-limit（5 次/分）＋honeypot（website 欄位有值→靜默成功）＋
 * 欄位驗證（normalizeRequestInput）＋activity 歸屬與可見檢查。
 * 成功後 fire-and-forget LINE 推播導遊（失敗不影響送單）。
 */
import { RateLimiter } from '../../../../../../../../src/lib/rate-limit';
import { resolveTrustedClientIp } from '../../../../../../../../src/lib/trusted-ip.mjs';
import { getPublicMidaoPageDb } from '../../../../../../../../src/lib/midao/db-midao-showcase.mjs';
import { createMidaoRequestDb, normalizeRequestInput } from '../../../../../../../../src/lib/midao/db-midao-requests.mjs';
import { notifyGuideNewMidaoRequest } from '../../../../../../../../src/lib/midao/midao-request-notify.mjs';
import { jsonOk, jsonError } from '../../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../../src/lib/route-error';

const submitLimiter = new RateLimiter(5, 60 * 1000);

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // resolveTrustedClientIp 回傳 { ip, source }（非純字串)——取 .ip 供 rate-limit key 使用。
  const { ip } = resolveTrustedClientIp(request);
  const limit = submitLimiter.check(`midao-submit:${ip}`);
  if (!limit.allowed) return jsonError('RATE_LIMITED', '送出太頻繁，請稍後再試', 429);
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  // honeypot：機器人填了隱藏欄位 → 回假成功、不落資料
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return jsonOk({ requestNo: 'R00000000000' });
  }
  try {
    const page = await getPublicMidaoPageDb(slug);
    if (!page) return jsonError('NOT_FOUND', '找不到此接案頁', 404);
    const activityId = String(body.activityId ?? '');
    const service = page.services.find((s) => s.activityId === activityId);
    if (!service) return jsonError('INVALID_ACTIVITY', '請選擇有效的服務', 400);
    const norm = normalizeRequestInput(body);
    if (!norm.ok) return jsonError(norm.code, norm.message, 400);
    const created = await createMidaoRequestDb({
      guideId: page.guideId, activityId, activityTitle: service.title,
      value: norm.value, source: 'public_page',
    });
    // fire-and-forget：不 await 失敗路徑影響回應
    notifyGuideNewMidaoRequest({
      guideId: page.guideId, requestNo: created.requestNo, travelerName: created.travelerName,
      activityTitle: service.title, preferredDate: created.preferredDate,
      participantsCount: created.participantsCount,
    }).catch(() => {});
    return jsonOk({ requestNo: created.requestNo });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/public/midao/guides:submit' });
  }
}
