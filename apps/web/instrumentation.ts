/**
 * Next.js Instrumentation
 *
 * For local/preview E2E stability, keep this file side-effect free.
 * Edge/runtime instrumentation previously triggered:
 * `EvalError: Code generation from strings disallowed for this context`.
 */

export const onRequestError = () => undefined;

export async function register() {
  // Intentionally no-op.
}
