'use client';

import { useState } from 'react';

interface GuideAvatarProps {
  photoUrl?: string | null;
  name: string;
  size?: number;
  className?: string;
  showBorder?: boolean;
}

/**
 * Guide avatar with placeholder fallback
 * - Shows actual photo if URL exists and loads successfully
 * - Falls back to placeholder on error or missing URL
 * - Circular display with optional border
 */
export function GuideAvatar({
  photoUrl,
  name,
  size = 96,
  className = '',
  showBorder = true,
}: GuideAvatarProps) {
  const [imageError, setImageError] = useState(false);

  const hasValidImage = photoUrl && !imageError;

  // Generate initials from name (first character or first two for multi-char names)
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: 0,
    border: showBorder ? '3px solid var(--tp-primary, #16a34a)' : 'none',
    background: hasValidImage ? 'transparent' : 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const initialsStyle: React.CSSProperties = {
    fontSize: size * 0.35,
    fontWeight: 700,
    color: '#6366f1',
    letterSpacing: 1,
  };

  return (
    <div className={className} style={containerStyle}>
      {hasValidImage ? (
        <img
          src={photoUrl}
          alt={`${name} 頭像`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
          onError={() => setImageError(true)}
        />
      ) : (
        <span style={initialsStyle}>{initials}</span>
      )}
    </div>
  );
}
