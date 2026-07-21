// #1649：五個 legacy 訂單/金流 helper（fetchExperiences/fetchMyOrders/
// fetchMyOrderDetail/fetchRefundRequests/createRefundRequest/submitEcpayCallback）
// 為零消費者死碼，已隨 traveler 端全面切換 /api/v2/orders/** 一併移除。
// 訂單讀寫一律走 v2 routes；建單走 POST /api/v2/bookings → /api/v2/bookings/[id]/checkout。

export async function fetchActivityBySlug(slug: string) {
  const res = await fetch(`/api/activities/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  const json = await res.json();
  if (!json.ok) throw new Error(json?.error?.message || 'activity not found');
  return json.data;
}

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function fetchActivityByIdOrSlug(activityIdOrSlug: string) {
  if (UUID_PATTERN.test(activityIdOrSlug)) {
    const listRes = await fetch(`/api/activities`, { cache: 'no-store' });
    const listJson = await listRes.json();
    const activity = Array.isArray(listJson?.data)
      ? listJson.data.find((item: { id?: string; slug?: string }) => item?.id === activityIdOrSlug)
      : null;

    if (!listRes.ok || !listJson?.ok || !activity?.slug) {
      throw new Error(listJson?.error?.message || 'activity not found');
    }

    return {
      activity: await fetchActivityBySlug(activity.slug),
      canonicalSlug: activity.slug,
    };
  }

  const res = await fetch(`/api/activities/${encodeURIComponent(activityIdOrSlug)}`, { cache: 'no-store' });
  const json = await res.json();
  if (json?.ok && json?.data) {
    return {
      activity: json.data,
      canonicalSlug: json.data.slug || activityIdOrSlug,
    };
  }
  if (res.status === 404) throw new Error('activity not found');
  throw new Error(json?.error?.message || 'activity not found');
}
