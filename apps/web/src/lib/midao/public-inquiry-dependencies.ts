import { createMidaoInquiryDb } from './db-midao-inquiries.mjs';
import { RateLimiter } from '../rate-limit.ts';
import { getSupabase } from '../supabase-env.mjs';
import { validateCsrf } from '../csrf.mjs';

type RateLimitResult = { allowed: boolean; resetAt: number };
type Dependencies = {
  getTravelerIdentity: () => Promise<{ id: string | null; email?: string | null }>;
  validateCsrf: typeof validateCsrf;
  getClientIp: typeof RateLimiter.getClientIp;
  checkRateLimit: (ip: string) => RateLimitResult;
  getSupabase: typeof getSupabase;
  createMidaoInquiryDb: typeof createMidaoInquiryDb;
};

const inquiryLimiter = new RateLimiter(5, 60_000);
const defaults: Dependencies = {
  getTravelerIdentity: async () => {
    const { getTravelerIdentity } = await import('../v2/traveler-auth.ts');
    return getTravelerIdentity();
  },
  validateCsrf,
  getClientIp: RateLimiter.getClientIp,
  checkRateLimit: (ip) => inquiryLimiter.check(ip),
  getSupabase,
  createMidaoInquiryDb,
};
let dependencies: Dependencies = defaults;

export function getPublicInquiryDependencies(): Dependencies {
  return dependencies;
}

export function __setPublicInquiryDependenciesForTest(overrides: Partial<Dependencies> | null = null) {
  dependencies = overrides ? { ...defaults, ...overrides } : defaults;
}
