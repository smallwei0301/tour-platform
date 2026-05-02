import { withSentryConfig } from '@sentry/nextjs';
import { assertStartupEnv } from './src/config/startup-env.mjs';

// Single authority startup ENV validation (issue #60)
assertStartupEnv(process.env);

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
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /@opentelemetry\/instrumentation/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];
    return config;
  },
};

// Allow bypassing Sentry build wrapping via DISABLE_SENTRY_BUILD=1
// Also auto-disable when no Sentry DSN is present, so local/non-Sentry builds stay lean.
const hasSentryDsn = !!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);
const disableSentryBuild = process.env.DISABLE_SENTRY_BUILD === '1' || !hasSentryDsn;

export default disableSentryBuild
  ? nextConfig
  : withSentryConfig(nextConfig, {
      // Sentry organization and project (optional: set via env SENTRY_ORG / SENTRY_PROJECT)
      silent: true,

      // Only upload source maps in production CI
      sourcemaps: {
        disable: process.env.NODE_ENV !== 'production' || !process.env.SENTRY_AUTH_TOKEN,
      },

      // Tunnel to avoid ad-blockers
      tunnelRoute: '/monitoring',

      // Suppress build warnings when DSN is not set
      hideSourceMaps: true,
    });
