'use client';

/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';

interface Section {
  id: string;
  label: string;
}

const DEFAULT_SECTIONS: Section[] = [
  { id: 'section-plan', label: '方案' },
  { id: 'section-reviews', label: '評價' },
  { id: 'section-details', label: '商品說明' },
  { id: 'section-policy', label: '購買須知' },
];

export function SectionAnchorNav({ sections }: { sections?: Section[] }) {
  const SECTIONS = sections || DEFAULT_SECTIONS;
  const [active, setActive] = useState(SECTIONS[0]?.id || 'section-plan');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: 0 }
    );

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = 72; // navbar height
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
    setActive(id);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    id: string
  ) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (index + direction + SECTIONS.length) % SECTIONS.length;
      const nextSection = SECTIONS[nextIndex];
      if (!nextSection) return;

      setActive(nextSection.id);
      const nextTab = document.getElementById(`anchor-tab-${nextSection.id}`) as HTMLButtonElement | null;
      nextTab?.focus();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick(id);
    }
  };

  return (
    <nav className="kkd-anchor-nav" aria-label="頁面錨點導覽" role="tablist">
      {SECTIONS.map(({ id, label }, index) => (
        <button
          id={`anchor-tab-${id}`}
          key={id}
          className={`kkd-anchor-btn${active === id ? ' active' : ''}`}
          aria-current={active === id ? 'true' : undefined}
          aria-selected={active === id}
          aria-controls={id}
          role="tab"
          tabIndex={active === id ? 0 : -1}
          onClick={() => handleClick(id)}
          onKeyDown={(event) => handleKeyDown(event, index, id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
