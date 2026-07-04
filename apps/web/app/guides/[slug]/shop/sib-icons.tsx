// 祕島 shop 重設計用的線條圖示（server-safe，純 SVG）。
import type { CSSProperties } from 'react';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function MountainCircleLogo({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r="26" {...S} strokeWidth={1.4} />
      <path d="M12 36l8-11 6 7 4-6 8 10z" {...S} />
      <path d="M10 40h36" {...S} />
    </svg>
  );
}

export function LeafIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden>
      <path d="M4 16C4 9 9 4 16 4c0 7-5 12-12 12z" {...S} stroke="#d9c98f" />
      <path d="M6 14L15 5" {...S} stroke="#d9c98f" />
    </svg>
  );
}

export function StepMountain() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <circle cx="33" cy="15" r="5" {...S} stroke="#c9a94e" />
      <path d="M6 40l11-16 8 10 5-7 12 13z" {...S} />
    </svg>
  );
}

export function StepCalendar() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <rect x="8" y="11" width="32" height="28" rx="3" {...S} />
      <path d="M8 19h32M16 8v6M32 8v6" {...S} />
      <circle cx="32" cy="30" r="7" {...S} />
      <path d="M32 26v4l3 2" {...S} />
    </svg>
  );
}

export function StepClipboard() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <rect x="11" y="9" width="26" height="32" rx="3" {...S} />
      <path d="M18 9a6 6 0 0112 0" {...S} />
      <path d="M17 20h10M17 26h8" {...S} />
      <path d="M28 32l7-7 3 3-7 7-3.5.5z" {...S} stroke="#c9a94e" />
    </svg>
  );
}

export function CtaMountain({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 30" aria-hidden>
      <path d="M2 26l11-15 7 9 5-6 13 12z" fill="none" stroke="#e7c98a" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRight({ style }: { style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" style={style} aria-hidden>
      <path d="M5 12h13M13 6l6 6-6 6" {...S} stroke="currentColor" strokeWidth={1.8} />
    </svg>
  );
}

export function PersonIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="4" {...S} />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" {...S} />
    </svg>
  );
}
