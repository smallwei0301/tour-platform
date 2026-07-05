/**
 * PATCH /api/guide/conflict-overrides/[overrideId] — 導遊確認/婉拒幫手（#1497）
 *
 * body: { action: 'confirm' | 'decline', guideNote?: string }
 * confirm → helper_status='assigned'；decline → helper_status='declined'。
 * 嚴格所有權：導遊只能變更自己的 override（guide_id 比對）。
 * 合法性由純函式 resolveConflictOverrideHelperTransition 統一判定。
 */
import type { NextRequest } from 'next/server';
import { ok, fail } from '../../../../../src/lib/api';
import { validateCsrf } from '../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { resolveConflictOverrideHelperTransition } from '../../../../../src/lib/conflict-override-transition.mjs';
import { insertAuditLogDb } from '../../../../../src/lib/audit-log.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface DecisionBody {
  action?: string;
  guideNote?: string | null;
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ overrideId: string }> },
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = verifyGuideSession(request);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });

  const { overrideId } = await context.params;
  if (!UUID_REGEX.test(overrideId)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid overrideId'), { status: 400 });
  }

  let body: DecisionBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  const action = String(body.action || '').trim();
  const guideNote = body.guideNote == null ? null : String(body.guideNote).trim() || null;

  if (!getSupabaseUrl()) {
    return Response.json(fail('SERVER_ERROR', 'Database not configured'), { status: 500 });
  }

  try {
    const supabase = await getSupabase();

    const { data: existing, error: fetchError } = await supabase
      .from('guide_slot_conflict_overrides')
      .select('id, guide_id, helper_status, status')
      .eq('id', overrideId)
      .maybeSingle();

    if (fetchError || !existing) {
      return Response.json(fail('NOT_FOUND', 'Override not found'), { status: 404 });
    }
    if (existing.guide_id !== session.guideId) {
      return Response.json(fail('FORBIDDEN', 'Cannot modify overrides of other guides'), { status: 403 });
    }
    if (existing.status !== 'active') {
      return Response.json(fail('CONFLICT', 'Override is not active'), { status: 409 });
    }

    const transition = resolveConflictOverrideHelperTransition(existing.helper_status, action);
    if (!transition.allowed) {
      const status = transition.code === 'INVALID_ACTION' ? 400 : 409;
      return Response.json(fail(transition.code, transition.messageZh), { status });
    }

    const updatePayload: Record<string, unknown> = {
      helper_status: transition.nextStatus,
      helper_decided_at: new Date().toISOString(),
    };
    if (guideNote !== null) updatePayload.guide_note = guideNote;

    const { data: updated, error: updateError } = await supabase
      .from('guide_slot_conflict_overrides')
      .update(updatePayload)
      .eq('id', overrideId)
      .eq('guide_id', session.guideId)
      .select('id, helper_status, helper_decided_at, guide_note')
      .single();

    if (updateError) {
      console.error('[guide conflict-overrides] update error:', updateError);
      return Response.json(fail('SERVER_ERROR', 'Failed to update override'), { status: 500 });
    }

    try {
      await insertAuditLogDb(supabase, {
        actor: `guide:${session.guideId}`,
        action: 'conflict_override.helper_decision',
        metadata: { overrideId, action, helperStatus: transition.nextStatus },
      });
    } catch (auditErr) {
      console.error('[guide conflict-overrides] audit error:', auditErr);
    }

    return Response.json(ok({ override: updated }));
  } catch (err) {
    console.error('[guide conflict-overrides] server error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}
