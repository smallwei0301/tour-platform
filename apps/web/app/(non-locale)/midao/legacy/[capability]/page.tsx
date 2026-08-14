import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { resolveMidaoLegacyEntry } from '../../../../../src/lib/midao/legacy-entry';
import { resolveMidaoPageSession } from '../../../../../src/lib/midao/page-session';

type MidaoLegacyEntryPageProps = {
  params: Promise<{ capability: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

export default async function MidaoLegacyEntryPage({
  params,
  searchParams,
}: MidaoLegacyEntryPageProps) {
  const incoming = await headers();
  const request = new Request('http://midao.local/midao/legacy', {
    headers: { cookie: incoming.get('cookie') || '' },
  });
  const sessionResult = await resolveMidaoPageSession(request);
  if (sessionResult.kind === 'redirect') redirect(sessionResult.location);
  if (sessionResult.kind === 'denied') notFound();

  const { capability } = await params;
  const { returnTo } = await searchParams;
  const destination = resolveMidaoLegacyEntry(capability, typeof returnTo === 'string' ? returnTo : null);
  if (destination === null) notFound();
  redirect(destination);
}
