/**
 * DB Review Queries — Dynamic loading with fixtures fallback
 * Phase 10-5 — Tour Platform
 *
 * Tries Supabase first; falls back to in-memory fixtures if:
 * - Supabase env vars are missing
 * - Query returns empty results
 * - Query throws an error
 */

import { createClient } from '@supabase/supabase-js';
import {
  reviews as fixtureReviews,
  getReviewsByActivity as fixtureGetByActivity,
  getReviewsByGuide as fixtureGetByGuide,
  type Review,
} from '../fixtures/data';

// ── Supabase client ────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Type mapping: DB row → Review ─────────────────────────────────────────────

interface ReviewRow {
  id: string;
  activity_slug: string;
  guide_slug: string;
  author: string;
  city: string;
  rating: number;
  text: string;
  date: string;
}

function mapRowToReview(row: ReviewRow): Review {
  return {
    id: row.id,
    activitySlug: row.activity_slug,
    guideSlug: row.guide_slug,
    author: row.author,
    city: row.city,
    rating: row.rating,
    text: row.text,
    date: row.date,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get all reviews (DB first, fixtures fallback)
 */
export async function getAllReviews(): Promise<Review[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .order('date', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map(mapRowToReview);
      }
      if (error) {
        console.warn('[db-reviews] getAllReviews DB error, using fixtures:', error.message);
      }
    } catch (err) {
      console.warn('[db-reviews] getAllReviews exception, using fixtures:', err);
    }
  }

  return fixtureReviews;
}

/**
 * Get reviews by activity slug (DB first, fixtures fallback)
 */
export async function getReviewsByActivity(activitySlug: string): Promise<Review[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('activity_slug', activitySlug)
        .order('date', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map(mapRowToReview);
      }
      if (error) {
        console.warn(`[db-reviews] getReviewsByActivity(${activitySlug}) DB error, using fixtures:`, error.message);
      }
    } catch (err) {
      console.warn(`[db-reviews] getReviewsByActivity(${activitySlug}) exception, using fixtures:`, err);
    }
  }

  return fixtureGetByActivity(activitySlug);
}

/**
 * Get reviews by guide slug (DB first, fixtures fallback)
 */
export async function getReviewsByGuide(guideSlug: string): Promise<Review[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('guide_slug', guideSlug)
        .order('date', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map(mapRowToReview);
      }
      if (error) {
        console.warn(`[db-reviews] getReviewsByGuide(${guideSlug}) DB error, using fixtures:`, error.message);
      }
    } catch (err) {
      console.warn(`[db-reviews] getReviewsByGuide(${guideSlug}) exception, using fixtures:`, err);
    }
  }

  return fixtureGetByGuide(guideSlug);
}

/**
 * Get average rating for an activity (DB first, fixtures fallback)
 */
export async function getActivityRating(activitySlug: string): Promise<{ rating: number; count: number }> {
  const reviews = await getReviewsByActivity(activitySlug);
  if (reviews.length === 0) return { rating: 0, count: 0 };
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return { rating: Math.round(avg * 10) / 10, count: reviews.length };
}
