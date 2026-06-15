/**
 * /api/me/profile — 旅客 profile 讀寫（#1387，最小版）
 *
 * GET：回本人 profile（無資料時回預設空值）。
 * PATCH：upsert displayName / phone / marketingEmailOptIn（CSRF 由 middleware 涵蓋 /api/me/**）。
 * 注意 PII：本 route 不得 log 任何聯絡資訊。
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { createClient } from '../../../../src/lib/supabase/server';
import { hasSupabaseEnv } from '../../../../src/lib/db.mjs';
import { validateTravelerProfileInput } from '../../../../src/lib/traveler-profile.mjs';

const EMPTY_PROFILE = { displayName: '', phone: '', region: '', marketingEmailOptIn: true };

// schema-drift guard：region 欄位（#region migration）若尚未套用到此環境，PostgREST 會回
// 42703（undefined_column）或 PGRST204（schema cache 找不到欄位）。偵測到才退回不含 region
// 的讀寫，避免新欄位缺失讓整個 profile 讀取／儲存失敗（migration 套用後即恢復完整行為）。
function isMissingRegionColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message || '';
  const code = error.code || '';
  return (code === '42703' || code === 'PGRST204' || /does not exist|schema cache/i.test(msg)) && /region/i.test(msg);
}

async function getAuthedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getServiceClient() {
  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  return createServiceClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json(fail('UNAUTHORIZED', 'login required'), { status: 401 });

  if (!hasSupabaseEnv()) {
    return NextResponse.json(ok({ ...EMPTY_PROFILE, email: user.email ?? '' }));
  }

  const supabase = await getServiceClient();
  let { data, error } = await supabase
    .from('traveler_profiles')
    .select('display_name, phone, region, marketing_email_opt_in')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error && isMissingRegionColumn(error)) {
    ({ data, error } = await supabase
      .from('traveler_profiles')
      .select('display_name, phone, marketing_email_opt_in')
      .eq('user_id', user.id)
      .maybeSingle());
  }

  return NextResponse.json(ok({
    displayName: data?.display_name ?? '',
    phone: data?.phone ?? '',
    region: data?.region ?? '',
    marketingEmailOptIn: data?.marketing_email_opt_in ?? true,
    email: user.email ?? '',
  }));
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json(fail('UNAUTHORIZED', 'login required'), { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('INVALID_REQUEST', 'invalid JSON body'), { status: 400 });
  }

  const verdict = validateTravelerProfileInput(body);
  if (!verdict.ok) {
    return NextResponse.json(fail(verdict.error.code, verdict.error.message), { status: 400 });
  }

  if (!hasSupabaseEnv()) {
    // in-memory 模式（本地/測試）：無持久層，回寫入後 shape（行為與 Supabase 路徑一致）
    return NextResponse.json(ok({
      displayName: verdict.value.displayName,
      phone: verdict.value.phone,
      region: verdict.value.region ?? '',
      marketingEmailOptIn: verdict.value.marketingEmailOptIn ?? true,
      email: user.email ?? '',
    }));
  }

  const supabase = await getServiceClient();
  const baseRow = {
    user_id: user.id,
    display_name: verdict.value.displayName,
    phone: verdict.value.phone,
    ...(verdict.value.marketingEmailOptIn === null
      ? {}
      : { marketing_email_opt_in: verdict.value.marketingEmailOptIn }),
    updated_at: new Date().toISOString(),
  };
  const rowWithRegion =
    verdict.value.region === null ? baseRow : { ...baseRow, region: verdict.value.region };

  let { data, error } = await supabase
    .from('traveler_profiles')
    .upsert(rowWithRegion, { onConflict: 'user_id' })
    .select('display_name, phone, region, marketing_email_opt_in')
    .single();

  // region 欄位尚未 migrate → 不寫 region 重試，核心 profile（名稱／電話／通知偏好）仍可儲存。
  if (error && isMissingRegionColumn(error)) {
    ({ data, error } = await supabase
      .from('traveler_profiles')
      .upsert(baseRow, { onConflict: 'user_id' })
      .select('display_name, phone, marketing_email_opt_in')
      .single());
  }

  if (error || !data) {
    // 只記錄非 PII 的錯誤碼以利診斷（不得 log 名稱／電話）。
    console.error('[me/profile] upsert failed', error?.code || 'no-data');
    return NextResponse.json(fail('DB_ERROR', 'profile save failed'), { status: 500 });
  }

  return NextResponse.json(ok({
    displayName: data.display_name,
    phone: data.phone,
    region: data.region ?? verdict.value.region ?? '',
    marketingEmailOptIn: data.marketing_email_opt_in,
    email: user.email ?? '',
  }));
}
