import type { NextConfig } from 'next';

const config: NextConfig = {
  // packages/shared ships TypeScript source.
  transpilePackages: ['@nt/shared'],
  experimental: {
    // Image uploads go through server actions.
    serverActions: { bodySizeLimit: '6mb' },
  },
};

export default config;
