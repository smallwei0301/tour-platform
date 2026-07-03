import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/', '/activities', '/activities/',
          '/guides', '/guides/',
          '/experiences', '/experiences/',
          '/blog', '/blog/',
          '/about', '/faq', '/contact', '/why-choose-us',
          '/theme/', '/legal/',
          '/guide/apply',
        ],
        disallow: [
          '/admin', '/guide/', '/api/', '/booking/', '/me/',
          '/order', '/login', '/dashboard',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
