import Link from 'next/link';
import { bottomNavItems } from '../../../data/midaoHomeData';
import MidaoIcon from './MidaoIcon';

export default function MidaoBottomNav() {
  return (
    <nav className="midao-bottom-nav" aria-label="底部導覽">
      <div className="midao-bottom-nav-inner">
        {bottomNavItems.map((item) => (
          <Link key={item.label} href={item.href} className={item.active ? 'midao-nav-item active' : 'midao-nav-item'}>
            <MidaoIcon name={item.icon as any} size={22} />
            <span>{item.label}</span>
            {item.active ? <i className="midao-nav-indicator" aria-hidden="true" /> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
