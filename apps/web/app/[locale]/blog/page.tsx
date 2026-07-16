import Image from 'next/image';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildAlternates } from '../../../src/lib/seo-alternates.ts';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'blog' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: buildAlternates('/blog', locale),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: t('ogImageAlt') }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: ['/images/og-default.png'],
    },
  };
}

// 文章內容（標題／摘要／分類／閱讀時間）為靜態 inline 文案，已抽進 messages 的
// blogPosts namespace 並提供英文版（#multilingual）；此處僅保留結構欄位。
const posts = [
  {
    slug: 'why-private-guide',
    date: '2026-03-20',
    imageUrl: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=800&q=80',
    featured: true,
  },
  {
    slug: 'chaishan-cave-guide',
    date: '2026-03-15',
    imageUrl: '/images/activities/chaishan/main.jpg',
    featured: false,
  },
  // #1722：blog 內容擴充第一批（封面沿用站內 theme 圖，不增外部依賴）
  {
    slug: 'river-trekking-beginner-guide',
    date: '2026-07-16',
    imageUrl: '/images/theme/river-trekking.webp',
    featured: false,
  },
  {
    slug: 'dadaocheng-walking-guide',
    date: '2026-07-16',
    imageUrl: '/images/theme/culture-history.webp',
    featured: false,
  },
];

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'blog' });
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  const tp = await getTranslations({ locale, namespace: 'blogPosts' });
  const inLanguage = locale === 'zh-Hant' ? 'zh-TW' : locale;

  const blogJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: tSeo('blogItemListName'),
        url: `${baseUrl}/blog`,
        itemListElement: posts.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Article',
            headline: tp(`${p.slug}.title`),
            url: `${baseUrl}/blog/${p.slug}`,
            datePublished: p.date,
            dateModified: p.date,
            image: p.imageUrl,
            inLanguage,
          },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('breadcrumbHome'), item: baseUrl },
          { '@type': 'ListItem', position: 2, name: t('breadcrumbBlog'), item: `${baseUrl}/blog` },
        ],
      },
    ],
  };

  const featured = posts.find((p) => p.featured);
  const rest = posts.filter((p) => !p.featured);

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }} />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}><Link href="/">{t('breadcrumbHome')}</Link> &gt; {t('breadcrumbBlog')}</div>
      <h1>{t('heading')}</h1>

      {/* Featured */}
      {featured && (
        <Link href={`/blog/${featured.slug}`} style={{ display: 'block', marginBottom: 30 }}>
          <article className="tp-blog-featured">
            <Image src={featured.imageUrl} alt={tp(`${featured.slug}.title`)} priority className="tp-blog-featured-img" width={1200} height={675} />
            <div className="tp-blog-featured-body">
              <span style={{ background: 'var(--tp-accent)', color: '#fff', padding: '3px 10px', borderRadius: 6, fontSize: 12 }}>{tp(`${featured.slug}.category`)}</span>
              <h2 style={{ margin: '12px 0 8px' }}>{tp(`${featured.slug}.title`)}</h2>
              <p style={{ color: 'var(--tp-muted)', lineHeight: 1.7 }}>{tp(`${featured.slug}.excerpt`)}</p>
              <p style={{ color: 'var(--tp-muted)', fontSize: 13 }}>{featured.date} · {t('readTimePrefix')} {tp(`${featured.slug}.readTime`)}</p>
            </div>
          </article>
        </Link>
      )}

      {/* Grid */}
      <div className="tp-card-grid tp-blog-grid">
        {rest.map((p) => (
          <Link href={`/blog/${p.slug}`} key={p.slug} style={{ display: 'block' }}>
            <article className="tp-card">
              <Image src={p.imageUrl} alt={tp(`${p.slug}.title`)} className="tp-card-img" style={{ background: 'none' }} loading="lazy" width={1200} height={675} />
              <span style={{ background: 'var(--tp-accent)', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 11, display: 'inline-block', marginBottom: 6 }}>{tp(`${p.slug}.category`)}</span>
              <h3>{tp(`${p.slug}.title`)}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>{tp(`${p.slug}.excerpt`)}</p>
              <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>{p.date} · {tp(`${p.slug}.readTime`)}</p>
            </article>
          </Link>
        ))}
      </div>
    </main>
  );
}
