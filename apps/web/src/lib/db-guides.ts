/**
 * DB Guide Queries — Dynamic loading with fixtures fallback
 * Phase 10-5 — Tour Platform
 *
 * Tries Supabase first; falls back to in-memory fixtures if:
 * - Supabase env vars are missing
 * - Query returns empty results
 * - Query throws an error
 */

import { createClient } from '@supabase/supabase-js';
import { guides as fixtureGuides, type GuideProfile } from '../fixtures/data';

// ── Supabase client ────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Type mapping: DB row → GuideProfile ───────────────────────────────────────

interface GuideRow {
  id: string;
  slug: string;
  display_name: string;
  headline: string;
  short_bio: string;
  long_bio: string;
  region: string;
  languages: string[];
  specialties: string[];
  verification_badges: string[];
  avatar_url: string;
  hero_image_url: string;
  gallery_urls: string[];
  rating: number;
  review_count: number;
  service_count: number;
}

function mapRowToGuide(row: GuideRow): GuideProfile {
  return {
    slug: row.slug,
    displayName: row.display_name,
    headline: row.headline,
    shortBio: row.short_bio,
    longBio: row.long_bio,
    region: row.region,
    languages: row.languages ?? [],
    specialties: row.specialties ?? [],
    verificationBadges: row.verification_badges ?? [],
    avatarUrl: row.avatar_url,
    heroImageUrl: row.hero_image_url,
    galleryUrls: row.gallery_urls ?? [],
    rating: row.rating ?? 5.0,
    reviewCount: row.review_count ?? 0,
    serviceCount: row.service_count ?? 0,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get all guides (DB first, fixtures fallback)
 */
export async function getAllGuides(): Promise<GuideProfile[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('guides')
        .select('*')
        .order('display_name');

      if (!error && data && data.length > 0) {
        return data.map(mapRowToGuide);
      }
      if (error) {
        console.warn('[db-guides] getAllGuides DB error, using fixtures:', error.message);
      }
    } catch (err) {
      console.warn('[db-guides] getAllGuides exception, using fixtures:', err);
    }
  }

  // Fallback
  return fixtureGuides;
}

/**
 * Get guide by slug (DB first, fixtures fallback)
 */
export async function getGuideBySlug(slug: string): Promise<GuideProfile | null> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('guides')
        .select('*')
        .eq('slug', slug)
        .single();

      if (!error && data) {
        return mapRowToGuide(data as GuideRow);
      }
      if (error && error.code !== 'PGRST116') {
        // PGRST116 = not found, expected; other errors are warnings
        console.warn(`[db-guides] getGuideBySlug(${slug}) DB error, using fixtures:`, error.message);
      }
    } catch (err) {
      console.warn(`[db-guides] getGuideBySlug(${slug}) exception, using fixtures:`, err);
    }
  }

  // Fallback
  return fixtureGuides.find((g) => g.slug === slug) ?? null;
}

/**
 * Get guides by region
 */
export async function getGuidesByRegion(region: string): Promise<GuideProfile[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('guides')
        .select('*')
        .eq('region', region)
        .order('rating', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map(mapRowToGuide);
      }
      if (error) {
        console.warn(`[db-guides] getGuidesByRegion(${region}) DB error, using fixtures:`, error.message);
      }
    } catch (err) {
      console.warn(`[db-guides] getGuidesByRegion(${region}) exception, using fixtures:`, err);
    }
  }

  // Fallback
  return fixtureGuides.filter((g) => g.region === region);
}
