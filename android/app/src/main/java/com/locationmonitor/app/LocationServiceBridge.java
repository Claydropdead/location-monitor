package com.locationmonitor.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LocationServiceBridge")
public class LocationServiceBridge extends Plugin {

    @PluginMethod
    public void getLocationSharingState(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences("location_sharing", getContext().MODE_PRIVATE);
        boolean isSharing = prefs.getBoolean("is_sharing", false);
        
        JSObject result = new JSObject();
        result.put("isSharing", isSharing);
        call.resolve(result);
    }

    @PluginMethod
    public void setLocationSharingState(PluginCall call) {
        boolean isSharing = call.getBoolean("isSharing", false);
        
        SharedPreferences prefs = getContext().getSharedPreferences("location_sharing", getContext().MODE_PRIVATE);
        prefs.edit().putBoolean("is_sharing", isSharing).apply();
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void startLocationService(PluginCall call) {
        try {
            android.util.Log.d("LocationServiceBridge", "🎵 Starting LocationTrackingService with MediaStyle notifications...");
            
            // Check if service is already running
            boolean isRunning = isServiceRunning();
            android.util.Log.d("LocationServiceBridge", "📊 Service already running: " + isRunning);
            
            Intent locationService = new Intent(getContext(), LocationTrackingService.class);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.util.Log.d("LocationServiceBridge", "📱 Starting FOREGROUND service (Android 8+)");
                getContext().startForegroundService(locationService);
            } else {
                android.util.Log.d("LocationServiceBridge", "📱 Starting regular service (Android 7-)");
                getContext().startService(locationService);
            }
            
            // Mark as sharing
            SharedPreferences prefs = getContext().getSharedPreferences("location_sharing", getContext().MODE_PRIVATE);
            prefs.edit().putBoolean("is_sharing", true).apply();
            
            android.util.Log.d("LocationServiceBridge", "✅ LocationTrackingService start command sent!");
            android.util.Log.d("LocationServiceBridge", "🔔 Foreground notification should appear now!");
            
            // Give the service a moment to start, then check if it's running
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                boolean isRunningAfter = isServiceRunning();
                android.util.Log.d("LocationServiceBridge", "🔍 Service running after start: " + isRunningAfter);
                if (!isRunningAfter) {
                    android.util.Log.e("LocationServiceBridge", "❌ SERVICE FAILED TO START - Check permissions and logs!");
                }
            }, 2000);
            
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("message", "LocationTrackingService started with MediaStyle notifications");
            call.resolve(result);
            
            android.util.Log.d("LocationServiceBridge", "✅ LocationTrackingService started successfully!");
        } catch (Exception e) {
            android.util.Log.e("LocationServiceBridge", "❌ Failed to start LocationTrackingService: " + e.getMessage());
            e.printStackTrace();
            call.reject("Failed to start location service: " + e.getMessage());
        }
    }

    private boolean isServiceRunning() {
        android.app.ActivityManager manager = (android.app.ActivityManager) getContext().getSystemService(getContext().ACTIVITY_SERVICE);
        for (android.app.ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
            if (LocationTrackingService.class.getName().equals(service.service.getClassName())) {
                return true;
            }
        }
        return false;
    }

    @PluginMethod
    public void stopLocationService(PluginCall call) {
        try {
            android.util.Log.d("LocationServiceBridge", "🛑 Stopping LocationTrackingService...");
            
            Intent locationService = new Intent(getContext(), LocationTrackingService.class);
            getContext().stopService(locationService);
            
            // Mark as not sharing
            SharedPreferences prefs = getContext().getSharedPreferences("location_sharing", getContext().MODE_PRIVATE);
            prefs.edit().putBoolean("is_sharing", false).apply();
            
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("message", "LocationTrackingService stopped");
            call.resolve(result);
            
            android.util.Log.d("LocationServiceBridge", "✅ LocationTrackingService stopped successfully!");
        } catch (Exception e) {
            android.util.Log.e("LocationServiceBridge", "❌ Failed to stop LocationTrackingService: " + e.getMessage());
            call.reject("Failed to stop location service: " + e.getMessage());
        }
    }
    
    @PluginMethod
    public void isLocationSharing(PluginCall call) {
        try {
            android.util.Log.d("LocationServiceBridge", "🔍 Checking location sharing status...");
            
            SharedPreferences prefs = getContext().getSharedPreferences("location_sharing", getContext().MODE_PRIVATE);
            boolean isSharing = prefs.getBoolean("is_sharing", false);
            boolean serviceRunning = isServiceRunning();
            
            android.util.Log.d("LocationServiceBridge", "📊 Sharing state - Prefs: " + isSharing + ", Service: " + serviceRunning);
            
            JSObject result = new JSObject();
            result.put("isSharing", isSharing && serviceRunning);
            result.put("serviceRunning", serviceRunning);
            call.resolve(result);
            
        } catch (Exception e) {
            android.util.Log.e("LocationServiceBridge", "❌ Failed to check sharing status: " + e.getMessage());
            call.reject("Failed to check sharing status: " + e.getMessage());
        }
    }
}
