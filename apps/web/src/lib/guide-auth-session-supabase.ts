import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../src/config/supabase-service-env.mjs';

export type GuideAuthSingleResult<T> = {
  data: T | null;
  error: unknown | null;
};

export type GuideProfileUpdatePayload = {
  guide_password_hash: string;
  // 健檢 v2 S1：透明升級只改雜湊，invite 欄位為選填（首次設定密碼時才一併清除）
  invite_token?: null;
  invite_token_expires_at?: null;
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
  const client = createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
  return client as unknown as GuideAuthSupabaseClient;
}
