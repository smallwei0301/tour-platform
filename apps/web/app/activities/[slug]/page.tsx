import { notFound, redirect } from 'next/navigation';
import { getActivityBySlugDb, buildCanonicalActivityDetailPath } from '../../../src/lib/db.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

const COMPAT_ACTIVITY_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutRef: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutRef = setTimeout(() => {
      reject(new Error(`[${label}] timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutRef) clearTimeout(timeoutRef);
  }) as Promise<T>;
}

export default async function ActivityDetailCompatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let activity: Awaited<ReturnType<typeof getActivityBySlugDb>>;
  try {
    activity = await withTimeout(
      getActivityBySlugDb(slug),
      COMPAT_ACTIVITY_TIMEOUT_MS,
      'activity-detail-compat-redirect',
    );
  } catch {
    return notFound();
  }

  if (!activity) return notFound();

  redirect(buildCanonicalActivityDetailPath(activity));
}
