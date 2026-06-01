'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import WishlistToggle from '../WishlistToggle';
import { createClient } from '../../lib/supabase/client';
import { useSelectedPlan } from './SelectedPlanContext';
import { resolveBottomBarCta } from '../../lib/activity-bottom-bar-cta.mjs';

interface ActivityBottomBarProps {
  activitySlug: string;
  activityId: string;
  priceLabel: string;
  price: number;
  useBookingV2: boolean;
  directBookingHref?: string;
  initialWishlisted?: boolean;
  planSectionId?: string;
  bookingUnavailable?: boolean;
}

export function ActivityBottomBar({
  activitySlug,
  activityId,
  priceLabel,
  useBookingV2,
  directBookingHref,
  initialWishlisted: initialWishlistedProp = false,
  planSectionId = 'section-plan',
  bookingUnavailable = false,
}: ActivityBottomBarProps) {
  const [initialWishlisted, setInitialWishlisted] = useState(initialWishlistedProp);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { selected } = useSelectedPlan();

  // Resolve auth state on mount and subscribe to changes (mirrors Navbar pattern)
  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setIsLoggedIn(!!data.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

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

  const cta = resolveBottomBarCta({
    selected,
    directBookingHref,
    activitySlug,
    useBookingV2,
    planSectionId,
  });

  const showSelectedSnapshot = Boolean(selected && cta.mode === 'book');
  const unitLabel = selected?.priceType === 'per_group' ? '組' : '人';

  return (
    <div className="tp-activity-bottom-bar">
      <div className="tp-activity-bottom-bar-inner">
        <div className="tp-bottom-bar-price">
          {showSelectedSnapshot ? (
            <>
              <span className="tp-bottom-bar-price-label">{selected!.label}</span>
              <strong className="tp-bottom-bar-price-value">
                NT${selected!.price.toLocaleString()} / {unitLabel}
              </strong>
            </>
          ) : (
            <>
              <span className="tp-bottom-bar-price-label">起價</span>
              <strong className="tp-bottom-bar-price-value">{priceLabel}</strong>
            </>
          )}
        </div>
        <div className="tp-bottom-bar-actions">
          <WishlistToggle activityId={activityId} initialWishlisted={initialWishlisted} isLoggedIn={isLoggedIn} />
          {bookingUnavailable ? (
            <span
              className="tp-btn tp-bottom-bar-cta"
              aria-disabled="true"
              data-testid="activity-bottom-bar-unavailable"
              style={{ background: '#e5e7eb', color: '#6b7280', cursor: 'not-allowed' }}
            >
              目前無可預約方案
            </span>
          ) : cta.mode === 'book' ? (
            <Link href={cta.href!} className="tp-btn tp-btn-primary tp-bottom-bar-cta">
              {cta.label}
            </Link>
          ) : (
            <button
              type="button"
              className="tp-btn tp-btn-primary tp-bottom-bar-cta"
              onClick={() => {
                if (typeof document === 'undefined') return;
                const el = document.getElementById(cta.targetId!);
                if (!el) return;
                const offset = 72; // matches SectionAnchorNav navbar offset
                const y = el.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top: y, behavior: 'smooth' });
              }}
            >
              {cta.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
