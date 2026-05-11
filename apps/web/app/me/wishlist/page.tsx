'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../src/lib/supabase/client';

type WishlistItem = {
  id: string;
  activityId: string;
  addedAt: string;
  title: string;
  slug: string;
  priceTwd: number;
  coverImageUrl: string | null;
};

export default function WishlistPage() {
  const router = useRouter();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      await fetchWishlist();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchWishlist() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/me/wishlist');
      const json = await res.json();
      if (!json.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        setError(json.error?.message || '載入失敗');
      } else {
        setItems(json.data || []);
      }
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(activityId: string) {
    setRemovingId(activityId);
    try {
      const res = await fetch(`/api/me/wishlist/${activityId}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.activityId !== activityId));
      }
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) return <div className="p-8 text-center">載入中…</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">我的收藏</h1>
      {items.length === 0 ? (
        <p className="text-gray-500">目前沒有收藏的活動。</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-4 border rounded-lg p-4 hover:bg-gray-50 transition"
            >
              {item.coverImageUrl && (
                <img
                  src={item.coverImageUrl}
                  alt={item.title}
                  className="w-20 h-16 object-cover rounded"
                />
              )}
              <div className="flex-1 min-w-0">
                <a
                  href={`/activities/${item.slug}`}
                  className="text-base font-medium hover:underline block truncate"
                >
                  {item.title}
                </a>
                <p className="text-sm text-gray-500">
                  NT${item.priceTwd.toLocaleString()} 起
                </p>
              </div>
              <button
                onClick={() => handleRemove(item.activityId)}
                disabled={removingId === item.activityId}
                aria-label={`移除 ${item.title} 收藏`}
                className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50 px-3 py-1 border border-red-200 rounded"
              >
                {removingId === item.activityId ? '移除中…' : '移除'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
