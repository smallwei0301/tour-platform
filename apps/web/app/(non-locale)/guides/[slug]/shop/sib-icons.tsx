// 祕島 shop 圖示：使用使用者附件切割出的真實 icon 資產（/public/shop-icons/*）。
// 少數純裝飾線條（葉子/CTA 山線/箭頭）保留輕量 SVG。
import type { CSSProperties } from 'react';

// 單一 <img> 包裝（decorative icons；lint 對 <img> 的規則於此處統一停用）。
function Img({ src, w, h, alt = '', style, className }:
  { src: string; w: number; h: number; alt?: string; style?: CSSProperties; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={w} height={h} alt={alt} aria-hidden={alt === '' || undefined}
      className={className} style={{ objectFit: 'contain', display: 'block', ...style }} />
  );
}

const B = '/shop-icons';

// —— hero / 章節：山中圓徽 —— //
export function MountainCircleLogo({ className, style }: { className?: string; style?: CSSProperties }) {
  const s = (style?.width as number) || 52;
  return <Img src={`${B}/logo-mountain.png`} w={s} h={s} className={className} style={style} />;
}

// —— 三步驟圖示 —— //
export function StepMountain() { return <Img src={`${B}/step-trip.png`} w={38} h={30} />; }
export function StepCalendar() { return <Img src={`${B}/step-date.png`} w={36} h={32} />; }
export function StepClipboard() { return <Img src={`${B}/step-contact.png`} w={32} h={38} />; }

// —— 人物 / 聯絡 —— //
export function PersonIcon({ size = 18 }: { size?: number }) { return <Img src={`${B}/c-person.png`} w={size} h={size} />; }
export function PersonCircleIcon({ size = 20 }: { size?: number }) { return <Img src={`${B}/person.png`} w={size} h={size} />; }
export function PhoneIcon({ size = 20 }: { size?: number }) { return <Img src={`${B}/c-phone.png`} w={size} h={size} />; }
export function MailIcon({ size = 20 }: { size?: number }) { return <Img src={`${B}/c-mail.png`} w={size} h={size} />; }
export function PeopleIcon({ size = 22 }: { size?: number }) { return <Img src={`${B}/people.png`} w={size} h={size} />; }

// —— 行程卡 —— //
export function ClockIcon({ size = 15 }: { size?: number }) { return <Img src={`${B}/clock.png`} w={size} h={size} />; }
export function TagIcon({ size = 15 }: { size?: number }) { return <Img src={`${B}/tag.png`} w={size} h={size} />; }
export function PinIcon({ size = 18 }: { size?: number }) { return <Img src={`${B}/pin.png`} w={size} h={size} />; }
export function RadioIcon({ on, size = 22 }: { on: boolean; size?: number }) {
  return <Img src={`${B}/${on ? 'radio-on' : 'radio-off'}.png`} w={size} h={size} />;
}

// —— 日曆 nav / 返回 / 鎖 —— //
export function CalPrev({ size = 22 }: { size?: number }) { return <Img src={`${B}/cal-prev.png`} w={size} h={size} />; }
export function CalNext({ size = 22 }: { size?: number }) { return <Img src={`${B}/cal-next.png`} w={size} h={size} />; }
export function BackIcon({ size = 16 }: { size?: number }) { return <Img src={`${B}/back.png`} w={size} h={size} />; }
export function LockIcon({ size = 15 }: { size?: number }) { return <Img src={`${B}/lock.png`} w={size} h={size} />; }

// —— 純裝飾線條（保留 SVG）—— //
export function LeafIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden>
      <path d="M4 16C4 9 9 4 16 4c0 7-5 12-12 12z" fill="none" stroke="#d9c98f" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 14L15 5" fill="none" stroke="#d9c98f" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
export function CtaMountain({ className }: { className?: string }) {
  // 山形＋蜿蜒山徑，呼應圖示庫的「山中圓徽」造型（見 logo-mountain.png），維持單色線條以貼合 CTA 橘底。
  return (
    <svg className={className} viewBox="0 0 40 30" aria-hidden>
      <path d="M2 21l9-14 6 8 4-5 12 11" fill="none" stroke="#e7c98a" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
      <path d="M7 27q5-4 10 0t11-1" fill="none" stroke="#e7c98a" strokeWidth={1.1} strokeLinecap="round" opacity={0.85} />
    </svg>
  );
}
export function ArrowRight({ style }: { style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" style={style} aria-hidden>
      <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
// 摘要列垂直分割線（依需求以 SVG 繪製，非 CSS border）
export function VDivider({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} width="1" height="46" viewBox="0 0 1 46" preserveAspectRatio="none" aria-hidden>
      <line x1="0.5" y1="0" x2="0.5" y2="46" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
// 摘要列小計旁的下拉指示 chevron（SVG）
export function ChevronDown({ size = 18, style, className }: { size?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className} aria-hidden>
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
