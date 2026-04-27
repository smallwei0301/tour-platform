import { redirect } from 'next/navigation';

interface LineBookingEntryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function LineBookingEntryPage({ searchParams }: LineBookingEntryPageProps) {
  const params = await searchParams;

  const handoffParams = new URLSearchParams();
  handoffParams.set('mode', 'redirect');

  const passthroughKeys = ['activityId', 'plan', 'date', 'timezone', 'correlationId'] as const;
  for (const key of passthroughKeys) {
    const value = pickFirst(params[key]).trim();
    if (value) handoffParams.set(key, value);
  }

  redirect(`/api/v2/line/auth/handoff?${handoffParams.toString()}`);
}
