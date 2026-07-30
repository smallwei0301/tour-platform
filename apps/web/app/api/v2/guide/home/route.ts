import { withMidaoGuideQuery } from '../../../../../src/lib/midao/with-guide-route.ts';
import { loadMidaoHome } from '../../../../../src/lib/midao/home-resolver.ts';
import { MidaoRouteError } from '../../../../../src/lib/midao/route-errors.ts';

function assertNoQuery(request: Request): void {
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    throw new MidaoRouteError('INVALID_HOME_QUERY', 'Invalid home query', 422);
  }
}

export async function GET(request: Request) {
  return withMidaoGuideQuery(
    request,
    async ({ guideId, guideName }) => {
      assertNoQuery(request);
      return loadMidaoHome({ guideId, guideName });
    },
    { route: 'v2/guide/home' },
  );
}
