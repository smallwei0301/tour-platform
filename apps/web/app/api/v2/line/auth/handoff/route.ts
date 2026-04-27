import { NextRequest, NextResponse } from 'next/server';
import { successV2, errorV2 } from '../../../../../../src/lib/api';

function pickFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function createCorrelationId(seed?: string): string {
  if (seed && seed.trim()) return seed.trim();
  return `line-handoff-${crypto.randomUUID()}`;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const activityId = pickFirst(params.getAll('activityId')).trim();

  if (!activityId) {
    return Response.json(errorV2('VALIDATION_ERROR', 'activityId is required'), { status: 400 });
  }

  const correlationId = createCorrelationId(pickFirst(params.getAll('correlationId')));
  const bookingParams = new URLSearchParams();

  const passthroughKeys = ['plan', 'date', 'timezone'] as const;
  for (const key of passthroughKeys) {
    const value = pickFirst(params.getAll(key)).trim();
    if (value) bookingParams.set(key, value);
  }

  bookingParams.set('source', 'line');
  bookingParams.set('sourceChannel', 'line');
  bookingParams.set('correlationId', correlationId);

  const bookingPath = `/booking/${encodeURIComponent(activityId)}?${bookingParams.toString()}`;

  if (params.get('mode') === 'redirect') {
    return NextResponse.redirect(new URL(bookingPath, request.url));
  }

  return Response.json(
    successV2({
      sourceChannel: 'line',
      correlationId,
      bookingPath,
    })
  );
}
