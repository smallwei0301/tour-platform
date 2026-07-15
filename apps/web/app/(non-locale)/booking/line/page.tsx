import { redirect } from 'next/navigation';

import { isLineLiffEnabled } from '../../../../src/config/feature-flags.mjs';
import LineLiffEntryClient from './LineLiffEntryClient';

interface LineBookingEntryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function LineBookingEntryPage({ searchParams }: LineBookingEntryPageProps) {
  const params = await searchParams;

  // Flag ON: real LIFF login + idToken verification (client component).
  if (isLineLiffEnabled()) {
    return (
      <LineLiffEntryClient
        activityId={pickFirst(params.activityId).trim()}
        correlationId={pickFirst(params.correlationId).trim()}
        plan={pickFirst(params.plan).trim()}
        date={pickFirst(params.date).trim()}
        timezone={pickFirst(params.timezone).trim()}
      />
    );
  }

  // Flag OFF (default): legacy query-param handoff — instant rollback path.
  const handoffParams = new URLSearchParams();
  handoffParams.set('mode', 'redirect');

  const passthroughKeys = ['activityId', 'plan', 'date', 'timezone', 'correlationId'] as const;
  for (const key of passthroughKeys) {
    const value = pickFirst(params[key]).trim();
    if (value) handoffParams.set(key, value);
  }

  redirect(`/api/v2/line/auth/handoff?${handoffParams.toString()}`);
}
