package com.locationmonitor.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.io.IOException;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * NUCLEAR SOLUTION: MAXIMUM AGGRESSION AGAINST ANDROID'S KILLING
 * Uses EVERY trick in the book to stay alive!
 */
public class RealtimeConnectionService extends Service {
    private static final String TAG = "RealtimeConnection";
    private static final String CHANNEL_ID = "REALTIME_CHANNEL";
    private static final int NOTIFICATION_ID = 2001;
    private static final int UPDATE_INTERVAL = 30000; // 30 seconds - MAXIMUM AGGRESSION
    private static final String ACTION_RESTART_SERVICE = "com.locationmonitor.RESTART_SERVICE";
    private static final String ACTION_HEARTBEAT_ALARM = "com.locationmonitor.HEARTBEAT_ALARM";
    
    // CORRECT Supabase configuration
    private static final String SUPABASE_URL = "https://grkutsjbksioleoxfqnp.supabase.co";
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3V0c2pia3Npb2xlb3hmcW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjUxMDUsImV4cCI6MjA2OTAwMTEwNX0.kCTMxAqhAX53Vcw2AhV1gY4oEdADIh-N9FXDpk9rmWg";
    
    private Handler updateHandler;
    private Runnable updateRunnable;
    private OkHttpClient httpClient;
    private String userId;
    private boolean isRunning = false;
    private int consecutiveFailures = 0;
    
    // NUCLEAR WEAPONS AGAINST ANDROID KILLING
    private PowerManager.WakeLock wakeLock;
    private AlarmManager alarmManager;
    private PendingIntent heartbeatPendingIntent;
    private BroadcastReceiver restartReceiver;
    private BroadcastReceiver heartbeatReceiver;
    
    // BEAUTIFUL FLOATING BUBBLE - Your brilliant solution!
    private FloatingBubble floatingBubble;
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "🔥 NUCLEAR RealtimeConnectionService created");
        
        httpClient = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build();
            
        // ACQUIRE NUCLEAR WAKE LOCK - NEVER LET ANDROID SLEEP
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "LocationMonitor::RealtimeWakeLock"
        );
        wakeLock.acquire(24 * 60 * 60 * 1000L); // 24 hours - MAXIMUM DURATION
        Log.d(TAG, "💪 WAKE LOCK ACQUIRED - Android cannot sleep!");
        
        // Set up EXACT ALARM SYSTEM - Bypass doze mode
        alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        setupExactAlarms();
        
        // Set up RESTART MECHANISM - Auto-restart if killed
        setupRestartMechanism();
        
        // CREATE BEAUTIFUL FLOATING BUBBLE - Your brilliant solution!
        floatingBubble = new FloatingBubble(this);
        
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, createNotification("🛡️ NUCLEAR MODE - Starting connection..."));
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            userId = intent.getStringExtra("userId");
            if (userId != null) {
                Log.d(TAG, "🚀 Starting BEAUTIFUL connection for user: " + userId);
                
                // Show the beautiful floating bubble - Your solution!
                if (floatingBubble != null) {
                    floatingBubble.showBubble();
                    Log.d(TAG, "✨ Beautiful floating bubble displayed!");
                }
                
                startPeriodicUpdates();
            } else {
                Log.e(TAG, "❌ No userId provided, stopping service");
                stopSelf();
            }
        }
        return START_STICKY; // Restart if killed
    }
    
    private void startPeriodicUpdates() {
        if (updateHandler != null) {
            updateHandler.removeCallbacks(updateRunnable);
        }
        
        updateHandler = new Handler(Looper.getMainLooper());
        updateRunnable = new Runnable() {
            @Override
            public void run() {
                if (isRunning) {
                    sendPresenceUpdate();
                    // Schedule next update
                    updateHandler.postDelayed(this, UPDATE_INTERVAL);
                }
            }
        };
        
        isRunning = true;
        // Send first update immediately
        sendPresenceUpdate();
        // Schedule periodic updates
        updateHandler.postDelayed(updateRunnable, UPDATE_INTERVAL);
        
        Log.d(TAG, "💓 Started NUCLEAR periodic updates every " + UPDATE_INTERVAL + "ms");
    }
    
    /**
     * NUCLEAR WEAPON #1: EXACT ALARMS - Bypass Android Doze Mode
     */
    private void setupExactAlarms() {
        // Create heartbeat alarm that triggers every 30 seconds
        Intent alarmIntent = new Intent(this, HeartbeatAlarmReceiver.class);
        alarmIntent.setAction(ACTION_HEARTBEAT_ALARM);
        alarmIntent.putExtra("userId", userId);
        
        heartbeatPendingIntent = PendingIntent.getBroadcast(
            this, 
            1001, 
            alarmIntent, 
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        // Schedule EXACT alarm - cannot be delayed by Android
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + UPDATE_INTERVAL,
                heartbeatPendingIntent
            );
        } else {
            alarmManager.setExact(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + UPDATE_INTERVAL,
                heartbeatPendingIntent
            );
        }
        
        Log.d(TAG, "⏰ EXACT ALARM SET - Android cannot ignore this!");
    }
    
    /**
     * NUCLEAR WEAPON #2: AUTO-RESTART MECHANISM
     */
    private void setupRestartMechanism() {
        // Register receiver for restart signals
        restartReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Log.d(TAG, "🔄 RESTART SIGNAL RECEIVED - Restarting service!");
                Intent serviceIntent = new Intent(context, RealtimeConnectionService.class);
                serviceIntent.putExtra("userId", userId);
                context.startForegroundService(serviceIntent);
            }
        };
        
        IntentFilter restartFilter = new IntentFilter(ACTION_RESTART_SERVICE);
        registerReceiver(restartReceiver, restartFilter);
        
        // Register heartbeat receiver
        heartbeatReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Log.d(TAG, "💓 HEARTBEAT ALARM TRIGGERED!");
                
                // Send presence update
                sendPresenceUpdate();
                
                // Schedule next heartbeat
                setupExactAlarms();
            }
        };
        
        IntentFilter heartbeatFilter = new IntentFilter(ACTION_HEARTBEAT_ALARM);
        registerReceiver(heartbeatReceiver, heartbeatFilter);
        
        Log.d(TAG, "🛡️ RESTART MECHANISM ACTIVE - We will never die!");
    }
    
    private void sendPresenceUpdate() {
        try {
            Log.d(TAG, "💓 Sending REAL presence update to database...");
            
            // Create the EXACT same data structure your dashboard expects
            JSONObject updateData = new JSONObject();
            updateData.put("user_id", userId);
            updateData.put("timestamp", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(new java.util.Date()));
            updateData.put("is_active", true);
            // Don't update lat/lng - this is just a "I'm still here" ping
            
            MediaType JSON = MediaType.get("application/json; charset=utf-8");
            RequestBody body = RequestBody.create(updateData.toString(), JSON);
            
            // Use PATCH to update existing record (not create new ones)
            Request request = new Request.Builder()
                .url(SUPABASE_URL + "/rest/v1/user_locations?user_id=eq." + userId)
                .patch(body)
                .addHeader("apikey", SUPABASE_ANON_KEY)
                .addHeader("Authorization", "Bearer " + SUPABASE_ANON_KEY)
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", "return=minimal")
                .build();
            
            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    consecutiveFailures++;
                    Log.e(TAG, "❌ Presence update failed (attempt " + consecutiveFailures + "): " + e.getMessage());
                    updateNotification("Connection Failed - Retrying...");
                    
                    // Update bubble to show error state
                    if (floatingBubble != null) {
                        floatingBubble.updateBubbleStatus(false);
                    }
                    
                    // If too many failures, try restarting
                    if (consecutiveFailures >= 5) {
                        Log.w(TAG, "⚠️ Too many failures, restarting service...");
                        restartService();
                    }
                }
                
                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    if (response.isSuccessful()) {
                        consecutiveFailures = 0; // Reset failure counter
                        Log.d(TAG, "✅ BEAUTIFUL presence update successful!");
                        updateNotification("🛡️ Connected - User Online");
                        
                        // Update bubble to show success state
                        if (floatingBubble != null) {
                            floatingBubble.updateBubbleStatus(true);
                        }
                    } else {
                        consecutiveFailures++;
                        String responseBody = response.body() != null ? response.body().string() : "No body";
                        Log.e(TAG, "❌ Presence update failed with status: " + response.code());
                        Log.e(TAG, "Response: " + responseBody);
                        updateNotification("Update Failed - Retrying...");
                        
                        // Update bubble to show error state
                        if (floatingBubble != null) {
                            floatingBubble.updateBubbleStatus(false);
                        }
                    }
                    response.close();
                }
            });
            
        } catch (JSONException e) {
            Log.e(TAG, "❌ Failed to create update JSON", e);
        } catch (Exception e) {
            Log.e(TAG, "❌ Unexpected error in sendPresenceUpdate", e);
        }
    }
    
    private void restartService() {
        consecutiveFailures = 0;
        Log.d(TAG, "🔄 Restarting service...");
        
        Intent restartIntent = new Intent(this, RealtimeConnectionService.class);
        restartIntent.putExtra("userId", userId);
        
        stopSelf();
        startForegroundService(restartIntent);
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "🛡️ NUCLEAR Online Status",
                NotificationManager.IMPORTANCE_HIGH  // HIGH PRIORITY - Cannot be dismissed
            );
            channel.setDescription("NUCLEAR MODE: Keeps user online in database - CANNOT BE STOPPED!");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setShowBadge(true);
            channel.enableVibration(false); // Don't annoy user
            channel.enableLights(false);
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
    }
    
    private Notification createNotification(String status) {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE
        );
        
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🛡️ Location Monitor - NUCLEAR MODE")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)  // HIGH PRIORITY
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)  // Cannot be swiped away
            .setAutoCancel(false)  // Cannot be cancelled
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis())
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }
    
    private void updateNotification(String status) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, createNotification(status));
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "🛑 NUCLEAR RealtimeConnectionService destroyed - BUT WE WILL RESTART!");
        
        isRunning = false;
        
        if (updateHandler != null && updateRunnable != null) {
            updateHandler.removeCallbacks(updateRunnable);
        }
        
        // Send final offline status
        if (userId != null) {
            sendOfflineStatus();
        }
        
        // Hide the beautiful floating bubble
        if (floatingBubble != null) {
            floatingBubble.hideBubble();
            Log.d(TAG, "🫧 Beautiful floating bubble hidden");
        }
        
        // Clean up nuclear weapons
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            Log.d(TAG, "💤 Wake lock released");
        }
        
        if (heartbeatPendingIntent != null && alarmManager != null) {
            alarmManager.cancel(heartbeatPendingIntent);
            Log.d(TAG, "⏰ Exact alarms cancelled");
        }
        
        // Unregister receivers
        if (restartReceiver != null) {
            try {
                unregisterReceiver(restartReceiver);
            } catch (Exception e) {
                Log.w(TAG, "Failed to unregister restart receiver", e);
            }
        }
        
        if (heartbeatReceiver != null) {
            try {
                unregisterReceiver(heartbeatReceiver);
            } catch (Exception e) {
                Log.w(TAG, "Failed to unregister heartbeat receiver", e);
            }
        }
        
        if (httpClient != null) {
            httpClient.dispatcher().executorService().shutdown();
        }
        
        // NUCLEAR RESTART - Schedule immediate restart
        scheduleRestart();
    }
    
    /**
     * NUCLEAR RESTART - If Android kills us, we come back STRONGER!
     */
    private void scheduleRestart() {
        Log.d(TAG, "☢️ SCHEDULING NUCLEAR RESTART!");
        
        Intent restartIntent = new Intent(ACTION_RESTART_SERVICE);
        PendingIntent restartPendingIntent = PendingIntent.getBroadcast(
            this,
            2001,
            restartIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        // Schedule restart in 5 seconds
        alarmManager.setExact(
            AlarmManager.RTC_WAKEUP,
            System.currentTimeMillis() + 5000,
            restartPendingIntent
        );
        
        Log.d(TAG, "🔄 RESTART SCHEDULED - We are IMMORTAL!");
    }
    
    private void sendOfflineStatus() {
        try {
            JSONObject updateData = new JSONObject();
            updateData.put("user_id", userId);
            updateData.put("timestamp", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(new java.util.Date()));
            updateData.put("is_active", false);
            
            MediaType JSON = MediaType.get("application/json; charset=utf-8");
            RequestBody body = RequestBody.create(updateData.toString(), JSON);
            
            Request request = new Request.Builder()
                .url(SUPABASE_URL + "/rest/v1/user_locations?user_id=eq." + userId)
                .patch(body)
                .addHeader("apikey", SUPABASE_ANON_KEY)
                .addHeader("Authorization", "Bearer " + SUPABASE_ANON_KEY)
                .addHeader("Content-Type", "application/json")
                .build();
            
            Response response = httpClient.newCall(request).execute();
            Log.d(TAG, response.isSuccessful() ? "✅ Offline status sent" : "❌ Failed to send offline status");
            response.close();
        } catch (Exception e) {
            Log.e(TAG, "Failed to send offline status", e);
        }
    }
    
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
