import { notFound, redirect } from 'next/navigation';
import { getActivityBySlugDb, buildCanonicalActivityDetailPath } from '../../../src/lib/db.mjs';

export const dynamic = 'force-static';
export const revalidate = 300;

export default async function ActivityDetailCompatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const activity = await getActivityBySlugDb(slug).catch((): null => null);
  if (!activity) return notFound();

  redirect(buildCanonicalActivityDetailPath(activity));
}
