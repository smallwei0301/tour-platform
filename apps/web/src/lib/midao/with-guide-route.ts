import { randomUUID } from 'node:crypto';
import { isMidaoBackendMutationsEnabled } from '../../config/feature-flags.mjs';
import { jsonError, jsonOk } from '../api-response.ts';
import { validateCsrf } from '../csrf.mjs';
import { verifyCanonicalGuideSession } from './canonical-guide-session.ts';
import { hashIdempotentRequest, parseIdempotencyKey } from './idempotency.ts';
import { handleMidaoRouteError, MidaoRouteError } from './route-errors.ts';

type CanonicalContext = Awaited<ReturnType<typeof verifyCanonicalGuideSession>>;
type HandlerContext = CanonicalContext & {
  requestId: string;
  idempotencyKey?: string;
  requestHash?: string;
  body?: unknown;
};
type RouteHandler<T> = (context: HandlerContext) => Promise<T> | T;

type BoundaryOptions = {
  verifySession?: typeof verifyCanonicalGuideSession;
  validateCsrfRequest?: typeof validateCsrf;
  mutationsEnabled?: () => boolean;
  requestId?: () => string;
  reportUnexpected?: (error: unknown, opts: { route: string }) => Promise<unknown>;
  route?: string;
};

function createRequestId(options: BoundaryOptions): string {
  return options.requestId?.() ?? randomUUID();
}

async function csrfAsV2(response: Response): Promise<Response> {
  let code = 'CSRF_INVALID';
  let message = 'Invalid CSRF token';
  try {
    const payload = await response.clone().json();
    code = String(payload?.error?.code || code);
    message = String(payload?.error?.message || message);
  } catch {
    // Keep the bounded public fallback.
  }
  return jsonError(code, message, response.status || 403);
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    throw new MidaoRouteError('INVALID_REQUEST_BODY', 'Invalid JSON request body', 422);
  }
}

export async function withMidaoGuideQuery<T>(
  request: Request,
  handler: RouteHandler<T>,
  options: BoundaryOptions = {},
): Promise<Response> {
  try {
    const verifySession = options.verifySession ?? verifyCanonicalGuideSession;
    const session = await verifySession(request, { requireMode: true });
    const result = await handler({ ...session, requestId: createRequestId(options) });
    return jsonOk(result);
  } catch (error) {
    return handleMidaoRouteError(error, {
      route: options.route,
      reportUnexpected: options.reportUnexpected,
    });
  }
}

export async function withMidaoGuideCommand<T>(
  request: Request,
  handler: RouteHandler<T>,
  options: BoundaryOptions = {},
): Promise<Response> {
  try {
    const verifySession = options.verifySession ?? verifyCanonicalGuideSession;
    const session = await verifySession(request, { requireMode: true });

    const validateCsrfRequest = options.validateCsrfRequest ?? validateCsrf;
    const csrfFailure = validateCsrfRequest(request);
    if (csrfFailure) return csrfAsV2(csrfFailure);

    const mutationsEnabled = options.mutationsEnabled ?? isMidaoBackendMutationsEnabled;
    if (!mutationsEnabled()) {
      throw new MidaoRouteError('MUTATIONS_DISABLED', 'Midao mutations are unavailable', 503);
    }

    const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'));
    const body = await parseJsonBody(request);
    const requestHash = hashIdempotentRequest(body);
    const result = await handler({
      ...session,
      requestId: createRequestId(options),
      idempotencyKey,
      requestHash,
      body,
    });
    return jsonOk(result);
  } catch (error) {
    return handleMidaoRouteError(error, {
      route: options.route,
      reportUnexpected: options.reportUnexpected,
    });
  }
}
