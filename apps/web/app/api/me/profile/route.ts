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

const EMPTY_PROFILE = { displayName: '', phone: '', marketingEmailOptIn: true };

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
  const { data } = await supabase
    .from('traveler_profiles')
    .select('display_name, phone, marketing_email_opt_in')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json(ok({
    displayName: data?.display_name ?? '',
    phone: data?.phone ?? '',
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
      marketingEmailOptIn: verdict.value.marketingEmailOptIn ?? true,
      email: user.email ?? '',
    }));
  }

  const supabase = await getServiceClient();
  const { data, error } = await supabase
    .from('traveler_profiles')
    .upsert({
      user_id: user.id,
      display_name: verdict.value.displayName,
      phone: verdict.value.phone,
      ...(verdict.value.marketingEmailOptIn === null
        ? {}
        : { marketing_email_opt_in: verdict.value.marketingEmailOptIn }),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('display_name, phone, marketing_email_opt_in')
    .single();

  if (error) {
    return NextResponse.json(fail('DB_ERROR', 'profile save failed'), { status: 500 });
  }

  return NextResponse.json(ok({
    displayName: data.display_name,
    phone: data.phone,
    marketingEmailOptIn: data.marketing_email_opt_in,
    email: user.email ?? '',
  }));
}
