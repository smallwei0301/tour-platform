import { errorV2 } from '../api.ts';
import type { AvailabilityRule } from '../slot-generator.ts';
import type {
  AvailabilityPolicy,
  CanonicalAvailabilityRuleContext,
  GuideAvailabilityDayRevision,
} from './effective-availability-resolver.ts';

type SupabaseReadClient = {
  from: (table: string) => any;
};

type DynamicAvailabilityContextSeed = {
  availabilityPolicy?: AvailabilityPolicy;
  dayRevisions: GuideAvailabilityDayRevision[];
};

type DynamicAvailabilityContextResult =
  | { ok: true; seed: DynamicAvailabilityContextSeed }
  | { ok: false; response: Response };

function isAvailabilityPolicy(value: unknown): value is AvailabilityPolicy {
  return value === 'inherit' || value === 'restrict' || value === 'closed';
}

export async function loadDynamicAvailabilityContextSeed(input: {
  supabase: SupabaseReadClient;
  bookingType: unknown;
  availabilityPolicy: unknown;
  activityId: string;
  planId: string;
  guideId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<DynamicAvailabilityContextResult> {
  if (input.bookingType !== 'instant' && input.bookingType !== 'request') {
    return { ok: true, seed: { dayRevisions: [] } };
  }

  if (!isAvailabilityPolicy(input.availabilityPolicy)) {
    console.error('Invalid availability policy for dynamic plan', {
      activityId: input.activityId,
      planId: input.planId,
      availabilityPolicy: input.availabilityPolicy,
    });
    return {
      ok: false,
      response: Response.json(errorV2('INTERNAL_ERROR', 'Invalid availability policy'), {
        status: 500,
      }),
    };
  }

  const { data, error } = await input.supabase
    .from('guide_availability_day_revisions')
    .select('guide_id, local_date, timezone, revision, is_closed')
    .eq('guide_id', input.guideId)
    .gte('local_date', input.dateFrom)
    .lte('local_date', input.dateTo);

  if (error) {
    console.error('Error fetching availability day revisions:', error);
    return {
      ok: false,
      response: Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch availability day revisions'), {
        status: 500,
      }),
    };
  }

  return {
    ok: true,
    seed: {
      availabilityPolicy: input.availabilityPolicy,
      dayRevisions: (data || []).map((row: any) => ({
        guide_id: row.guide_id,
        local_date: row.local_date,
        timezone: row.timezone,
        revision: Number(row.revision),
        is_closed: Boolean(row.is_closed),
      })),
    },
  };
}

export function buildDynamicAvailabilityRuleContext(
  seed: DynamicAvailabilityContextSeed,
  input: {
    guideId: string;
    planId: string;
    rules: AvailabilityRule[];
    timezone: string;
  },
): CanonicalAvailabilityRuleContext | undefined {
  return seed.availabilityPolicy
    ? {
        guideId: input.guideId,
        planId: input.planId,
        policy: seed.availabilityPolicy,
        rules: input.rules,
        dayRevisions: seed.dayRevisions,
        timezone: input.timezone,
      }
    : undefined;
}
