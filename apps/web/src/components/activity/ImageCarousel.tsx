'use client';

import { useRef, useState, useEffect } from 'react';

interface ImageCarouselProps {
  images: string[];
  alt: string;
}

/**
 * Image carousel with placeholder fallback
 * - Shows placeholder when no images available
 * - Handles image load errors gracefully
 * - Mobile: swipeable carousel
 * - Desktop: 3:1 grid layout
 */
export function ImageCarousel({ images, alt }: ImageCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [errorImages, setErrorImages] = useState<Set<number>>(new Set());

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!isNaN(idx)) setActiveIndex(idx);
          }
        });
      },
      { root: track, threshold: 0.6 }
    );

    Array.from(track.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [images]);

  // Filter out errored images
  const validImages = images.filter((_, i) => !errorImages.has(i));

  function handleImageError(index: number) {
    setErrorImages(prev => new Set(prev).add(index));
  }

  // No images or all failed - show placeholder
  if (!images || images.length === 0 || validImages.length === 0) {
    return (
      <div className="kkd-carousel-wrap">
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
          }}
        >
          <span style={{ fontSize: 48, marginBottom: 8 }}>📷</span>
          <span style={{ fontSize: 14 }}>暫無照片</span>
        </div>
      </div>
    );
  }

  return (
    <div className="kkd-carousel-wrap">
      {/* Mobile: swipeable */}
      <div className="kkd-carousel-track" ref={trackRef}>
        {images.map((url, i) => (
          <div key={i} className="kkd-carousel-slide" data-index={i}>
            {errorImages.has(i) ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: '#f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#9ca3af',
                  fontSize: 14,
                }}
              >
                無法載入
              </div>
            ) : (
              <img
                src={url}
                alt={`${alt} ${i + 1}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                onError={() => handleImageError(i)}
              />
            )}
          </div>
        ))}
      </div>

      {validImages.length > 1 && (
        <div className="kkd-carousel-dots">
          {images.map((_, i) => (
            <span
              key={i}
              className={`kkd-carousel-dot${i === activeIndex ? ' active' : ''}${errorImages.has(i) ? ' error' : ''}`}
              style={errorImages.has(i) ? { opacity: 0.3 } : undefined}
            />
          ))}
        </div>
      )}

      {/* Desktop: 3:1 grid */}
      <div className="kkd-gallery-desktop">
        {validImages.length > 0 && (
          <img
            src={validImages[0]}
            alt={alt}
            className="kkd-gallery-main"
            onError={() => handleImageError(images.indexOf(validImages[0]))}
          />
        )}
        {validImages.length > 1 && (
          <div className="kkd-gallery-grid">
            {validImages.slice(1, 4).map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`${alt} ${i + 2}`}
                className="kkd-gallery-thumb"
                loading="lazy"
                onError={() => handleImageError(images.indexOf(url))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
