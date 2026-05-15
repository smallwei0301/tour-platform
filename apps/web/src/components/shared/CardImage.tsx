'use client';
import Image from 'next/image';

import { useState } from 'react';

interface CardImageProps {
  url?: string | null;
  alt: string;
  className?: string;
  aspectRatio?: string;
}

/**
 * Card image with placeholder fallback
 * - Shows actual image if URL exists and loads successfully
 * - Falls back to gradient placeholder on error or missing URL
 */
export function CardImage({
  url,
  alt,
  className = '',
  aspectRatio = '16/9',
}: CardImageProps) {
  const [error, setError] = useState(false);

  const hasValidImage = url && !error;

  if (!hasValidImage) {
    return (
      <div
        className={className}
        style={{
          width: '100%',
          aspectRatio,
          background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 50%, #ddd6fe 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6366f1',
        }}
      >
        <span style={{ fontSize: 32, marginBottom: 4 }}>🏞️</span>
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setError(true)} width={1200} height={675} />
  );
}
