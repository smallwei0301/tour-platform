import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/activities', '/activities/', '/guides', '/about', '/faq', '/legal/'],
        disallow: [
          '/admin', '/guide/', '/api/', '/booking/', '/me/',
          '/checkout', '/orders', '/login', '/dashboard',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
