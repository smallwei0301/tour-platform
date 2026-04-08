'use client';

import Image from 'next/image';
import { getImageUrl, getImageAlt } from '@/lib/image-utils';

interface ImageWithFallbackProps {
  src: string | null | undefined;
  type: 'avatar' | 'hero' | 'gallery';
  alt?: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Image component with automatic placeholder fallback
 * - If src is empty/null, displays placeholder
 * - Supports avatar, hero (16:9), gallery (3:2) types
 */
export function ImageWithFallback({
  src,
  type,
  alt,
  width,
  height,
  style,
  className,
}: ImageWithFallbackProps) {
  const imageUrl = getImageUrl(src, type);
  const imageAlt = alt || getImageAlt(type);

  // For Next.js Image component, we need explicit dimensions
  // Fallback to CSS sizing if not provided
  if (!width || !height) {
    return (
      <img
        src={imageUrl}
        alt={imageAlt}
        style={style}
        className={className}
      />
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={imageAlt}
      width={width}
      height={height}
      style={style}
      className={className}
    />
  );
}
