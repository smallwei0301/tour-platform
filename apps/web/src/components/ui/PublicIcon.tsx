import type { CSSProperties, ReactNode } from 'react';

type IconName =
  | 'search'
  | 'close'
  | 'calendar'
  | 'route'
  | 'star'
  | 'chat'
  | 'document'
  | 'pin'
  | 'shieldCheck'
  | 'clock'
  | 'footprints'
  | 'users'
  | 'ticket'
  | 'lock'
  | 'checkCircle'
  | 'xCircle'
  | 'thumbsUp'
  | 'sparkles'
  | 'phone'
  | 'globe'
  | 'refresh'
  | 'badgeCheck'
  | 'mountain';

interface PublicIconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function wrap(paths: ReactNode, size: number, className?: string, style?: CSSProperties, title?: string) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : 'presentation'}
      className={className}
      style={style}
      {...common}
    >
      {title ? <title>{title}</title> : null}
      {paths}
    </svg>
  );
}

export function PublicIcon({ name, size = 18, className, style, title }: PublicIconProps) {
  switch (name) {
    case 'search':
      return wrap(<><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></>, size, className, style, title);
    case 'close':
      return wrap(<><path d="M6 6l12 12"/><path d="M18 6 6 18"/></>, size, className, style, title);
    case 'calendar':
      return wrap(<><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M8 2.5v4"/><path d="M16 2.5v4"/><path d="M3 9.5h18"/></>, size, className, style, title);
    case 'route':
      return wrap(<><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 17c5 0 3-8 8-8"/></>, size, className, style, title);
    case 'star':
      return wrap(<path d="m12 3.8 2.5 5.1 5.7.8-4.1 4 1 5.7L12 16.7 6.9 19.4l1-5.7-4.1-4 5.7-.8z"/>, size, className, style, title);
    case 'chat':
      return wrap(<><path d="M5 6.5a3.5 3.5 0 0 1 3.5-3.5h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H11l-4 4v-4H8.5A3.5 3.5 0 0 1 5 11.5z"/></>, size, className, style, title);
    case 'document':
      return wrap(<><path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5z"/><path d="M14 3.5V8h4"/><path d="M9 12h6"/><path d="M9 16h4"/></>, size, className, style, title);
    case 'pin':
      return wrap(<><path d="M12 20s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10Z"/><circle cx="12" cy="10" r="2.2"/></>, size, className, style, title);
    case 'shieldCheck':
      return wrap(<><path d="M12 3 5.5 5.7v5.5c0 4 2.7 7.7 6.5 9.3 3.8-1.6 6.5-5.3 6.5-9.3V5.7z"/><path d="m9.5 12 1.8 1.8 3.7-3.8"/></>, size, className, style, title);
    case 'clock':
      return wrap(<><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3.5 2"/></>, size, className, style, title);
    case 'footprints':
      return wrap(<><path d="M9 6.5c0 1.7-.9 3.7-2.2 4.7-.8.6-1.8.7-2.4-.1-.8-1-.5-2.7.2-4.2.8-1.7 2-2.9 3.1-2.7.8.2 1.3 1.1 1.3 2.3Z"/><path d="M17 11.5c0 1.7-.9 3.7-2.2 4.7-.8.6-1.8.7-2.4-.1-.8-1-.5-2.7.2-4.2.8-1.7 2-2.9 3.1-2.7.8.2 1.3 1.1 1.3 2.3Z"/><path d="M8 14c1 1.6 1.2 3.4.5 5"/><path d="M16 19c-.2 1-.7 1.8-1.5 2.5"/></>, size, className, style, title);
    case 'users':
      return wrap(<><path d="M16 20v-1.2A3.8 3.8 0 0 0 12.2 15H7.8A3.8 3.8 0 0 0 4 18.8V20"/><circle cx="10" cy="8" r="3.2"/><path d="M16.5 15.5a3.3 3.3 0 0 1 3.5 3.3V20"/><path d="M15.5 5.5a3 3 0 0 1 0 5.9"/></>, size, className, style, title);
    case 'ticket':
      return wrap(<><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H19a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 15.5v-1a2 2 0 0 0 0-4z"/><path d="M9 6v12"/></>, size, className, style, title);
    case 'lock':
      return wrap(<><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/></>, size, className, style, title);
    case 'checkCircle':
      return wrap(<><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.3 2.3 4.7-4.8"/></>, size, className, style, title);
    case 'xCircle':
      return wrap(<><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/></>, size, className, style, title);
    case 'thumbsUp':
      return wrap(<><path d="M10 10V6.8c0-1 .7-2.5 1.8-3.3l.5-.4c.7-.5 1.7 0 1.7.9v3.4h3.2c1.3 0 2.2 1.2 1.8 2.4l-1.7 5.4a2.5 2.5 0 0 1-2.4 1.8H10"/><path d="M5 10h3v8H5z"/></>, size, className, style, title);
    case 'sparkles':
      return wrap(<><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2z"/><path d="m18.5 13 .7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z"/><path d="m5.5 14 .9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/></>, size, className, style, title);
    case 'phone':
      return wrap(<><path d="M6.8 4.5h2.3l1.2 3.8-1.7 1.7a14.6 14.6 0 0 0 5.4 5.4l1.7-1.7 3.8 1.2v2.3a1.8 1.8 0 0 1-2 1.8A15.8 15.8 0 0 1 5 6.5a1.8 1.8 0 0 1 1.8-2Z"/></>, size, className, style, title);
    case 'globe':
      return wrap(<><circle cx="12" cy="12" r="9"/><path d="M3.5 12h17"/><path d="M12 3c2.4 2.6 3.7 5.7 3.7 9S14.4 18.4 12 21c-2.4-2.6-3.7-5.7-3.7-9S9.6 5.6 12 3Z"/></>, size, className, style, title);
    case 'refresh':
      return wrap(<><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.8 9A7 7 0 0 1 18 6"/><path d="M17.2 15A7 7 0 0 1 6 18"/></>, size, className, style, title);
    case 'badgeCheck':
      return wrap(<><path d="M12 3.5 9.8 5 7 4.7 6 7.3 3.7 8.7l.5 2.7-1.5 2.1L4.5 15l-.2 2.8L7 18.7l1.3 2.5 2.7-.6 2.4 1.4 2.2-1.5 2.8.3 1-2.6 2.3-1.4-.5-2.7 1.5-2.1L19.5 9l.2-2.8-2.7-.9-1.3-2.5-2.7.6Z"/><path d="m9.3 12.3 1.9 1.9 4.1-4.2"/></>, size, className, style, title);
    case 'mountain':
      return wrap(<><path d="M3 19h18"/><path d="m5 19 5.5-9 3.5 5 2-3 3 7"/></>, size, className, style, title);
    default:
      return wrap(<circle cx="12" cy="12" r="9"/>, size, className, style, title);
  }
}
