'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '../lib/csrf-client';

interface WishlistToggleProps {
  activityId: string;
  initialWishlisted?: boolean;
  isLoggedIn?: boolean;
}

/**
 * Heart icon toggle for adding/removing an activity from the user's wishlist.
 * - Authenticated users: toggles optimistically via /api/me/wishlist (with CSRF headers)
 * - Unauthenticated users: redirects to /login
 */
export function WishlistToggle({
  activityId,
  initialWishlisted = false,
  isLoggedIn = false,
}: WishlistToggleProps) {
  const router = useRouter();
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }

    setLoading(true);
    const prev = wishlisted;
    // Optimistic update
    setWishlisted(!wishlisted);

    try {
      if (!wishlisted) {
        // Add to wishlist
        const res = await fetch('/api/me/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({ activityId }),
        });
        if (!res.ok) {
          setWishlisted(prev); // rollback on failure
        }
      } else {
        // Remove from wishlist
        const res = await fetch(`/api/me/wishlist/${activityId}`, {
          method: 'DELETE',
          headers: { ...csrfHeaders() },
        });
        if (!res.ok) {
          setWishlisted(prev); // rollback on failure
        }
      }
    } catch {
      setWishlisted(prev); // rollback on network error
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={wishlisted ? '取消收藏' : '加入收藏'}
      aria-pressed={wishlisted}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-full border transition
        ${wishlisted
          ? 'bg-red-50 border-red-300 text-red-500 hover:bg-red-100'
          : 'bg-white border-gray-300 text-gray-400 hover:border-red-300 hover:text-red-400'
        }
        disabled:opacity-50`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={wishlisted ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    </button>
  );
}

export default WishlistToggle;
