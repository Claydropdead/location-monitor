package com.locationmonitor.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * NUCLEAR HEARTBEAT - Exact alarm receiver that CANNOT be ignored by Android
 * This is triggered every 30 seconds to keep our service alive
 */
public class HeartbeatAlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "HeartbeatAlarm";
    
    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "⚡ NUCLEAR HEARTBEAT TRIGGERED!");
        
        String action = intent.getAction();
        if ("com.locationmonitor.HEARTBEAT_ALARM".equals(action)) {
            // Check if our service is running
            String userId = intent.getStringExtra("userId");
            
            // If service is not running, restart it
            Intent serviceIntent = new Intent(context, RealtimeConnectionService.class);
            serviceIntent.putExtra("userId", userId);
            
            try {
                context.startForegroundService(serviceIntent);
                Log.d(TAG, "🚀 Service restarted via NUCLEAR HEARTBEAT");
            } catch (Exception e) {
                Log.e(TAG, "❌ Failed to restart service", e);
            }
        } else if ("com.locationmonitor.RESTART_SERVICE".equals(action)) {
            Log.d(TAG, "🔄 RESTART SERVICE ALARM TRIGGERED!");
            
            // Restart the service
            Intent serviceIntent = new Intent(context, RealtimeConnectionService.class);
            serviceIntent.putExtra("userId", intent.getStringExtra("userId"));
            
            try {
                context.startForegroundService(serviceIntent);
                Log.d(TAG, "🚀 Service NUCLEAR RESTARTED!");
            } catch (Exception e) {
                Log.e(TAG, "❌ Failed to nuclear restart service", e);
            }
        }
    }
}
