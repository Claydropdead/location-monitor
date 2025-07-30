package com.locationmonitor.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.content.Context;

/**
 * NUCLEAR BATTERY OPTIMIZATION BYPASS
 * Forces user to whitelist the app from battery optimization
 */
public class BatteryOptimizationHelper {
    private static final String TAG = "BatteryOptimization";
    
    /**
     * Check if app is whitelisted from battery optimization
     */
    public static boolean isIgnoringBatteryOptimizations(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            return powerManager.isIgnoringBatteryOptimizations(context.getPackageName());
        }
        return true; // Older versions don't have battery optimization
    }
    
    /**
     * Request user to disable battery optimization for this app
     * This is CRITICAL for keeping the service alive!
     */
    public static void requestIgnoreBatteryOptimizations(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!isIgnoringBatteryOptimizations(context)) {
                Log.d(TAG, "🚨 REQUESTING BATTERY OPTIMIZATION BYPASS!");
                
                Intent intent = new Intent();
                intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                
                try {
                    context.startActivity(intent);
                    Log.d(TAG, "✅ Battery optimization dialog opened");
                } catch (Exception e) {
                    Log.e(TAG, "❌ Failed to open battery optimization settings", e);
                    
                    // Fallback: Open battery settings manually
                    openBatterySettings(context);
                }
            } else {
                Log.d(TAG, "✅ App already whitelisted from battery optimization");
            }
        }
    }
    
    /**
     * Fallback: Open general battery settings
     */
    private static void openBatterySettings(Context context) {
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            Log.d(TAG, "📱 Opened battery optimization settings manually");
        } catch (Exception e) {
            Log.e(TAG, "❌ Failed to open battery settings", e);
        }
    }
    
    /**
     * Show user instructions for manual whitelisting
     */
    public static void showBatteryOptimizationInstructions() {
        Log.i(TAG, "📋 BATTERY OPTIMIZATION INSTRUCTIONS:");
        Log.i(TAG, "1. Open Settings > Battery > Battery Optimization");
        Log.i(TAG, "2. Find 'Location Monitor' app");
        Log.i(TAG, "3. Select 'Don't optimize'");
        Log.i(TAG, "4. This is CRITICAL for keeping the app online!");
    }
}
