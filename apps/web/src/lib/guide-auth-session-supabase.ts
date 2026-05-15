import { createClient } from '@supabase/supabase-js';

export type GuideAuthSupabaseClient = ReturnType<typeof createClient>;

export async function getGuideAuthSupabaseClient(): Promise<GuideAuthSupabaseClient> {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
