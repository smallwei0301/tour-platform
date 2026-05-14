'use client';
import Image from 'next/image';

import { useState } from 'react';

interface GalleryImageProps {
  url: string;
  alt: string;
  aspectRatio?: string;
}

/**
 * Gallery image with error fallback
 * - Shows actual image if loads successfully
 * - Falls back to placeholder on error
 */
export function GalleryImage({
  url,
  alt,
  aspectRatio = '4/3',
}: GalleryImageProps) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        style={{
          width: '100%',
          aspectRatio,
          background: '#f3f4f6',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
        }}
      >
        <span style={{ fontSize: 24, marginBottom: 4 }}>📷</span>
        <span style={{ fontSize: 12 }}>無法載入</span>
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      style={{
        width: '100%',
        aspectRatio,
        objectFit: 'cover',
        borderRadius: 10,
      }}
      loading="lazy"
      onError={() => setError(true)} width={1200} height={675} />
  );
}
