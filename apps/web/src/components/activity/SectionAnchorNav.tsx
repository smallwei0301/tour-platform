'use client';

import { useEffect, useState } from 'react';

const SECTIONS = [
  { id: 'section-plan', label: '方案' },
  { id: 'section-reviews', label: '評價' },
  { id: 'section-details', label: '商品說明' },
  { id: 'section-policy', label: '購買須知' },
];

export function SectionAnchorNav() {
  const [active, setActive] = useState('section-plan');

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

  return (
    <nav className="kkd-anchor-nav" aria-label="頁面錨點導覽">
      {SECTIONS.map(({ id, label }) => (
        <button
          key={id}
          className={`kkd-anchor-btn${active === id ? ' active' : ''}`}
          onClick={() => handleClick(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
