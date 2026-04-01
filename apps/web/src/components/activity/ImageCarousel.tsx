'use client';

import { useRef, useState, useEffect } from 'react';

interface ImageCarouselProps {
  images: string[];
  alt: string;
}

export function ImageCarousel({ images, alt }: ImageCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

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

  if (!images || images.length === 0) return null;

  return (
    <div className="kkd-carousel-wrap">
      {/* Mobile: swipeable */}
      <div className="kkd-carousel-track" ref={trackRef}>
        {images.map((url, i) => (
          <div key={i} className="kkd-carousel-slide" data-index={i}>
            <img src={url} alt={`${alt} ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="kkd-carousel-dots">
          {images.map((_, i) => (
            <span
              key={i}
              className={`kkd-carousel-dot${i === activeIndex ? ' active' : ''}`}
            />
          ))}
        </div>
      )}

      {/* Desktop: 3:1 grid */}
      <div className="kkd-gallery-desktop">
        <img src={images[0]} alt={alt} className="kkd-gallery-main" />
        {images.length > 1 && (
          <div className="kkd-gallery-grid">
            {images.slice(1, 4).map((url, i) => (
              <img key={i} src={url} alt={`${alt} ${i + 2}`} className="kkd-gallery-thumb" loading="lazy" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
