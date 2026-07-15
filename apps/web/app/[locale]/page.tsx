import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ScrollWorldClient, type SceneView } from '../../src/components/scroll-world/ScrollWorldClient';
import { SCROLL_WORLD_PRELUDE, SCROLL_WORLD_SCENES } from '../../src/lib/scroll-world/scenes.mjs';
import { buildAlternates } from '../../src/lib/seo-alternates.ts';

/**
 * `/` — 祕島世界 3D 滾動首頁（自 #1713 起為正式首頁）。
 *
 * 概念參考 oso95/scroll-world：滾動＝一台只前進的攝影機，開場序章自島嶼
 * 全景拉近燈籠、溶接七段飛行影片（scrub：滾動進度＝播放進度、全幅淡化
 * 轉場）。引擎見 `src/lib/scroll-world/camera.mjs` 與
 * `src/components/scroll-world/`。經典行銷首頁搬至 /home（Navbar 品牌
 * logo 與本頁首尾 CTA 連回），admin 首頁精選等 DB 內容隨之搬移——本頁
 * 純靜態、無資料相依。
 */
export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> }
): Promise<Metadata> {
  const { locale } = await params;
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  const title = tSeo('defaultTitle');
  const description = tSeo('defaultDescription');
  return {
    // #1711 SEO：homepage title/description 取 seo namespace 的正規站名文案
    // （canonical/hreflang 由 buildAlternates 提供）。
    title,
    description,
    alternates: buildAlternates('/', locale),
    openGraph: {
      title,
      description,
      images: [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/images/og-default.png'],
    },
  };
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

export default async function WorldHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home3d' });
  const tSeo = await getTranslations({ locale, namespace: 'seo' });

  // Organization／WebSite JSON-LD 隨首頁職責自經典頁移入（FAQPage 留在
  // /home，與其可見 FAQ 內容對應）。
  const homeJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${baseUrl}/#organization`,
        name: tSeo('siteName'),
        url: baseUrl,
        description: tSeo('orgDescription'),
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'midao2026@gmail.com',
          contactType: 'customer service',
          availableLanguage: ['zh-TW', 'en'],
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${baseUrl}/#website`,
        url: baseUrl,
        name: tSeo('siteName'),
        publisher: { '@id': `${baseUrl}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${baseUrl}/activities?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  const scenes: SceneView[] = SCROLL_WORLD_SCENES.map(
    (scene: { id: string; still: string; clip: string | null; accent: string; href: string }) => ({
      ...scene,
      eyebrow: t(`scenes.${scene.id}.eyebrow`),
      title: t(`scenes.${scene.id}.title`),
      body: t(`scenes.${scene.id}.body`),
      tags: t.raw(`scenes.${scene.id}.tags`) as string[],
      cta: t(`scenes.${scene.id}.cta`),
    })
  );

  return (
    <>
      {/* 序章島圖＝首屏 LCP，preload 加速開場 */}
      <link rel="preload" as="image" href={SCROLL_WORLD_PRELUDE.still} fetchPriority="high" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      <ScrollWorldClient scenes={scenes} hint={t('hint')} progressLabel={t('progressLabel')} />
    </>
  );
}
