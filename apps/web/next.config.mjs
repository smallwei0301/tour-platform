import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertStartupEnv } from './src/config/startup-env.mjs';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, '../..');

// Single authority startup ENV validation (issue #60)
assertStartupEnv(process.env);

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: repoRoot,
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost', '172.17.0.2', '172.20.0.2'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
    formats: ['image/avif', 'image/webp'],
    quality: 60,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  webpack(config, { dev }) {
    if (dev) {
      config.resolve ??= {};
      config.resolve.alias ??= {};
      config.resolve.alias['@sentry/nextjs'] = path.join(appDir, 'src/test-support/sentry-nextjs-dev-noop.js');
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

// Avoid loading Sentry's build wrapper in local/dev smoke runs. A disabled
// wrapper still pulls a large dependency graph into Next dev cold-start, which
// makes browser smoke flaky on memory-constrained CI/agent hosts.
const disableSentryBuild = process.env.NODE_ENV !== 'production' || process.env.DISABLE_SENTRY_BUILD === '1';

let exportedConfig = nextConfig;

if (!disableSentryBuild) {
  const { withSentryConfig } = await import('@sentry/nextjs');
  exportedConfig = withSentryConfig(nextConfig, {
    // Sentry organization and project (optional: set via env SENTRY_ORG / SENTRY_PROJECT)
    silent: true,

    // Only upload source maps in production CI
    sourcemaps: {
      disable: !process.env.SENTRY_AUTH_TOKEN,
    },

    // Tunnel to avoid ad-blockers
    tunnelRoute: '/monitoring',

    // Suppress build warnings when DSN is not set
    hideSourceMaps: true,
  });
}

export default exportedConfig;
