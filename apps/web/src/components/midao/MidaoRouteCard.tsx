import Link from 'next/link';
import MidaoIcon from './MidaoIcon';

type Route = {
  id: string;
  title: string;
  location: string;
  image: string;
  rating: number;
  groupSize: string;
  duration: string;
  cta: string;
  href: string;
  reviewCount?: number;
};

export default function MidaoRouteCard({ route }: { route: Route }) {
  return (
    <article className="midao-route-card">
      <div className="midao-route-card-image" style={{ backgroundImage: `url(${route.image})` }} role="img" aria-label={route.title} />

      <div className="midao-route-card-body">
        <h3 className="midao-route-title">{route.title}</h3>
        <p className="midao-route-location">{route.location}</p>

        <div className="midao-route-meta">
          <span><MidaoIcon name="star" size={14} />{route.rating.toFixed(1)}</span>
          <span><MidaoIcon name="users" size={14} />{route.groupSize}</span>
          <span><MidaoIcon name="clock" size={14} />{route.duration}</span>
        </div>

        <Link href={route.href} className="midao-route-cta">
          <span>{route.cta}</span>
          <MidaoIcon name="chevron" size={16} />
        </Link>
      </div>
    </article>
  );
}
