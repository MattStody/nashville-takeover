import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Nashville Takeover',
  slug: 'nashville-takeover',
  scheme: 'nashvilletakeover',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.nashvilletakeover.app',
    supportsTablet: false,
  },
  android: {
    package: 'com.nashvilletakeover.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#E7603F' },
  },
  web: { favicon: './assets/favicon.png', bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    'expo-font',
    ['expo-notifications', { color: '#E7603F' }],
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 180, backgroundColor: '#F6EFCE' }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    // Set once an EAS project exists (Phase 7); push registration is skipped without it.
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
};

export default config;
