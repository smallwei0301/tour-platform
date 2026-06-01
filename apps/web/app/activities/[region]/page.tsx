import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getActivityBySlugDb, buildCanonicalActivityDetailPath } from '../../../src/lib/db.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

type Props = { params: Promise<{ region: string }> };

const REGION_NAMES: Record<string, string> = {
  kaohsiung: '高雄',
  taipei: '台北',
  hualien: '花蓮',
  taichung: '台中',
  tainan: '台南',
  keelung: '基隆',
  taitung: '台東',
  nantou: '南投',
  yilan: '宜蘭',
  pingtung: '屏東',
  miaoli: '苗栗',
  chiayi: '嘉義',
  penghu: '澎湖',
  kinmen: '金門',
  matsu: '馬祖',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { region } = await params;
  const regionName = REGION_NAMES[region] ?? region;
  const title = `${regionName} 在地行程導覽 | Midao 祕島`;
  const description = `探索${regionName}最道地的秘境行程，由在地導遊帶你體驗不一樣的${regionName}。`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=630&fit=crop' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=630&fit=crop'],
    },
  };
}

const DEFAULT_ACTIVITY_LOOKUP_TIMEOUT_MS = 8_000;

function parseActivityLookupTimeout() {
  const rawTimeout = Number.parseInt(process.env.GH502_ACTIVITY_LOOKUP_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_ACTIVITY_LOOKUP_TIMEOUT_MS;
}

const COMPAT_ACTIVITY_TIMEOUT_MS = parseActivityLookupTimeout();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutRef: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutRef = setTimeout(() => {
      reject(new Error(`[${label}] timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutRef) clearTimeout(timeoutRef);
  }) as Promise<T>;
}

export default async function ActivityDetailCompatPage({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;

  let activity: Awaited<ReturnType<typeof getActivityBySlugDb>>;
  try {
    activity = await withTimeout(
      getActivityBySlugDb(region),
      COMPAT_ACTIVITY_TIMEOUT_MS,
      'activity-detail-compat-redirect',
    );
  } catch {
    return notFound();
  }

  if (!activity) return notFound();

  redirect(buildCanonicalActivityDetailPath(activity));
}
