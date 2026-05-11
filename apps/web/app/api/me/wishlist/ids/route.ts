import { NextResponse } from 'next/server';
import { createClient } from '../../../../../src/lib/supabase/server';

/**
 * GET /api/me/wishlist/ids
 *
 * Returns the list of wishlisted activity IDs for the logged-in user.
 * Returns { data: [] } (empty array, NOT 401) for unauthenticated users
 * so that UI can hydrate initialWishlisted props without auth errors.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      // Return empty array for unauthenticated — not 401
      return NextResponse.json({ data: [] });
    }

    const { data, error } = await supabase
      .from('wishlists')
      .select('activity_id')
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ data: [] });
    }

    const ids: string[] = (data ?? []).map((r: { activity_id: string }) => r.activity_id);
    return NextResponse.json({ data: ids });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
