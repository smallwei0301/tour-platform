import path from 'node:path';
import { fileURLToPath } from 'node:url';

import createNextIntlPlugin from 'next-intl/plugin';

import { assertStartupEnv } from './src/config/startup-env.mjs';

// 多語言（#multilingual Phase 0）：把 next-intl request config 接進 build。
// 與既有 withSentryConfig / 頂部 assertStartupEnv 共存——僅在最外層再包一層。
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, '../..');

// Single authority startup ENV validation (issue #60)
assertStartupEnv(process.env);

// #1568 — CSP 由 Report-Only 轉為 enforce（實際阻擋）。
// 來源盤點：ECPay 付款跳轉（form-action）、Supabase REST/Realtime（connect-src）、
// Sentry（tunnel /monitoring 為同源；無 tunnel 時走 *.sentry.io）、Vercel Analytics /
// Speed Insights、Google Analytics 4（gtag.js → googletagmanager.com，beacon →
// google-analytics.com / analytics.google.com）、Unsplash/Pexels/Supabase 圖源。
//
// enforce 後實際生效的防護：default-src 'self'、object-src 'none'（擋 Flash/plugin XSS）、
// base-uri 'self'（擋 <base> 注入）、frame-ancestors 'self'（clickjacking）、
// form-action 白名單（擋未授權表單外送，僅放行 ECPay）、connect/img 白名單（擋資料外送到未授權主機）。
//
// script-src 保留 'unsafe-inline'（#1601 有意識決策，非漂移）：
//  - hash 化不可行：Next App Router 每頁注入逐頁變動的 RSC flight data inline script
//    （self.__next_f.push(...)），無法靜態 hash；
//  - nonce 化雙重阻擋：需 per-request dynamic rendering（回歸 #1344 ISR/SSG 效能）＋需在
//    middleware.ts 注入 nonce（鐵律 3 凍結區不可改）。
// 殘餘風險已由 enforce CSP（object-src/base-uri/frame-ancestors/form-action 白名單）＋
// 「無 inline-script 注入面」（JSON-LD 轉義、零使用者輸入直注）緩解。完整評估與未來路徑
// （選項 C 混合 nonce）見 docs/04-tech/04-tech-architecture/15-csp-unsafe-inline-decision.md。
// 'unsafe-eval' 僅 dev 保留（Next dev runtime 需要）；production 移除以縮小攻擊面。
const isProd = process.env.NODE_ENV === 'production';
// production 移除 'unsafe-eval'（Next prod 不需 eval）；dev 保留（Next dev runtime 需要）。
// 兩分支皆把 script-src ... googletagmanager 放同一字串字面（GA4 source-contract 需要）。
const scriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://www.googletagmanager.com"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://www.googletagmanager.com";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://images.pexels.com https://*.supabase.co https://www.googletagmanager.com https://www.google-analytics.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://vitals.vercel-insights.com https://va.vercel-scripts.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
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
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  // #1568：enforce（非 Report-Only）
  { key: 'Content-Security-Policy', value: csp },
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
  // #1407 legacy 退役：舊 checkout／orders 頁面刪除後以 301 導向現行路徑，
  // 保護外部書籤與搜尋引擎既有索引（next.config redirects 先於 middleware 執行）。
  async redirects() {
    return [
      {
        source: '/checkout',
        has: [{ type: 'query', key: 'slug', value: '(?<slug>.+)' }],
        destination: '/booking/:slug',
        permanent: true,
      },
      { source: '/checkout', destination: '/activities', permanent: true },
      { source: '/orders', destination: '/me/orders', permanent: true },
      { source: '/orders/:orderId', destination: '/me/orders/:orderId', permanent: true },
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

export default withNextIntl(exportedConfig);
