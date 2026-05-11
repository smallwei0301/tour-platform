'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { resolveBookingEntryHref } from '../../lib/booking-entry.mjs';
import WishlistToggle from '../WishlistToggle';

interface ActivityBottomBarProps {
  activitySlug: string;
  activityId: string;
  priceLabel: string;
  price: number;
  useBookingV2: boolean;
  initialWishlisted?: boolean;
}

export function ActivityBottomBar({
  activitySlug,
  activityId,
  priceLabel,
  useBookingV2,
  initialWishlisted: initialWishlistedProp = false,
}: ActivityBottomBarProps) {
  const [initialWishlisted, setInitialWishlisted] = useState(initialWishlistedProp);

  // Hydrate wishlist state from /api/me/wishlist/ids on mount
  useEffect(() => {
    fetch('/api/me/wishlist/ids')
      .then(r => r.json())
      .then(({ data }) => {
        const ids: string[] = data ?? [];
        setInitialWishlisted(ids.includes(activityId));
      })
      .catch(() => {}); // Silently handle — user will see unhearted state
  }, [activityId]);

  return (
    <div className="tp-activity-bottom-bar">
      <div className="tp-activity-bottom-bar-inner">
        <div className="tp-bottom-bar-price">
          <span className="tp-bottom-bar-price-label">起價</span>
          <strong className="tp-bottom-bar-price-value">{priceLabel}</strong>
        </div>
        <div className="tp-bottom-bar-actions">
          <WishlistToggle activityId={activityId} initialWishlisted={initialWishlisted} />
          <Link
            href={resolveBookingEntryHref({ activitySlug, useBookingV2 })}
            className="tp-btn tp-btn-primary tp-bottom-bar-cta"
          >
            選擇方案
          </Link>
        </div>
      </div>
    </div>
  );
}
