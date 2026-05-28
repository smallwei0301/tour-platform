'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Props = {
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
};

export function ScrollRow({ className, children, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 2,
      right: el.scrollLeft < el.scrollWidth - el.clientWidth - 2,
    });
  };

  useEffect(() => {
    setMounted(true);
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollByStep = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const styles = getComputedStyle(el);
    const gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
    const cardW = first ? first.offsetWidth + gap : el.clientWidth;
    const visibleCards = Math.max(1, Math.floor(el.clientWidth / cardW) - 1);
    el.scrollBy({ left: dir * cardW * visibleCards, behavior: 'smooth' });
  };

  return (
    <div
      className="tp-scroll-row"
      role={ariaLabel ? 'region' : undefined}
      aria-label={ariaLabel}
    >
      <div ref={ref} className={className} onScroll={measure}>
        {children}
      </div>
      {mounted && (
        <>
          <button
            type="button"
            aria-label="上一張"
            className="tp-scroll-arrow tp-scroll-arrow-left"
            data-visible={edges.left}
            onClick={() => scrollByStep(-1)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3 L5 8 L10 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="下一張"
            className="tp-scroll-arrow tp-scroll-arrow-right"
            data-visible={edges.right}
            onClick={() => scrollByStep(1)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3 L11 8 L6 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
