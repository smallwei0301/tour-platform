export function getGuideSessionSecurityEnv(env = process.env) {
  return {
    secret: String(env.GUIDE_SESSION_SECRET || '').trim(),
    isProduction: env.NODE_ENV === 'production',
    isNextBuildPhase: env.NEXT_PHASE === 'phase-production-build',
  };
}

export function isProductionRuntime(env = process.env) {
  return env.NODE_ENV === 'production';
}
