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

// GH-400: service-role client bypasses RLS role resolution issue.
// PostgREST resolves role from the apikey header (anon), not the JWT Bearer token,
// so anonClientWithToken INSERT into activity_qa always gets role=anon and fails the
// TO authenticated RLS policy. Mirror /api/reviews: verify identity via bearer client,
// then INSERT via service-role client with explicit user_id and status.
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// GET /api/qa?activityId=X — fetch approved Q&A for public display
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const activityId = searchParams.get('activityId')?.trim() || '';

  if (!activityId) {
    return NextResponse.json(fail('INVALID_REQUEST', 'activityId is required'), { status: 400 });
  }

  const supabase = getAnonClient();
  const { data, error } = await supabase
    .from('activity_qa')
    .select('id, question, answer, status')
    .eq('activity_id', activityId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json(fail('DB_ERROR', error.message), { status: 500 });
  }

  return NextResponse.json(ok(data ?? []), { status: 200 });
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

  // GH-400: use service-role client for INSERT (mirrors /api/reviews).
  // anonClientWithToken passes apikey=anon; PostgREST resolves role=anon not authenticated,
  // so the RLS policy TO authenticated fails with HTTP 500 in production.
  // Service-role bypasses RLS role resolution; user_id and status are written explicitly.
  const serviceSupabase = getServiceClient();
  const { data: qa, error } = await serviceSupabase
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
