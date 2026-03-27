const required = [
  'NEXT_PUBLIC_APP_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'ECPAY_MERCHANT_ID'
] as const;

export function validateEnv(env: Record<string, string | undefined>) {
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }
  return true;
}
