/**
 * Sentry Client Configuration
 * Phase 10-3 — Tour Platform
 * Runs in the browser
 */

type RouterTransitionArgs = Parameters<typeof import('@sentry/nextjs')['captureRouterTransitionStart']>;

export const onRouterTransitionStart = async (...args: RouterTransitionArgs) => {
  if (process.env.NODE_ENV !== 'production' || !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  return Sentry.captureRouterTransitionStart(...args);
};

if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,

      // Performance monitoring
      tracesSampleRate: 0.1,

      // Session replay (production only)
      replaysSessionSampleRate: 0.05,
      replaysOnErrorSampleRate: 1.0,

      enabled: true,

      integrations: [
        Sentry.replayIntegration(),
      ],
    });
  });
}
