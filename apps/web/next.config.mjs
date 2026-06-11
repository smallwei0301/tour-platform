import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertStartupEnv } from './src/config/startup-env.mjs';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, '../..');

// Single authority startup ENV validation (issue #60)
assertStartupEnv(process.env);

// #1375 — CSP 先以 Report-Only 試行（違規只回報不阻擋，避免誤擋 ECPay 金流跳轉）。
// 來源盤點：ECPay 付款跳轉（form-action）、Supabase REST/Realtime（connect-src）、
// Sentry（tunnel /monitoring 為同源；無 tunnel 時走 *.sentry.io）、Vercel Analytics /
// Speed Insights、Unsplash/Pexels/Supabase 圖源。'unsafe-inline'/'unsafe-eval' 為
// Next.js hydration 與 dev runtime 所需；enforce 切換另開 follow-up issue 附觀察證據。
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://images.pexels.com https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  "form-action 'self' https://payment.ecpay.com.tw https://payment-stage.ecpay.com.tw",
  "frame-ancestors 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
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
