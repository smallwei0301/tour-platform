import { createClient } from '@supabase/supabase-js';

export type GuideAuthSingleResult<T> = {
  data: T | null;
  error: unknown | null;
};

export type GuideProfileUpdatePayload = {
  guide_password_hash: string;
  invite_token: null;
  invite_token_expires_at: null;
};

type GuideProfilesSelectQuery<T> = {
  eq(column: string, value: string): {
    single(): PromiseLike<GuideAuthSingleResult<T>>;
  };
};

type GuideProfilesUpdateQuery = {
  eq(column: 'id', value: string): PromiseLike<unknown>;
};

type GuideProfilesTable = {
  select<T>(columns: string): GuideProfilesSelectQuery<T>;
  update(payload: GuideProfileUpdatePayload): GuideProfilesUpdateQuery;
};

export type GuideAuthSupabaseClient = {
  from(table: 'guide_profiles'): GuideProfilesTable;
};

export async function getGuideAuthSupabaseClient(): Promise<GuideAuthSupabaseClient> {
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  return client as unknown as GuideAuthSupabaseClient;
}
