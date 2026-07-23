import { jsonError } from '../api-response.ts';
import { reportRouteError } from '../route-error.ts';

export class MidaoRouteError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'MidaoRouteError';
    this.code = code;
    this.status = status;
  }
}

const SAFE_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Unauthorized',
  SESSION_STALE: 'Session expired',
  GUIDE_NOT_ACTIVE: 'Guide is not active',
  MIDAO_DISABLED: 'Midao backend is unavailable',
  BACKEND_MODE_MISMATCH: 'Guide backend mode conflict',
  NOT_FOUND: 'Resource not found',
  MUTATIONS_DISABLED: 'Midao mutations are unavailable',
};

function isExpectedRouteError(error: unknown): error is { code: string; status: number; message?: string } {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; status?: unknown };
  return typeof candidate.code === 'string'
    && Number.isInteger(candidate.status)
    && (candidate.status as number) >= 400
    && (candidate.status as number) < 500 || (
      typeof candidate.code === 'string'
      && candidate.status === 503
    );
}

export async function handleMidaoRouteError(
  error: unknown,
  {
    route = 'v2/guide/midao',
    reportUnexpected = reportRouteError,
  }: {
    route?: string;
    reportUnexpected?: (error: unknown, opts: { route: string }) => Promise<unknown>;
  } = {},
): Promise<Response> {
  if (isExpectedRouteError(error)) {
    const message = error instanceof MidaoRouteError
      ? error.message
      : (SAFE_MESSAGES[error.code] ?? 'Request rejected');
    return jsonError(error.code, message, error.status);
  }
  await reportUnexpected(error, { route });
  return jsonError('INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試', 500);
}
