export type SupabaseClientLike = {
  from: (table: string) => {
    select: (columns: string) => {
      single: () => Promise<{ data: any; error: any }>;
    };
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error?: any }>;
    };
  };
};

let supabaseFactoryOverride: (() => Promise<SupabaseClientLike>) | null = null;

export function __setGuideAuthSupabaseFactoryForTests(factory: (() => Promise<SupabaseClientLike>) | null) {
  supabaseFactoryOverride = factory;
}

export async function getGuideAuthSupabaseClient(): Promise<SupabaseClientLike> {
  if (supabaseFactoryOverride) {
    return supabaseFactoryOverride();
  }

  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ) as SupabaseClientLike;
}
