import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '../../../src/lib/api';
import { createClient } from '@supabase/supabase-js';

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// AC3: POST /api/qa — traveler submits a question (requires authentication)
export async function POST(req: NextRequest) {
  // AC3: Require authenticated user
  const supabase = getAnonClient();
  const authHeader = req.headers.get('authorization') || '';
  const anonClientWithToken = authHeader
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: authHeader } },
        }
      )
    : supabase;

  const { data: { user } } = await anonClientWithToken.auth.getUser();
  if (!user) {
    return NextResponse.json(fail('UNAUTHORIZED', 'login required'), { status: 401 });
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('INVALID_REQUEST', 'invalid JSON body'), { status: 400 });
  }

  const { activityId, question } = body as {
    activityId?: unknown;
    question?: unknown;
  };

  // Validate activityId
  const activityIdStr = typeof activityId === 'string' ? activityId.trim() : '';
  if (!activityIdStr) {
    return NextResponse.json(fail('INVALID_REQUEST', 'activityId is required'), { status: 400 });
  }

  // Validate question
  const questionStr = typeof question === 'string' ? question.trim() : '';
  if (!questionStr) {
    return NextResponse.json(fail('EMPTY_QUESTION', 'question text required'), { status: 400 });
  }

  const adminSupabase = getServiceClient();

  // AC3: Insert with status pending_moderation
  const { data: qa, error } = await adminSupabase
    .from('activity_qa')
    .insert({
      activity_id: activityIdStr,
      user_id: user.id,
      question: questionStr,
      status: 'pending_moderation',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(fail('DB_ERROR', error.message), { status: 500 });
  }

  return NextResponse.json(ok(qa), { status: 201 });
}
