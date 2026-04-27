import { activities, guides, reviews } from '../src/fixtures/data';

const hualienActivity = activities.find((a) => a.slug === 'hualien-river-trekking') ?? activities[0];
const kaohsiungActivity = activities.find((a) => a.slug === 'kaohsiung-chaishan-cave-experience') ?? activities[0];
const taipeiActivity = activities.find((a) => a.slug === 'dadadaocheng-walk') ?? activities[0];

const hualienGuide = guides.find((g) => g.slug === hualienActivity.guideSlug) ?? guides[0];
const kaohsiungGuide = guides.find((g) => g.slug === kaohsiungActivity.guideSlug) ?? guides[0];
const taipeiGuide = guides.find((g) => g.slug === taipeiActivity.guideSlug) ?? guides[0];

const featuredReviewCount = reviews.filter((r) => r.activitySlug === hualienActivity.slug).length;

export const midaoHero = {
  eyebrow: '— FIELD GUIDE TO HIDDEN TAIWAN —',
  titleLines: ['島嶼裡，', '還有一座島。'],
  englishTitle: 'An island, untold.',
  description: '祕境不會自己出現。要有人帶你去。',
  primaryCta: { label: '尋找一條你的徑', href: '/activities' },
  secondaryCta: { label: '遇見引路人', href: '/guides' },
  imageUrl: kaohsiungGuide.heroImageUrl || kaohsiungActivity.imageUrl,
};

export const midaoSearch = {
  placeholder: '你想走哪一條徑？',
};

export const midaoChips = [
  { label: '花蓮溪谷', icon: 'mountain', href: `/activities?region=${encodeURIComponent('hualien')}` },
  { label: '高雄探洞', icon: 'tent', href: `/activities?region=${encodeURIComponent('kaohsiung')}` },
  { label: '台北老街', icon: 'tree', href: `/activities?region=${encodeURIComponent('taipei')}` },
];

export const featuredRoutes = [
  {
    id: hualienActivity.slug,
    title: '花蓮・幾乎沒人走的溪谷徑',
    location: hualienActivity.region.replace('縣', ''),
    image: hualienActivity.imageUrl,
    rating: hualienGuide.rating ?? 4.8,
    groupSize: `${hualienActivity.maxParticipants}人小團`,
    duration: hualienActivity.durationDisplay.includes('日') ? hualienActivity.durationDisplay : '1日',
    cta: '替我留一個位置',
    href: `/activities/${hualienActivity.regionSlug}/${hualienActivity.slug}`,
    reviewCount: featuredReviewCount,
  },
  {
    id: kaohsiungActivity.slug,
    title: '高雄・城市邊緣的柴山洞徑',
    location: kaohsiungActivity.region.replace('市', ''),
    image: kaohsiungActivity.imageUrl,
    rating: kaohsiungGuide.rating ?? 5,
    groupSize: `${kaohsiungActivity.maxParticipants}人小團`,
    duration: kaohsiungActivity.durationDisplay,
    cta: '翻開路線',
    href: `/activities/${kaohsiungActivity.regionSlug}/${kaohsiungActivity.slug}`,
    reviewCount: reviews.filter((r) => r.activitySlug === kaohsiungActivity.slug).length,
  },
  {
    id: taipeiActivity.slug,
    title: '台北・老街與故事的慢行徑',
    location: taipeiActivity.region.replace('市', ''),
    image: taipeiActivity.imageUrl,
    rating: taipeiGuide.rating ?? 5,
    groupSize: `${taipeiActivity.maxParticipants}人小團`,
    duration: taipeiActivity.durationDisplay,
    cta: '看看這條徑',
    href: `/activities/${taipeiActivity.regionSlug}/${taipeiActivity.slug}`,
    reviewCount: reviews.filter((r) => r.activitySlug === taipeiActivity.slug).length,
  },
];

export const bottomNavItems = [
  { label: '首頁', icon: 'home', href: '/', active: true },
  { label: '路線', icon: 'signpost', href: '/activities', active: false },
  { label: '引路人', icon: 'guide', href: '/guides', active: false },
  { label: '我的', icon: 'user', href: '/me/orders', active: false },
];
