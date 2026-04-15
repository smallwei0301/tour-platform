export type Plan = {
  id: string;
  activity_id: string;
  name: string;
  slug: string;
  duration_minutes: number;
  price_type: 'per_person' | 'per_group';
  base_price: number;
  min_participants: number;
  max_participants: number;
  booking_type: string;
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
  updated_at: string;
};

export const FALLBACK_PLANS: Record<string, Plan[]> = {
  'c680224f-b57d-409b-9dda-175c0f34b2bb': [
    {
      id: '5966611e-985b-40e0-802c-27ebbbc15069',
      activity_id: 'c680224f-b57d-409b-9dda-175c0f34b2bb',
      name: 'Judy Archive Probe',
      slug: 'judy-archive-probe',
      duration_minutes: 100,
      price_type: 'per_person',
      base_price: 800,
      min_participants: 1,
      max_participants: 2,
      booking_type: 'scheduled',
      status: 'inactive',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  '9bf5d0f8-aca1-4777-91c6-73ef1d172236': []
};
