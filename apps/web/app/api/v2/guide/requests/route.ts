import { listMidaoRequestsDb } from '../../../../../src/lib/midao/db-requests.mjs';
import { resolveMidaoRequestList } from '../../../../../src/lib/midao/request-list-resolver.ts';
import { MidaoRouteError } from '../../../../../src/lib/midao/route-errors.ts';
import { withMidaoGuideQuery } from '../../../../../src/lib/midao/with-guide-route.ts';

const ALLOWED_QUERY_KEYS = new Set(['bucket', 'cursor', 'limit', 'sort']);
const BUCKETS = new Set(['all', 'new', 'needs_reply', 'replied', 'completed']);
const SORTS = new Set(['priority', 'updated_desc', 'service_asc']);
const ASCII_LIMIT_PATTERN = /^(?:[1-9]|[1-4][0-9]|50)$/u;

function invalidQuery(): never {
  throw new MidaoRouteError('INVALID_REQUEST_QUERY', 'Invalid request query', 422);
}

function parseListQuery(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const values = new Map<string, string>();

  for (const key of searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key) || searchParams.getAll(key).length !== 1) invalidQuery();
    const value = searchParams.get(key);
    if (value === null || value === '') invalidQuery();
    values.set(key, value);
  }

  const bucket = values.get('bucket') ?? 'all';
  const sort = values.get('sort') ?? 'priority';
  const cursor = values.get('cursor') ?? null;
  const limitValue = values.get('limit');
  const limit = limitValue === undefined ? 20 : Number(limitValue);

  if (!BUCKETS.has(bucket) || !SORTS.has(sort)) invalidQuery();
  if (limitValue !== undefined && !ASCII_LIMIT_PATTERN.test(limitValue)) invalidQuery();

  return { bucket, sort, cursor, limit };
}

function translateListGatewayError(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('BAD_REQUEST:')) {
    throw new MidaoRouteError('INVALID_REQUEST_QUERY', 'Invalid request query', 422);
  }
  if (message.startsWith('INVALID_CURSOR:')) {
    throw new MidaoRouteError('INVALID_CURSOR', 'Invalid cursor', 422);
  }
  throw error;
}

export async function GET(request: Request) {
  return withMidaoGuideQuery(
    request,
    async ({ guideId }) => {
      const query = parseListQuery(request);
      try {
        const projection = await listMidaoRequestsDb({ guideId, ...query });
        return resolveMidaoRequestList(projection);
      } catch (error) {
        return translateListGatewayError(error);
      }
    },
    { route: 'v2/guide/requests' },
  );
}
