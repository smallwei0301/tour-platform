'use client';
import Image from 'next/image';

import { useState } from 'react';

interface ActivityHeroProps {
  imageUrl?: string | null;
  title: string;
  height?: number | string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Activity hero section with placeholder fallback
 * - Shows actual image if URL exists and loads successfully
 * - Falls back to gradient placeholder on error or missing URL
 * - Supports overlay content via children
 */
export function ActivityHero({
  imageUrl,
  title,
  height = 400,
  className = '',
  children,
}: ActivityHeroProps) {
  const [imageError, setImageError] = useState(false);

  const hasValidImage = imageUrl && !imageError;

  // Gradient placeholder colors
  const placeholderGradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)';

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    background: hasValidImage ? '#f3f4f6' : placeholderGradient,
  };

  return (
    <div className={className} style={containerStyle}>
      {hasValidImage ? (
        <>
          <Image
            src={imageUrl}
            alt={`${title} 封面`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={() => setImageError(true)}
            priority
            width={1200} height={675} />
          {/* Overlay gradient for better text readability */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.4))',
            }}
          />
        </>
      ) : (
        <>
          {/* Placeholder content */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            <span style={{ fontSize: 48, marginBottom: 8 }}>🏞️</span>
            <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.8 }}>行程封面</span>
          </div>
        </>
      )}

      {/* Overlay content (e.g., title, breadcrumb) */}
      {children && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: 20,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
