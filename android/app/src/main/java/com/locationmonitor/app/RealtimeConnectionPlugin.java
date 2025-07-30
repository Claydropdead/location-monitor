package com.locationmonitor.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RealtimeConnectionPlugin")
public class RealtimeConnectionPlugin extends Plugin {
    private static final String TAG = "RealtimeConnectionPlugin";
    
    @PluginMethod
    public void startRealtimeConnection(PluginCall call) {
        String userId = call.getString("userId");
        Log.d(TAG, "🔥 Starting NUCLEAR realtime connection for user: " + userId);
        
        if (userId == null || userId.isEmpty()) {
            Log.e(TAG, "❌ userId is required");
            call.reject("User ID is required");
            return;
        }
        
        Context context = getContext();
        
        // STEP 1: Request battery optimization bypass - CRITICAL!
        Log.d(TAG, "🚨 Requesting battery optimization bypass...");
        BatteryOptimizationHelper.requestIgnoreBatteryOptimizations(context);
        BatteryOptimizationHelper.showBatteryOptimizationInstructions();
        
        // STEP 2: Start the NUCLEAR service
        Intent serviceIntent = new Intent(context, RealtimeConnectionService.class);
        serviceIntent.putExtra("userId", userId);
        
        try {
            context.startForegroundService(serviceIntent);
            Log.d(TAG, "✅ NUCLEAR RealtimeConnectionService started successfully");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "❌ Failed to start NUCLEAR RealtimeConnectionService", e);
            call.reject("Failed to start nuclear realtime connection: " + e.getMessage());
        }
    }
    
    @PluginMethod
    public void stopRealtimeConnection(PluginCall call) {
        Log.d(TAG, "🛑 Stopping realtime connection");
        
        Context context = getContext();
        Intent serviceIntent = new Intent(context, RealtimeConnectionService.class);
        
        try {
            context.stopService(serviceIntent);
            Log.d(TAG, "✅ RealtimeConnectionService stopped");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "❌ Failed to stop RealtimeConnectionService", e);
            call.reject("Failed to stop realtime connection: " + e.getMessage());
        }
    }
}
