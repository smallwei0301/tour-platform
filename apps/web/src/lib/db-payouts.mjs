/**
 * 撥款 generate + confirm（Issue #448）
 * #1613 db.mjs strangler：整塊自 db.mjs 純搬移（行為零變更；型別債見 #1597）。
 * db.mjs 以 re-export 保持既有 caller 匯入路徑不變。
 */

// ── Issue #448: Payouts — generate + confirm ───────────────────────────────────

/**
 * Return guide_balances rows where balance_twd >= minTwd.
 * Used by the generate-payouts cron to find eligible guides.
 * @param {any} supabase — service-role Supabase client
 * @param {number} minTwd — minimum balance threshold (e.g. 5000)
 * @returns {Promise<Array<{ guide_id: string, balance_twd: number }>>}
 */
export async function getGuideBalancesAboveThresholdDb(supabase, minTwd) {
  const { data, error } = await supabase
    .from('guide_balances')
    .select('guide_id, balance_twd')
    .gte('balance_twd', minTwd);
  if (error) throw error;
  return data ?? [];
}

/**
 * Create a pending payout for a guide, skipping if one already exists.
 * @param {any} supabase — service-role Supabase client
 * @param {string} guideId
 * @param {number} totalTwd
 * @returns {Promise<{ skipped: boolean, id: string, [key: string]: any }>}
 */
export async function createPayoutDb(supabase, guideId, totalTwd) {
  // Check no pending payout exists first
  const { data: existing } = await supabase
    .from('payouts')
    .select('id')
    .eq('guide_id', guideId)
    .eq('state', 'pending')
    .maybeSingle();
  if (existing) return { skipped: true, id: existing.id };

  const { data, error } = await supabase
    .from('payouts')
    .insert({ guide_id: guideId, total_twd: totalTwd, state: 'pending' })
    .select()
    .single();
  if (error) throw error;
  return { skipped: false, ...data };
}

/**
 * Confirm a pending payout: debit guide_balances, mark payout paid, write audit log.
 * @param {any} supabase — service-role Supabase client
 * @param {string} payoutId
 * @param {string|null} confirmedBy — admin identifier
 * @param {string|null} transferRef — bank transfer reference
 * @returns {Promise<object>} updated payout row
 */
export async function confirmPayoutDb(supabase, payoutId, confirmedBy, transferRef) {
  // Fetch payout
  const { data: payout, error: fetchErr } = await supabase
    .from('payouts')
    .select('*')
    .eq('id', payoutId)
    .single();
  if (fetchErr || !payout) throw new Error('payout not found');
  if (payout.state !== 'pending') throw new Error(`payout already ${payout.state}`);

  // Fetch current guide balance
  const { data: balance } = await supabase
    .from('guide_balances')
    .select('balance_twd')
    .eq('guide_id', payout.guide_id)
    .single();
  const newBalance = Math.max(0, (balance?.balance_twd ?? 0) - payout.total_twd);

  // Debit guide_balances
  await supabase
    .from('guide_balances')
    .upsert(
      { guide_id: payout.guide_id, balance_twd: newBalance, updated_at: new Date().toISOString() },
      { onConflict: 'guide_id' }
    );

  // Mark payout paid
  const { data: updated, error: updateErr } = await supabase
    .from('payouts')
    .update({
      state: 'paid',
      confirmed_by: confirmedBy ?? 'admin',
      confirmed_at: new Date().toISOString(),
      transfer_ref: transferRef ?? null,
    })
    .eq('id', payoutId)
    .select()
    .single();
  if (updateErr) throw updateErr;

  // Audit log
  await supabase
    .from('audit_logs')
    .insert({
      actor: confirmedBy ?? 'admin',
      action: 'payout_confirmed',
      metadata: {
        payout_id: payoutId,
        guide_id: payout.guide_id,
        total_twd: payout.total_twd,
        before_balance: balance?.balance_twd ?? 0,
        after_balance: newBalance,
        transfer_ref: transferRef ?? null,
      },
    });

  return updated;
}

/**
 * #1365 缺口 2 — admin 出款管理手動操作 fallback。
 * List all guide balances > 0 (including below-threshold guides) with
 * profile info and a has_pending_payout flag so the admin UI can show the
 * settlement queue and block duplicate manual payout generation.
 * @param {any} supabase — service-role Supabase client
 * @returns {Promise<Array<{ guide_id, balance_twd, last_settled_at, display_name, email, has_pending_payout }>>}
 */
export async function listGuideBalancesWithProfilesDb(supabase) {
  const { data: balances, error } = await supabase
    .from('guide_balances')
    .select('guide_id, balance_twd, last_settled_at, updated_at')
    .gt('balance_twd', 0)
    .order('balance_twd', { ascending: false });
  if (error) throw new Error(error.message);
  if (!balances || balances.length === 0) return [];

  const guideIds = balances.map((b) => b.guide_id);

  const { data: profiles } = await supabase
    .from('guide_profiles')
    .select('id, display_name, guide_email')
    .in('id', guideIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: pendings } = await supabase
    .from('payouts')
    .select('guide_id')
    .eq('state', 'pending')
    .in('guide_id', guideIds);
  const pendingGuideIds = new Set((pendings ?? []).map((p) => p.guide_id));

  return balances.map((b) => {
    const profile = profileById.get(b.guide_id);
    return {
      guide_id: b.guide_id,
      balance_twd: b.balance_twd,
      last_settled_at: b.last_settled_at ?? null,
      updated_at: b.updated_at ?? null,
      display_name: profile?.display_name ?? null,
      email: profile?.guide_email ?? null,
      has_pending_payout: pendingGuideIds.has(b.guide_id),
    };
  });
}

/**
 * #1365 缺口 2 — manually create a pending payout from a guide's current
 * balance (admin fallback while the settlement cron is not scheduled).
 * Reuses createPayoutDb so the pending-uniqueness guard stays the single
 * source of idempotency. Writes an audit log only when a payout is created.
 * @param {any} supabase — service-role Supabase client
 * @param {{ guideId: string, actor?: string }} input
 * @returns {Promise<{ skipped: boolean, id: string, [key: string]: any }>}
 */
export async function generateManualPayoutDb(supabase, { guideId, actor = 'admin' } = {}) {
  if (!guideId) throw new Error('guideId is required');

  const { data: balance } = await supabase
    .from('guide_balances')
    .select('balance_twd')
    .eq('guide_id', guideId)
    .maybeSingle();
  const balanceTwd = Number(balance?.balance_twd ?? 0);
  if (balanceTwd <= 0) throw new Error('guide balance is empty — nothing to pay out');

  const result = await createPayoutDb(supabase, guideId, balanceTwd);
  if (result.skipped) return result;

  await supabase
    .from('audit_logs')
    .insert({
      actor,
      action: 'payout_manually_generated',
      metadata: {
        payout_id: result.id,
        guide_id: guideId,
        total_twd: balanceTwd,
        source: 'admin_manual_fallback',
      },
    });

  return result;
}

/**
 * #1365 缺口 2 — cancel a pending payout (pending → cancelled).
 * The guide balance is NOT debited: cancelling releases the pending
 * uniqueness slot so a corrected payout can be generated later.
 * @param {any} supabase — service-role Supabase client
 * @param {string} payoutId
 * @param {string|null} cancelledBy — admin identifier
 * @param {string|null} reason — optional operator note (audit only)
 * @returns {Promise<object>} updated payout row
 */
export async function cancelPayoutDb(supabase, payoutId, cancelledBy, reason) {
  const { data: payout, error: fetchErr } = await supabase
    .from('payouts')
    .select('*')
    .eq('id', payoutId)
    .single();
  if (fetchErr || !payout) throw new Error('payout not found');
  if (payout.state !== 'pending') throw new Error(`payout already ${payout.state}`);

  const { data: updated, error: updateErr } = await supabase
    .from('payouts')
    .update({ state: 'cancelled' })
    .eq('id', payoutId)
    .select()
    .single();
  if (updateErr) throw updateErr;

  await supabase
    .from('audit_logs')
    .insert({
      actor: cancelledBy ?? 'admin',
      action: 'payout_cancelled',
      metadata: {
        payout_id: payoutId,
        guide_id: payout.guide_id,
        total_twd: payout.total_twd,
        cancelled_by: cancelledBy ?? 'admin',
        reason: reason ?? null,
      },
    });

  return updated;
}

