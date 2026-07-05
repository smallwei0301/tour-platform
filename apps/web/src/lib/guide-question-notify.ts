/**
 * 旅客提問通知導遊 wrapper：旅客在「行程旅客問答」或「認識導遊頁」送出提問後，
 * 解析該提問對應的導遊 email 與來源標籤，再呼叫 email.ts 交易信。
 *
 * 一律 best-effort：任何失敗（無 Supabase、查無導遊、無 email、寄信失敗）都不得
 * 影響提問送出主流程，故整段包在 try/catch 內、永不 throw。
 *
 * 來源解析：
 *  - 認識導遊頁訊息：activity_id 為 sentinel `guide:<guideId>`，直接以 guideId
 *    查 guide_profiles 取 email；來源標籤＝「導遊頁面」。
 *  - 行程旅客問答：activity_id 為真實行程 id → activities.guide_id → guide_profiles
 *    取 email；來源標籤＝行程名稱。
 */
import { hasSupabaseEnv } from './db.mjs';
import { sendGuideQuestionNotice } from './email';
import { isGuideContactActivityId, parseGuideContactGuideId } from './guide-contact-qa.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../src/config/supabase-service-env.mjs';

async function getServiceClient() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || getSupabaseUrl()!,
    getSupabaseServiceRoleKey()!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type SupabaseClient = Awaited<ReturnType<typeof getServiceClient>>;

async function resolveGuide(
  supabase: SupabaseClient,
  guideId: string,
): Promise<{ email: string | null; name: string }> {
  const { data: gp } = await supabase
    .from('guide_profiles')
    .select('guide_email, display_name')
    .eq('id', guideId)
    .single();
  return {
    email: (gp?.guide_email as string) || null,
    name: (gp?.display_name as string) || '導遊',
  };
}

export async function notifyGuideOfQuestion(params: {
  activityId: string;
  question: string;
}): Promise<void> {
  try {
    const { activityId, question } = params;
    if (!hasSupabaseEnv()) return;

    const supabase = await getServiceClient();

    let guideEmail: string | null = null;
    let guideName = '導遊';
    let sourceLabel = '';

    if (isGuideContactActivityId(activityId)) {
      const guideId = parseGuideContactGuideId(activityId);
      if (!guideId) return;
      const guide = await resolveGuide(supabase, guideId);
      guideEmail = guide.email;
      guideName = guide.name;
      sourceLabel = '導遊頁面';
    } else {
      const { data: act } = await supabase
        .from('activities')
        .select('title, guide_id')
        .eq('id', activityId)
        .single();
      sourceLabel = (act?.title as string) || '您的行程';
      const guideId = act?.guide_id as string | undefined;
      if (guideId) {
        const guide = await resolveGuide(supabase, guideId);
        guideEmail = guide.email;
        guideName = guide.name;
      }
    }

    if (!guideEmail) return;

    await sendGuideQuestionNotice({
      to: guideEmail,
      guideName,
      sourceLabel,
      question,
    });
  } catch {
    // best-effort：通知失敗絕不影響提問送出主流程
  }
}
