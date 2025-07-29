package com.locationmonitor.app;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Register our custom plugin
        registerPlugin(LocationServiceBridge.class);
        
        android.util.Log.d("MainActivity", "📱 App started successfully");
        
        // Stop any existing MediaStyle location service from previous sessions
        try {
            Intent locationService = new Intent(this, LocationTrackingService.class);
            stopService(locationService);
            android.util.Log.d("MainActivity", "🛑 Stopped any existing MediaStyle location service");
        } catch (Exception e) {
            android.util.Log.d("MainActivity", "ℹ️ No existing MediaStyle service to stop");
        }
        
        // Check and request battery optimization exemption
        checkBatteryOptimization();
        
        // Note: Location tracking is now handled by the background geolocation plugin
        // No auto-starting of MediaStyle service needed
        android.util.Log.d("MainActivity", "📱 App ready - location tracking will be handled by background geolocation plugin");
    }
    
    private void checkBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
            if (powerManager != null && !powerManager.isIgnoringBatteryOptimizations(getPackageName())) {
                android.util.Log.d("MainActivity", "🔋 App is not whitelisted from battery optimization");
                android.util.Log.d("MainActivity", "💡 Consider asking user to disable battery optimization for better background location");
                
                // Optional: Uncomment to automatically request battery optimization exemption
                // Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                // intent.setData(Uri.parse("package:" + getPackageName()));
                // startActivity(intent);
            } else {
                android.util.Log.d("MainActivity", "✅ App is whitelisted from battery optimization");
            }
        }
    }
}
