package com.locationmonitor.app;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Register our custom plugin
        registerPlugin(LocationServiceBridge.class);
        
        android.util.Log.d("MainActivity", "📱 App started successfully");
        
        // AUTO-START the LocationTrackingService when app opens (like it was working before)
        android.util.Log.d("MainActivity", "🚀 Auto-starting LocationTrackingService with MediaStyle notification...");
        
        try {
            Intent locationService = new Intent(this, LocationTrackingService.class);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.util.Log.d("MainActivity", "📱 Starting FOREGROUND service (Android 8+)");
                startForegroundService(locationService);
            } else {
                android.util.Log.d("MainActivity", "📱 Starting regular service (Android 7-)");
                startService(locationService);
            }
            
            android.util.Log.d("MainActivity", "✅ LocationTrackingService auto-started! Notification should appear now!");
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "❌ Failed to auto-start LocationTrackingService: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
