import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const apiInternalUrl =
  process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';

export default function nextConfig(phase: string): NextConfig {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
    reactStrictMode: true,
    transpilePackages: ['@cdc/contracts'],
    async rewrites() {
      return [
        {
          source: '/api/v1/:path*',
          destination: `${apiInternalUrl}/api/v1/:path*`,
        },
      ];
    },
  };
}
