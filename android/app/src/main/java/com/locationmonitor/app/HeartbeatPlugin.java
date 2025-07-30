package com.locationmonitor.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HeartbeatPlugin")
public class HeartbeatPlugin extends Plugin {
    private static final String TAG = "HeartbeatPlugin";
    
    @PluginMethod
    public void startHeartbeat(PluginCall call) {
        String userId = call.getString("userId");
        Log.d(TAG, "🔥 HeartbeatPlugin.startHeartbeat called with userId: " + userId);
        
        if (userId == null || userId.isEmpty()) {
            Log.e(TAG, "❌ userId is null or empty");
            call.reject("User ID is required");
            return;
        }
        
        Log.d(TAG, "💓 Starting native heartbeat service for user: " + userId);
        
        // Save user ID and tracking state to SharedPreferences
        Context context = getContext();
        Log.d(TAG, "📱 Got context: " + context);
        
        SharedPreferences prefs = context.getSharedPreferences("LocationMonitorPrefs", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString("user_id", userId);
        editor.putBoolean("was_tracking", true);
        editor.apply();
        Log.d(TAG, "💾 Saved preferences - userId: " + userId + ", wasTracking: true");
        
        // Start the foreground heartbeat service
        Intent serviceIntent = new Intent(context, HeartbeatService.class);
        Log.d(TAG, "🚀 Starting foreground service...");
        context.startForegroundService(serviceIntent);
        Log.d(TAG, "✅ HeartbeatService start command sent!");
        
        call.resolve();
    }
    
    @PluginMethod
    public void stopHeartbeat(PluginCall call) {
        Log.d(TAG, "Stopping native heartbeat service");
        
        // Update tracking state
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences("LocationMonitorPrefs", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putBoolean("was_tracking", false);
        editor.apply();
        
        // Stop the heartbeat service
        Intent serviceIntent = new Intent(context, HeartbeatService.class);
        context.stopService(serviceIntent);
        
        call.resolve();
    }
    
    @PluginMethod
    public void isHeartbeatActive(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences("LocationMonitorPrefs", Context.MODE_PRIVATE);
        boolean isTracking = prefs.getBoolean("was_tracking", false);
        String userId = prefs.getString("user_id", null);
        
        call.resolve(new com.getcapacitor.JSObject()
            .put("isActive", isTracking)
            .put("userId", userId));
    }
}
