import Link from 'next/link';
import { midaoChips, midaoSearch } from '../../../data/midaoHomeData';
import MidaoIcon from './MidaoIcon';

export default function MidaoSearchPanel() {
  return (
    <section className="midao-search-panel">
      <Link href="/activities" className="midao-search-input" aria-label="前往所有路線搜尋頁面">
        <MidaoIcon name="search" size={22} />
        <span>{midaoSearch.placeholder}</span>
      </Link>

      <div className="midao-chip-row">
        {midaoChips.map((chip) => (
          <Link key={chip.label} href={chip.href} className="midao-chip">
            <MidaoIcon name={chip.icon as any} size={18} />
            <span>{chip.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
