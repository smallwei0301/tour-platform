'use client';

import { useState } from 'react';
import Link from 'next/link';

interface ActivityBottomBarProps {
  activitySlug: string;
  priceLabel: string;
  price: number;
}

export function ActivityBottomBar({
  activitySlug,
  priceLabel,
  price,
}: ActivityBottomBarProps) {
  const [wishlisted, setWishlisted] = useState(false);

  return (
    <div className="tp-activity-bottom-bar">
      <div className="tp-activity-bottom-bar-inner">
        <div className="tp-bottom-bar-price">
          <span className="tp-bottom-bar-price-label">起價</span>
          <strong className="tp-bottom-bar-price-value">{priceLabel}</strong>
        </div>
        <div className="tp-bottom-bar-actions">
          <button
            className={`tp-bottom-bar-wishlist${wishlisted ? ' active' : ''}`}
            onClick={() => setWishlisted((v) => !v)}
            aria-label={wishlisted ? '取消收藏' : '加入收藏'}
          >
            {wishlisted ? '❤️' : '🤍'}
          </button>
          <Link
            href={`/booking/${activitySlug}`}
            className="tp-btn tp-btn-primary tp-bottom-bar-cta"
          >
            選擇方案
          </Link>
        </div>
      </div>
    </div>
  );
}
