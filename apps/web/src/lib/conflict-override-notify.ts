/**
 * #1497 — 衝突例外開放通知 wrapper：管理者建立 conflict override 後通知導遊。
 * 一律 best-effort：任何失敗不得影響加開主流程（呼叫端 fire-and-forget）。
 * 隱私：只傳導遊可見欄位（reason / guideNote）給 email，內部備註不外洩。
 */
import { hasSupabaseEnv } from './db.mjs';
import { sendGuideConflictOverrideNotice } from './email';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../src/config/supabase-service-env.mjs';

async function getServiceClient() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface ConflictOverrideCreatedInput {
  guideId: string;
  activityId: string;
  startAt: string;
  endAt: string;
  reason: string;
  requiresHelper: boolean;
  guideNote?: string | null;
}

/**
 * 查導遊 email 與活動名稱後寄出通知。無 Supabase env 或查無 guide email 時靜默略過。
 */
export async function notifyGuideConflictOverrideCreated(
  input: ConflictOverrideCreatedInput,
): Promise<void> {
  if (!hasSupabaseEnv()) return;

  const supabase = await getServiceClient();

  const [{ data: guideProfile }, { data: activity }] = await Promise.all([
    supabase.from('guide_profiles').select('guide_email').eq('id', input.guideId).maybeSingle(),
    supabase.from('activities').select('title').eq('id', input.activityId).maybeSingle(),
  ]);

  const guideEmail = guideProfile?.guide_email ?? '';
  if (!guideEmail) return; // 無 email → 靜默略過

  await sendGuideConflictOverrideNotice({
    to: guideEmail,
    activityTitle: activity?.title ?? '您的行程',
    startAt: input.startAt,
    endAt: input.endAt,
    reason: input.reason,
    requiresHelper: input.requiresHelper,
    guideNote: input.guideNote ?? null,
  });
}
