import { activities, guides, reviews } from '../src/fixtures/data';
import { buildActivityHref } from '../src/lib/activity-url';

const homepageActivities = activities.slice(0, 3);

const featuredActivity = homepageActivities[0] ?? activities[0];
const featuredGuide = guides.find((guide) => guide.slug === featuredActivity.guideSlug) ?? guides[0];

function getGuideBySlug(guideSlug: string) {
  return guides.find((guide) => guide.slug === guideSlug) ?? guides[0];
}

function getReviewCount(activitySlug: string) {
  return reviews.filter((review) => review.activitySlug === activitySlug).length;
}

export const midaoHero = {
  eyebrow: '— FIELD GUIDE TO HIDDEN TAIWAN —',
  titleLines: ['島嶼裡，', '還有一座島。'],
  englishTitle: 'An island, untold.',
  description: '祕境不會自己出現。要有人帶你去。',
  primaryCta: { label: '尋找一條你的徑', href: '/activities' },
  secondaryCta: { label: '遇見引路人', href: '/guides' },
  imageUrl: featuredGuide.heroImageUrl || featuredActivity.imageUrl,
};

export const midaoSearch = {
  placeholder: '你想走哪一條徑？',
};

export const midaoChips = homepageActivities.map((activity) => ({
  label: activity.region.replace('市', '').replace('縣', ''),
  icon: activity.slug === 'kaohsiung-chaishan-cave-experience' ? 'tent' : activity.slug === 'hualien-river-trekking' ? 'mountain' : 'tree',
  href: buildActivityHref({ slug: activity.slug, region: activity.region, regionSlug: activity.regionSlug }),
}));

export const featuredRoutes = homepageActivities.map((activity) => {
  const guide = getGuideBySlug(activity.guideSlug);

  return {
    id: activity.slug,
    title: activity.title,
    location: activity.region,
    image: activity.imageUrl,
    rating: guide.rating ?? 5,
    groupSize: `${activity.minParticipants}~${activity.maxParticipants} 人`,
    duration: activity.durationDisplay,
    cta: activity.guideSlug === 'andy-lee' ? '查看 Andy 的柴山行程' : '查看行程',
    href: buildActivityHref({ slug: activity.slug, region: activity.region, regionSlug: activity.regionSlug }),
    reviewCount: getReviewCount(activity.slug),
    guideName: guide.displayName,
    priceLabel: activity.priceLabel,
    summary: activity.shortDescription,
    tagline: activity.tagline,
    isPrimary: activity.slug === 'kaohsiung-chaishan-cave-experience',
  };
});

export const bottomNavItems = [
  { label: '首頁', icon: 'home', href: '/', active: true },
  { label: '路線', icon: 'signpost', href: '/activities', active: false },
  { label: '引路人', icon: 'guide', href: '/guides', active: false },
  { label: '我的', icon: 'user', href: '/me/orders', active: false },
];