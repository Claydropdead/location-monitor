import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.locationmonitor.app',
  appName: 'Location Monitor',
  webDir: 'out', // Next.js static export directory
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Geolocation: {
      enableBackgroundLocationUpdates: true
    }
  }
};

export default config;
