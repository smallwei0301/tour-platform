import { notFound, redirect } from 'next/navigation';
import { getActivityBySlugDb, buildCanonicalActivityDetailPath } from '../../../src/lib/db.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

const RENDER_PROBE_MODE = process.env.GH502_RENDER_PROBE_MODE === '1';
const RENDER_PROBE_SLUG = '__render_probe__';

export default async function ActivityDetailCompatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (RENDER_PROBE_MODE && slug === RENDER_PROBE_SLUG) {
    redirect(`/activities/taipei/${RENDER_PROBE_SLUG}`);
  }

  const activity = await getActivityBySlugDb(slug);
  if (!activity) return notFound();

  redirect(buildCanonicalActivityDetailPath(activity));
}
