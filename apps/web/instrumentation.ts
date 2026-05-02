/**
 * Next.js Instrumentation — Sentry server/edge init
 * Phase 10-3 — Tour Platform
 */
const hasSentryDsn = !!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);
const runtimeImport = (modulePath: string) => new Function('m', 'return import(m)')(modulePath) as Promise<any>;
const SENTRY_NEXTJS_MODULE = '@sentry' + '/nextjs';
const SENTRY_SERVER_CONFIG_MODULE = './sentry.' + 'server.config';
const SENTRY_EDGE_CONFIG_MODULE = './sentry.' + 'edge.config';

export async function onRequestError(...args: any[]) {
  if (!hasSentryDsn) return;
  const Sentry = await runtimeImport(SENTRY_NEXTJS_MODULE);
  return (Sentry.captureRequestError as any)(...args);
}

export async function register() {
  if (!hasSentryDsn) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await runtimeImport(SENTRY_SERVER_CONFIG_MODULE);
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await runtimeImport(SENTRY_EDGE_CONFIG_MODULE);
  }
}
