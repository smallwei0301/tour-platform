import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildAlternates, buildPublicPath } from '../../../../src/lib/seo-alternates.ts';

// 文章內容（標題／分類／閱讀時間／本文）為靜態 inline 文案，已抽進 messages 的
// blogPosts namespace 並提供英文版（#multilingual）；此處僅保留結構欄位（日期／圖片），
// 同時作為合法 slug 清單（generateStaticParams／404 判斷）。
const articles: Record<string, { date: string; imageUrl: string }> = {
  'why-private-guide': {
    date: '2026-03-20',
    imageUrl: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80',
  },
  'chaishan-cave-guide': {
    date: '2026-03-15',
    imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80',
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(articles).map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string; slug: string }> }
): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = articles[slug];
  if (!article) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'blog' });
  const tp = await getTranslations({ locale, namespace: 'blogPosts' });
  const postTitle = tp(`${slug}.title`);
  const title = `${postTitle} ${t('metaTitleSuffix')}`;
  const description = tp(`${slug}.content`).slice(0, 120).replace(/\n/g, ' ');
  return {
    title,
    description,
    alternates: buildAlternates(buildPublicPath('/blog', [slug]), locale),
    openGraph: {
      title,
      description,
      images: article.imageUrl ? [{ url: article.imageUrl, width: 1200, height: 630, alt: `${postTitle} ${t('coverAltSuffix')}` }] : [],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(article.imageUrl ? { images: [article.imageUrl] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const article = articles[slug];

  if (!article) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'blog' });
  const tp = await getTranslations({ locale, namespace: 'blogPosts' });
  const postTitle = tp(`${slug}.title`);
  const postCategory = tp(`${slug}.category`);
  const postReadTime = tp(`${slug}.readTime`);
  const postContent = tp(`${slug}.content`);
  const inLanguage = locale === 'zh-Hant' ? 'zh-TW' : locale;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: postTitle,
        description: postContent.slice(0, 160).replace(/\n/g, ' '),
        image: article.imageUrl,
        datePublished: article.date,
        dateModified: article.date,
        author: { '@type': 'Organization', name: 'Midao 祕島', url: baseUrl },
        publisher: { '@type': 'Organization', name: 'Midao 祕島', url: baseUrl },
        url: `${baseUrl}/blog/${slug}`,
        inLanguage,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('breadcrumbHome'), item: baseUrl },
          { '@type': 'ListItem', position: 2, name: t('breadcrumbBlog'), item: `${baseUrl}/blog` },
          { '@type': 'ListItem', position: 3, name: postTitle },
        ],
      },
    ],
  };

  return (
    <main className="tp-container" style={{ paddingBottom: 40, maxWidth: 780, margin: '0 auto' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">{t('breadcrumbHome')}</Link> &gt; <Link href="/blog">{t('breadcrumbBlog')}</Link> &gt; {postTitle}
      </div>

      <Image src={article.imageUrl} alt={postTitle} priority style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 14, marginTop: 12 }} width={1200} height={675} />

      <span style={{ background: 'var(--tp-accent)', color: '#fff', padding: '3px 10px', borderRadius: 6, fontSize: 12, display: 'inline-block', marginTop: 16 }}>{postCategory}</span>
      <h1 style={{ margin: '12px 0 6px' }}>{postTitle}</h1>
      <p style={{ color: 'var(--tp-muted)', fontSize: 14, marginBottom: 24 }}>{article.date} · {t('readTimePrefix')} {postReadTime}</p>

      <div style={{ lineHeight: 1.9, fontSize: 16, color: 'var(--tp-text)' }}>
        {postContent.split('\n\n').map((para, i) => {
          if (para.startsWith('## ')) return <h2 key={i} style={{ marginTop: 28, marginBottom: 8 }}>{para.replace('## ', '')}</h2>;
          if (para.startsWith('### ')) return <h3 key={i} style={{ marginTop: 20, marginBottom: 6 }}>{para.replace('### ', '')}</h3>;
          if (para.startsWith('- ')) {
            return (
              <ul key={i} style={{ paddingLeft: 20, marginBottom: 12 }}>
                {para.split('\n').map((line, j) => <li key={j}>{line.replace('- ', '')}</li>)}
              </ul>
            );
          }
          return <p key={i} style={{ marginBottom: 12 }}>{para}</p>;
        })}
      </div>

      {/* CTA */}
      <div style={{ background: 'var(--tp-bg-soft)', border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20, marginTop: 32, textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>{t('ctaTitle')}</p>
        <Link href="/activities" className="tp-btn tp-btn-primary" style={{ padding: '10px 24px' }}>{t('ctaButton')}</Link>
      </div>
    </main>
  );
}
