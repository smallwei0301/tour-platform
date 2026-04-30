import Link from 'next/link';
import { midaoHero } from '../../../data/midaoHomeData';
import MidaoIcon from './MidaoIcon';

export default function MidaoHero() {
  return (
    <section className="midao-hero" style={{ ['--hero-image' as string]: `url(${midaoHero.imageUrl})` }}>
      <div className="midao-hero-content">
        <p className="midao-eyebrow">{midaoHero.eyebrow}</p>

        <h2 className="midao-hero-title">
          {midaoHero.titleLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h2>

        <p className="midao-hero-en">{midaoHero.englishTitle}</p>
        <p className="midao-hero-copy">{midaoHero.description}</p>

        <div className="midao-hero-actions">
          <Link href={midaoHero.primaryCta.href} className="midao-btn midao-btn-primary">
            <span>{midaoHero.primaryCta.label}</span>
            <MidaoIcon name="chevron" size={18} />
          </Link>

          <Link href={midaoHero.secondaryCta.href} className="midao-btn midao-btn-secondary">
            <span>{midaoHero.secondaryCta.label}</span>
            <MidaoIcon name="chevron" size={18} />
          </Link>
        </div>
      </div>
      <div className="midao-hero-image" aria-hidden="true" />
      <div className="midao-hero-image-fade" aria-hidden="true" />
      <div className="midao-hero-bottom-fade" aria-hidden="true" />
    </section>
  );
}
