package com.locationmonitor.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "LocationMonitor_BootReceiver";
    
    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Received intent: " + intent.getAction());
        
        String action = intent.getAction();
        if (action == null) return;
        
        switch (action) {
            case Intent.ACTION_BOOT_COMPLETED:
            case "android.intent.action.QUICKBOOT_POWERON":
                Log.d(TAG, "Device booted - checking if location tracking was active");
                restartLocationTrackingIfNeeded(context);
                break;
                
            case Intent.ACTION_MY_PACKAGE_REPLACED:
            case Intent.ACTION_PACKAGE_REPLACED:
                Log.d(TAG, "App updated - checking if location tracking was active");
                restartLocationTrackingIfNeeded(context);
                break;
        }
    }
    
    private void restartLocationTrackingIfNeeded(Context context) {
        // Check if user was previously tracking location
        SharedPreferences prefs = context.getSharedPreferences("LocationTracker", Context.MODE_PRIVATE);
        boolean wasTracking = prefs.getBoolean("was_tracking", false);
        String userId = prefs.getString("user_id", null);
        
        Log.d(TAG, "Was tracking: " + wasTracking + ", User ID: " + userId);
        
        if (wasTracking && userId != null) {
            Log.d(TAG, "Restarting location tracking after reboot/update");
            
            // Start the main app to resume tracking
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            launchIntent.putExtra("auto_restart_tracking", true);
            launchIntent.putExtra("user_id", userId);
            
            try {
                context.startActivity(launchIntent);
                Log.d(TAG, "Successfully started app for auto-restart");
            } catch (Exception e) {
                Log.e(TAG, "Failed to start app for auto-restart", e);
            }
        } else {
            Log.d(TAG, "No previous tracking session found, skipping auto-restart");
        }
    }
}
