import test from 'node:test';
import assert from 'node:assert/strict';
import { __setSupabaseClientForTest, getActivityBySlugDb } from '../../src/lib/db.mjs';

function createSupabaseMock(results) {
  let index = 0;

  const take = (terminal, table, filters) => {
    const next = results[index++];
    assert.ok(next, `unexpected query: ${terminal} on ${table}`);
    assert.equal(next.terminal, terminal, `terminal mismatch for ${table}`);
    assert.equal(next.table, table, `table mismatch for ${terminal}`);
    if (typeof next.assertFilters === 'function') {
      next.assertFilters(filters);
    }
    return { data: next.data ?? null, error: next.error ?? null };
  };

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
    }
    select() {
      return this;
    }
    eq(column, value) {
      this.filters.push(['eq', column, value]);
      return this;
    }
    in(column, values) {
      this.filters.push(['in', column, values]);
      return this;
    }
    order(column, options) {
      this.filters.push(['order', column, options]);
      return this;
    }
    limit(value) {
      this.filters.push(['limit', value]);
      return this;
    }
    single() {
      return Promise.resolve(take('single', this.table, this.filters));
    }
    maybeSingle() {
      return Promise.resolve(take('maybeSingle', this.table, this.filters));
    }
    then(resolve, reject) {
      return Promise.resolve(take('then', this.table, this.filters)).then(resolve, reject);
    }
  }

  return {
    from(table) {
      return new Query(table);
    },
    assertAllConsumed() {
      assert.equal(index, results.length, 'not all mocked queries were consumed');
    },
  };
}

test('issue1237: public activity detail rewrites schedule planId to canonical formal plan ids and drops unknown legacy plan ids', async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

  const supabase = createSupabaseMock([
    {
      terminal: 'single',
      table: 'activities',
      data: {
        id: 'c0000003-0000-0000-0000-000000000001',
        slug: 'kaohsiung-chaishan-cave-experience',
        title: '柴山秘境',
        tagline: 'tagline',
        short_description: 'short',
        description: 'long',
        region: '高雄',
        region_slug: 'kaohsiung',
        category: 'adventure',
        price_twd: 2000,
        duration_minutes: 240,
        min_participants: 4,
        max_participants: 12,
        meeting_point: 'meeting',
        meeting_point_map_url: null,
        cover_image_url: null,
        image_urls: [],
        inclusions: [],
        exclusions: [],
        notices: [],
        refund_rules: [],
        safety_notice: null,
        faq: [],
        good_for: [],
        not_good_for: [],
        itinerary: [],
        social_proof_quotes: [],
        status: 'published',
        rating_avg: 4.9,
        review_count: 2,
        guide_profiles: {
          id: 'guide-1',
          slug: 'guide-1',
          display_name: 'Guide One',
          headline: 'headline',
          bio: 'bio',
          region: '高雄',
          languages: ['zh-TW'],
          specialties: ['cave'],
          profile_photo_url: null,
          rating_avg: 4.9,
          review_count: 2,
          gallery_urls: [],
        },
      },
    },
    {
      terminal: 'then',
      table: 'activity_schedules',
      data: [
        {
          id: 'schedule-open-1',
          start_at: '2026-04-04T01:00:00+00:00',
          end_at: '2026-04-04T05:00:00+00:00',
          capacity: 8,
          booked_count: 2,
          status: 'open',
          plan_id: 'half-day',
          min_participants: 4,
          guide_note: null,
        },
        {
          id: 'schedule-open-2',
          start_at: '2026-04-05T01:00:00+00:00',
          end_at: '2026-04-05T09:00:00+00:00',
          capacity: 8,
          booked_count: 0,
          status: 'open',
          plan_id: 'ghost-plan',
          min_participants: 4,
          guide_note: null,
        },
        {
          id: 'schedule-open-3',
          start_at: '2026-04-06T01:00:00+00:00',
          end_at: '2026-04-06T09:00:00+00:00',
          capacity: 8,
          booked_count: 0,
          status: 'open',
          plan_id: null,
          min_participants: 4,
          guide_note: null,
        },
      ],
    },
    {
      terminal: 'then',
      table: 'activity_reviews',
      data: [],
    },
    {
      terminal: 'then',
      table: 'activity_plans',
      data: [
        {
          id: '0e975d65-6648-48e1-9c4a-a35e0f907be8',
          slug: 'half-day',
          name: '半日行程',
          duration_minutes: 240,
          price_type: 'per_person',
          base_price: 2000,
          min_participants: 4,
          max_participants: 12,
          status: 'active',
        },
        {
          id: '98b68b91-42b9-4b23-aab7-4a9a436ca20b',
          slug: 'full-day',
          name: '全日深度探索',
          duration_minutes: 480,
          price_type: 'per_person',
          base_price: 3600,
          min_participants: 4,
          max_participants: 12,
          status: 'active',
        },
      ],
    },
  ]);

  __setSupabaseClientForTest(supabase);
  try {
    const activity = await getActivityBySlugDb('kaohsiung-chaishan-cave-experience');

    assert.equal(activity.plans[0].id, '0e975d65-6648-48e1-9c4a-a35e0f907be8');
    assert.equal(activity.plans[1].id, '98b68b91-42b9-4b23-aab7-4a9a436ca20b');

    assert.equal(
      activity.schedules.find((schedule) => schedule.id === 'schedule-open-1')?.planId,
      '0e975d65-6648-48e1-9c4a-a35e0f907be8',
      'legacy schedule plan slug should be canonicalized to the formal plan UUID emitted in plans[]',
    );
    assert.equal(
      activity.schedules.find((schedule) => schedule.id === 'schedule-open-2')?.planId,
      null,
      'unknown legacy schedule plan ids should not be emitted as bookable Booking V2 plan ids',
    );
    assert.equal(
      activity.schedules.find((schedule) => schedule.id === 'schedule-open-3')?.planId,
      null,
      'null schedule plan ids should remain null for generic schedule fallback handling',
    );

    supabase.assertAllConsumed();
  } finally {
    __setSupabaseClientForTest(null);
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('issue1237: public activity detail does not emit raw fallback plans as bookable when no formal activity_plans rows exist', async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

  const supabase = createSupabaseMock([
    {
      terminal: 'single',
      table: 'activities',
      data: {
        id: 'activity-no-formal-plans',
        slug: 'legacy-only-activity',
        title: 'Legacy Only Activity',
        tagline: 'tagline',
        short_description: 'short',
        description: 'long',
        region: '高雄',
        region_slug: 'kaohsiung',
        category: 'adventure',
        price_twd: 2000,
        duration_minutes: 240,
        min_participants: 4,
        max_participants: 12,
        meeting_point: 'meeting',
        meeting_point_map_url: null,
        cover_image_url: null,
        image_urls: [],
        inclusions: [],
        exclusions: [],
        notices: [],
        refund_rules: [],
        safety_notice: null,
        faq: [],
        good_for: [],
        not_good_for: [],
        itinerary: [],
        social_proof_quotes: [],
        status: 'published',
        rating_avg: 4.9,
        review_count: 2,
        plans: [
          {
            id: 'raw-legacy-plan-uuid',
            label: '半日行程',
          },
        ],
        guide_profiles: {
          id: 'guide-1',
          slug: 'guide-1',
          display_name: 'Guide One',
          headline: 'headline',
          bio: 'bio',
          region: '高雄',
          languages: ['zh-TW'],
          specialties: ['cave'],
          profile_photo_url: null,
          rating_avg: 4.9,
          review_count: 2,
          gallery_urls: [],
        },
      },
    },
    {
      terminal: 'then',
      table: 'activity_schedules',
      data: [
        {
          id: 'legacy-schedule-1',
          start_at: '2026-04-04T01:00:00+00:00',
          end_at: '2026-04-04T05:00:00+00:00',
          capacity: 8,
          booked_count: 2,
          status: 'open',
          plan_id: 'half-day',
          min_participants: 4,
          guide_note: null,
        },
      ],
    },
    {
      terminal: 'then',
      table: 'activity_reviews',
      data: [],
    },
    {
      terminal: 'then',
      table: 'activity_plans',
      data: [],
    },
  ]);

  __setSupabaseClientForTest(supabase);
  try {
    const activity = await getActivityBySlugDb('legacy-only-activity');
    assert.equal(activity.plans, null, 'raw activity.plans fallback should not be emitted as bookable Booking V2 plans');
    assert.equal(activity.schedules[0]?.planId, null, 'legacy schedule plan ids should be stripped when no formal source-of-truth exists');
    supabase.assertAllConsumed();
  } finally {
    __setSupabaseClientForTest(null);
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
