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

/** 對外連結用的站台 base URL（email 內 CTA 等）。集中於此以符合 env 直讀 ratchet。 */
export function getSiteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://tour-platform.vercel.app';
}
