import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ScrollWorldClient, type SceneView } from '../../../../src/components/scroll-world/ScrollWorldClient';
import { SCROLL_WORLD_SCENES } from '../../../../src/lib/scroll-world/scenes.mjs';
import { buildAlternates } from '../../../../src/lib/seo-alternates.ts';

/**
 * /theme/world — 第二個 3D 滾動首頁（祕島世界），/world 為其 redirect 別名。
 *
 * 概念參考 oso95/scroll-world：滾動＝一台只前進的攝影機，自每景外部飛入
 * 內部再無縫飛向下一景。原作以 AI 預渲染影片 scrub；本頁以 CSS 3D＋分層
 * SVG 微景觀實作（零外部資產、零新依賴），引擎見
 * `src/lib/scroll-world/camera.mjs` 與 `src/components/scroll-world/`。
 * 既有 `/` 經典首頁不受影響，本頁為並存的替代入口。
 *
 * 為何落在 /theme/ 底下：凍結的 middleware.ts 只對 matcher＋localized 清單內
 * 的路徑做 next-intl rewrite 與 soft-launch 管制，`/theme/:path*` 已涵蓋；
 * 裸 /world 需改凍結檔才能治理（需 P0-OVERRIDE），故以 next.config redirect
 * 提供 /world 別名（見 next.config.mjs redirects）。
 */
export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> }
): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home3d' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: buildAlternates('/theme/world', locale),
    openGraph: {
      title: t('metaTitle'),
      description: t('metaDescription'),
      images: [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: t('metaTitle') }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('metaTitle'),
      description: t('metaDescription'),
      images: ['/images/og-default.png'],
    },
  };
}

export default async function WorldPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home3d' });

  const scenes: SceneView[] = SCROLL_WORLD_SCENES.map(
    (scene: { id: string; art: string; accent: string; href: string }) => ({
      ...scene,
      eyebrow: t(`scenes.${scene.id}.eyebrow`),
      title: t(`scenes.${scene.id}.title`),
      body: t(`scenes.${scene.id}.body`),
      tags: t.raw(`scenes.${scene.id}.tags`) as string[],
      cta: t(`scenes.${scene.id}.cta`),
    })
  );

  return <ScrollWorldClient scenes={scenes} hint={t('hint')} progressLabel={t('progressLabel')} />;
}
