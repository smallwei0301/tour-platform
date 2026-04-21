#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const fromArg = process.argv.find((a) => a.startsWith('--from='));
const toArg = process.argv.find((a) => a.startsWith('--to='));
const from = fromArg ? fromArg.slice('--from='.length) : new Date().toISOString().slice(0, 10);
const to = toArg ? toArg.slice('--to='.length) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { data: activities, error: listError } = await supabase.from('activities').select('id');
if (listError) {
  console.error('Failed to list activities:', listError.message);
  process.exit(1);
}

let totalRows = 0;
for (const a of activities ?? []) {
  const { data, error } = await supabase.rpc('fn_refresh_activity_availability_daily', {
    p_activity_id: a.id,
    p_date_from: from,
    p_date_to: to,
  });
  if (error) {
    console.error(`Failed refresh for activity ${a.id}:`, error.message);
    process.exit(1);
  }
  totalRows += Number(data || 0);
}

console.log(`availability snapshot backfill done. activities=${activities?.length ?? 0}, rows=${totalRows}, range=${from}..${to}`);
