export function init() {}
export function captureException() {}
export function captureMessage() {}
export function captureRequestError() {}
export function captureRouterTransitionStart() {}
export function replayIntegration() {
  return { name: 'sentry-replay-dev-noop' };
}
export function withSentryConfig(config) {
  return config;
}
