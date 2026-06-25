/**
 * assertActivityBelongsToGuide
 *
 * 驗證一個 activity：
 *   1. 存在於 DB
 *   2. 其 guide_id 等於指定的導遊
 *
 * 回傳 { ok: true } 或 { ok: false, code: ... }。呼叫端負責轉成適當的 HTTP 回應。
 * 仿 src/lib/availability-v2/assert-plan-belongs-to-guide.ts。
 *
 * 所有 guide 行程相關 API（編輯、送審、圖片上傳、未來方案/場次）都必須先用
 * verifyGuideSession 取得 guideId，再呼叫本 helper —— 少一個就會讓導遊靠猜 id
 * 改到別人的行程（見計劃核心架構決策 #2 與邊角案例 #2）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ActivityOwnershipResult =
  | { ok: true }
  | { ok: false; code: 'ACTIVITY_NOT_FOUND' | 'ACTIVITY_WRONG_GUIDE' };

interface AssertActivityOpts {
  activityId: string;
  guideId: string;
  supabase: SupabaseClient;
}

export async function assertActivityBelongsToGuide({
  activityId,
  guideId,
  supabase,
}: AssertActivityOpts): Promise<ActivityOwnershipResult> {
  const { data: activity, error } = await supabase
    .from('activities')
    .select('id, guide_id')
    .eq('id', activityId)
    .single();

  if (error || !activity) {
    return { ok: false, code: 'ACTIVITY_NOT_FOUND' };
  }

  if (!activity.guide_id || activity.guide_id !== guideId) {
    return { ok: false, code: 'ACTIVITY_WRONG_GUIDE' };
  }

  return { ok: true };
}
