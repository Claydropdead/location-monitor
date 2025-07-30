package com.locationmonitor.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

public class ServiceRestartReceiver extends BroadcastReceiver {
    private static final String TAG = "LocationMonitor_ServiceRestart";
    private static final int RESTART_DELAY_MS = 5000; // 5 seconds delay
    
    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Service restart receiver triggered");
        
        // Check if we should restart location tracking
        SharedPreferences prefs = context.getSharedPreferences("LocationTracker", Context.MODE_PRIVATE);
        boolean shouldRestart = prefs.getBoolean("should_auto_restart", false);
        boolean wasTracking = prefs.getBoolean("was_tracking", false);
        String userId = prefs.getString("user_id", null);
        
        Log.d(TAG, "Should restart: " + shouldRestart + ", Was tracking: " + wasTracking + ", User ID: " + userId);
        
        if (shouldRestart && wasTracking && userId != null) {
            Log.d(TAG, "Scheduling location service restart in " + RESTART_DELAY_MS + "ms");
            
            // Delay restart to avoid immediate re-killing
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                restartLocationService(context, userId);
            }, RESTART_DELAY_MS);
        }
    }
    
    private void restartLocationService(Context context, String userId) {
        try {
            Log.d(TAG, "Attempting to restart location service");
            
            // Start the main app to resume tracking
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | 
                                Intent.FLAG_ACTIVITY_CLEAR_TOP | 
                                Intent.FLAG_ACTIVITY_SINGLE_TOP);
            launchIntent.putExtra("auto_restart_tracking", true);
            launchIntent.putExtra("user_id", userId);
            launchIntent.putExtra("restart_reason", "service_killed");
            
            context.startActivity(launchIntent);
            Log.d(TAG, "Successfully restarted app for location tracking");
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to restart location service", e);
            
            // Fallback: try to start service directly
            try {
                Intent serviceIntent = new Intent();
                serviceIntent.setClassName(context, "com.getcapacitor.community.background.geolocation.BackgroundLocationService");
                context.startForegroundService(serviceIntent);
                Log.d(TAG, "Started location service directly as fallback");
            } catch (Exception se) {
                Log.e(TAG, "Failed to start service directly", se);
            }
        }
    }
}
