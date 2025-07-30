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
    },
    BackgroundGeolocation: {
      // Optimized settings for reliable tracking
      notificationTitle: "Location Tracking Active",
      notificationText: "📍 Location Monitor is tracking your location",
      enableHighAccuracy: true,
      
      // Smart distance filtering to prevent unnecessary updates
      distanceFilter: 10,  // 10 meters - good balance for accuracy vs battery
      
      // Optimized intervals for foreground/background
      interval: 10000,           // 10 seconds foreground (gentle on battery)
      fastestInterval: 5000,     // 5 seconds minimum when needed
      
      // Background settings - work with Android limitations
      backgroundInterval: 45000,    // 45 seconds when minimized
      backgroundDistanceFilter: 15, // 15 meters when minimized
      
      // Core settings
      stale: false,
      debug: false,
      stopOnTerminate: false,
      startOnBoot: false,
      
      // Battery & reliability optimizations
      enableWakeLock: true,
      enableForegroundService: true,
      locationProvider: "ANDROID_GPS",
      saveBatteryOnBackground: false,  // Keep accuracy when backgrounded
      
      // Activity detection for smart intervals
      activitiesInterval: 60000,       // Check activity every 60 seconds
      activityType: "AutomotiveNavigation",
      
      // Notification settings
      notificationIconLarge: "@mipmap/ic_launcher",
      notificationIconSmall: "@mipmap/ic_launcher",
      
      // Enhanced reliability settings for Android
      priority: "PRIORITY_HIGH_ACCURACY",
      maxWaitTime: 60000,
      deferTime: 0,
      autoSync: true,
      batchSync: false,
      
      // Prevent aggressive battery optimization
      disableElasticity: true,
      elasticityMultiplier: 1,
      
      // Android Doze mode resistance
      disableStopDetection: true,
      isDebugging: false
    },
    CapacitorHttp: {
      enabled: true  // Use native HTTP for better background reliability
    }
  }
};

export default config;
