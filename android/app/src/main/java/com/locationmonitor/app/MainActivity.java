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
        
        android.util.Log.d("MainActivity", "📱 App opened - starting location service");
        
        Intent locationService = new Intent(this, LocationTrackingService.class);
        
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(locationService);
            } else {
                startService(locationService);
            }
            android.util.Log.d("MainActivity", "✅ Location service started");
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "❌ Failed to start service: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
