// 祕島 LP 線繪圖示 — 黃銅單線風格，對齊 mockup 的手繪質感
type IconProps = { size?: number };

export function MountainIcon({ size = 34 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 36 14 18l6 10 6-14 14 22" />
      <path d="M11 24l3 4 3-5" />
      <path d="M26 18l3 5 3-4" />
      <path d="M16 36c3-2 6-1 9-3s6-1 9-3" strokeDasharray="2.5 3.5" strokeWidth="1.3" />
    </svg>
  );
}

export function WaveIcon({ size = 34 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 34c4-14 16-20 28-16-7 0-12 4-13 9 5-5 13-5 17 0-6-1-10 1-12 5" />
      <path d="M21 27a6 6 0 0 1 6 0" />
      <path d="M4 40c3-2 6-2 9 0s6 2 9 0 6-2 9 0 6 2 9 0" strokeWidth="1.3" />
    </svg>
  );
}

export function TribalIcon({ size = 34 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M24 6l8 8-8 8-8-8z" />
      <path d="M24 12l4 2-4 4-4-4z" strokeWidth="1.2" />
      <path d="M12 24l6 6-6 6-6-6z" />
      <path d="M36 24l6 6-6 6-6-6z" />
      <path d="M24 30l5 5-5 5-5-5z" />
      <circle cx="24" cy="35" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TeaLeafIcon({ size = 34 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M34 8C18 12 10 22 12 36c14 2 24-6 26-22 0-2-1-5-4-6z" />
      <path d="M14 34C20 26 26 20 33 13" strokeWidth="1.3" />
      <path d="M20 28c2 1 5 1 7-1M25 22c2 1 4 0 6-1" strokeWidth="1.1" />
      <path d="M12 36c-2 2-3 4-3 6" strokeWidth="1.3" />
    </svg>
  );
}

export function HikeIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 20 9 8l4 6 3-8 6 14" />
    </svg>
  );
}

export function NightsIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z" />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 26 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 3 5 7v8c0 7 4.5 11.5 11 14 6.5-2.5 11-7 11-14V7z" />
      <path d="M11 16l3.5 3.5L21 13" />
    </svg>
  );
}

export function CompassIcon({ size = 26 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="16" cy="16" r="12.5" />
      <path d="M21 11l-3.2 6.8L11 21l3.2-6.8z" />
      <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BadgeShieldIcon({ size = 26 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 3 5 7v8c0 7 4.5 11.5 11 14 6.5-2.5 11-7 11-14V7z" />
      <path d="M16 9l2 4 4 .5-3 3 .8 4.2L16 18.6l-3.8 2.1.8-4.2-3-3 4-.5z" strokeWidth="1.2" />
    </svg>
  );
}

export function StarIcon({ size = 26, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 4l3.7 7.6 8.3 1.2-6 5.9 1.4 8.3L16 23l-7.4 4 1.4-8.3-6-5.9 8.3-1.2z" />
    </svg>
  );
}
