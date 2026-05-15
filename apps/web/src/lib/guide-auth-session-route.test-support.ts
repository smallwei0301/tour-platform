import { getGuideAuthSupabaseClient as getProdGuideAuthSupabaseClient, type GuideAuthSupabaseClient } from './guide-auth-session-supabase';

let supabaseFactoryOverride: (() => Promise<GuideAuthSupabaseClient>) | null = null;

export function __setGuideAuthSupabaseFactoryForTests(factory: (() => Promise<GuideAuthSupabaseClient>) | null) {
  supabaseFactoryOverride = factory;
}

export async function getGuideAuthSupabaseClient(): Promise<GuideAuthSupabaseClient> {
  if (supabaseFactoryOverride) {
    return supabaseFactoryOverride();
  }

  return getProdGuideAuthSupabaseClient();
}
