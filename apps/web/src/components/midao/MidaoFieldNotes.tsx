import Link from 'next/link';
import { featuredRoutes } from '../../../data/midaoHomeData';
import MidaoIcon from './MidaoIcon';
import MidaoRouteCard from './MidaoRouteCard';

export default function MidaoFieldNotes() {
  return (
    <section className="midao-section midao-field-notes">
      <div className="midao-divider" />
      <div className="midao-section-header">
        <div className="midao-section-title-group">
          <div className="midao-section-icon">
            <MidaoIcon name="compass" size={14} />
          </div>

          <div className="midao-section-titles">
            <h2 className="midao-section-title">本月祕境檔案</h2>
            <p className="midao-section-subtitle">This Month&apos;s Field Notes</p>
          </div>
        </div>

        <Link href="/activities" className="midao-section-link" aria-label="查看全部路線">
          <MidaoIcon name="chevron" size={18} />
        </Link>
      </div>

      <div className="midao-route-scroll">
        <MidaoRouteCard route={featuredRoutes[0]} />
      </div>
    </section>
  );
}
