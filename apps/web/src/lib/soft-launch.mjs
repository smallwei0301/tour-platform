// Server-side soft-launch control getter/setter
export async function getControls(supabase) {
  const { data, error } = await supabase.from('soft_launch_controls').select('*').single();
  if (error) return { public_paused: false, new_booking_paused: false, refund_manual_only: false, whitelist_enabled: false };
  return data;
}

export async function setControl(supabase, { controlKey, toValue, actor, reason, rollbackInstruction }) {
  // Read current value
  const current = await getControls(supabase);
  const fromValue = current[controlKey] ?? null;

  // Update controls
  await supabase.from('soft_launch_controls').update({ [controlKey]: toValue, updated_at: new Date().toISOString() }).not('id', 'is', null);

  // Write audit
  await supabase.from('soft_launch_control_audit').insert({
    actor, control_key: controlKey, from_value: fromValue, to_value: toValue,
    reason, rollback_instruction: rollbackInstruction || null
  });
}

export async function isWhitelisted(supabase, { userId, activityId, guideId }) {
  const checks = [];
  if (userId) checks.push({ entry_type: 'traveler_user_id', value: userId });
  if (activityId) checks.push({ entry_type: 'activity_id', value: activityId });
  if (guideId) checks.push({ entry_type: 'guide_id', value: guideId });
  if (!checks.length) return false;

  for (const check of checks) {
    const { data } = await supabase.from('soft_launch_whitelist')
      .select('id').eq('entry_type', check.entry_type).eq('value', check.value).limit(1);
    if (data?.length) return true;
  }
  return false;
}
