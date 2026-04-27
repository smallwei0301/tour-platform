import {
  Search,
  Menu,
  Star,
  Users,
  Clock3,
  User,
  MapPin,
  Mountain,
  Trees,
  TentTree,
  Compass,
  House,
  Signpost,
  PersonStanding,
  ChevronRight,
  MountainSnow,
} from 'lucide-react';

const icons = {
  search: Search,
  menu: Menu,
  star: Star,
  users: Users,
  clock: Clock3,
  user: User,
  pin: MapPin,
  mountain: Mountain,
  tree: Trees,
  tent: TentTree,
  compass: Compass,
  home: House,
  signpost: Signpost,
  guide: PersonStanding,
  chevron: ChevronRight,
  mountains: MountainSnow,
};

export type MidaoIconName = keyof typeof icons;

export default function MidaoIcon({ name, size = 20, strokeWidth = 1.9, className }: { name: MidaoIconName; size?: number; strokeWidth?: number; className?: string }) {
  const Icon = icons[name] || Mountain;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} />;
}
