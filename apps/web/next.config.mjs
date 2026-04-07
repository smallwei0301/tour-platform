import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['172.17.0.2'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project (optional: set via env SENTRY_ORG / SENTRY_PROJECT)
  silent: true,
  disableLogger: true,

  // Only upload source maps in production CI
  sourcemaps: {
    disable: process.env.NODE_ENV !== 'production' || !process.env.SENTRY_AUTH_TOKEN,
  },

  // Tunnel to avoid ad-blockers
  tunnelRoute: '/monitoring',

  // Suppress build warnings when DSN is not set
  hideSourceMaps: true,
});
