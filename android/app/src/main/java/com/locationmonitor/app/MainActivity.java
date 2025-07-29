package com.locationmonitor.app;

import android.Manifest;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSIONS_REQUEST_CODE = 1001;
    
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
        
        // Request permissions on first launch
        requestEssentialPermissions();
        
        // Check and request battery optimization exemption
        checkBatteryOptimization();
        
        // Note: Location tracking is now handled by the background geolocation plugin
        // No auto-starting of MediaStyle service needed
        android.util.Log.d("MainActivity", "📱 App ready - location tracking will be handled by background geolocation plugin");
    }
    
    private void requestEssentialPermissions() {
        android.util.Log.d("MainActivity", "🔐 Checking permissions...");
        
        // Check if this is first launch
        SharedPreferences prefs = getSharedPreferences("app_permissions", MODE_PRIVATE);
        boolean isFirstLaunch = prefs.getBoolean("is_first_launch", true);
        
        if (!isFirstLaunch) {
            android.util.Log.d("MainActivity", "✅ Not first launch, skipping permission request");
            return;
        }
        
        List<String> permissionsToRequest = new ArrayList<>();
        
        // Check location permissions
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        
        // Check notification permission (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
        
        if (!permissionsToRequest.isEmpty()) {
            android.util.Log.d("MainActivity", "📱 Requesting permissions: " + permissionsToRequest.toString());
            ActivityCompat.requestPermissions(this, 
                permissionsToRequest.toArray(new String[0]), 
                PERMISSIONS_REQUEST_CODE);
        } else {
            android.util.Log.d("MainActivity", "✅ All permissions already granted");
            // Mark first launch as complete
            prefs.edit().putBoolean("is_first_launch", false).apply();
        }
    }
    
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        if (requestCode == PERMISSIONS_REQUEST_CODE) {
            android.util.Log.d("MainActivity", "📱 Permission results received");
            
            boolean allGranted = true;
            for (int i = 0; i < permissions.length; i++) {
                if (grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                    android.util.Log.d("MainActivity", "✅ " + permissions[i] + " granted");
                } else {
                    android.util.Log.w("MainActivity", "❌ " + permissions[i] + " denied");
                    allGranted = false;
                }
            }
            
            // Mark first launch as complete regardless of permission results
            SharedPreferences prefs = getSharedPreferences("app_permissions", MODE_PRIVATE);
            prefs.edit().putBoolean("is_first_launch", false).apply();
            
            if (allGranted) {
                android.util.Log.d("MainActivity", "🎉 All permissions granted! App ready to use.");
            } else {
                android.util.Log.w("MainActivity", "⚠️ Some permissions denied. App functionality may be limited.");
            }
            
            // Request background location permission separately (Android requirement)
            if (allGranted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                requestBackgroundLocationPermission();
            }
        }
    }
    
    private void requestBackgroundLocationPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            android.util.Log.d("MainActivity", "📱 Requesting background location permission");
            ActivityCompat.requestPermissions(this, 
                new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, 
                PERMISSIONS_REQUEST_CODE + 1);
        }
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
