/**
 * Image URL utilities with placeholder fallback
 */

const PLACEHOLDERS = {
  avatar: '/images/placeholder-avatar.svg',
  hero: '/images/placeholder-hero.svg',
  gallery: '/images/placeholder-gallery.svg',
};

export function getImageUrl(
  url: string | null | undefined,
  type: 'avatar' | 'hero' | 'gallery'
): string {
  if (url && url.trim()) {
    return url;
  }
  return PLACEHOLDERS[type];
}

export function getImageAlt(type: 'avatar' | 'hero' | 'gallery'): string {
  const alts = {
    avatar: '導遊頭像',
    hero: '行程封面',
    gallery: '行程照片',
  };
  return alts[type];
}
