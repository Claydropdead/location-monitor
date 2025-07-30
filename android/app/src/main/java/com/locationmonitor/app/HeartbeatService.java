package com.locationmonitor.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
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

public class HeartbeatService extends Service {
    private static final String TAG = "HeartbeatService";
    private static final String CHANNEL_ID = "HEARTBEAT_CHANNEL";
    private static final int NOTIFICATION_ID = 1001;
    private static final int HEARTBEAT_INTERVAL = 30000; // 30 seconds

    // Supabase configuration
    private static final String SUPABASE_URL = "https://grkutsjbksioleoxfqnp.supabase.co";
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3V0c2pia3Npb2xlb3hmcW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjUxMDUsImV4cCI6MjA2OTAwMTEwNX0.kCTMxAqhAX53Vcw2AhV1gY4oEdADIh-N9FXDpk9rmWg";

    private Handler heartbeatHandler;
    private Runnable heartbeatRunnable;
    private OkHttpClient httpClient;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "🔥 HeartbeatService.onCreate() called!");
        
        // Initialize OkHttp client with timeouts
        httpClient = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build();
        
        createNotificationChannel();
        Log.d(TAG, "📱 Notification channel created");
        
        startForegroundService();
        Log.d(TAG, "✅ Started as foreground service");
        
        setupHeartbeatTimer();
        Log.d(TAG, "💓 Heartbeat timer setup complete");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "🚀 HeartbeatService.onStartCommand() called!");
        return START_STICKY; // Restart if killed
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // This is an unbound service
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Location Monitoring",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Background location monitoring service");
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
    }

    private void startForegroundService() {
        Notification notification = createNotification();
        startForeground(NOTIFICATION_ID, notification);
    }

    private Notification createNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Location Monitor")
            .setContentText("Monitoring location in background")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build();
    }

    private void setupHeartbeatTimer() {
        heartbeatHandler = new Handler(Looper.getMainLooper());
        heartbeatRunnable = new Runnable() {
            @Override
            public void run() {
                sendHeartbeat();
                // Schedule next heartbeat
                heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL);
            }
        };
        
        // Start first heartbeat
        heartbeatHandler.post(heartbeatRunnable);
        Log.d(TAG, "💓 Heartbeat timer started with " + HEARTBEAT_INTERVAL + "ms interval");
    }

    private void sendHeartbeat() {
        try {
            Log.d(TAG, "💓 Sending heartbeat...");
            
            // Get user ID from preferences
            SharedPreferences prefs = getSharedPreferences("LocationMonitorPrefs", Context.MODE_PRIVATE);
            String userId = prefs.getString("user_id", null);
            
            if (userId == null || userId.isEmpty()) {
                Log.e(TAG, "❌ No user ID found in preferences, stopping service");
                stopSelf();
                return;
            }
            
            // Create heartbeat data
            JSONObject heartbeatData = new JSONObject();
            heartbeatData.put("user_id", userId);
            heartbeatData.put("last_seen", System.currentTimeMillis() / 1000); // Unix timestamp
            heartbeatData.put("status", "online");
            
            // Prepare request
            MediaType JSON = MediaType.get("application/json; charset=utf-8");
            RequestBody body = RequestBody.create(heartbeatData.toString(), JSON);
            
            Request request = new Request.Builder()
                .url(SUPABASE_URL + "/rest/v1/user_locations")
                .post(body)
                .addHeader("apikey", SUPABASE_ANON_KEY)
                .addHeader("Authorization", "Bearer " + SUPABASE_ANON_KEY)
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", "resolution=merge-duplicates")
                .build();
            
            // Send request asynchronously
            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    Log.e(TAG, "❌ Heartbeat failed: " + e.getMessage());
                }
                
                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    if (response.isSuccessful()) {
                        Log.d(TAG, "✅ Heartbeat sent successfully");
                    } else {
                        Log.e(TAG, "❌ Heartbeat failed with status: " + response.code() + " - " + response.message());
                        Log.e(TAG, "Response body: " + response.body().string());
                    }
                    response.close();
                }
            });
            
        } catch (JSONException e) {
            Log.e(TAG, "❌ Failed to create heartbeat JSON", e);
        } catch (Exception e) {
            Log.e(TAG, "❌ Unexpected error in sendHeartbeat", e);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "🛑 HeartbeatService.onDestroy() called");
        
        // Clean up heartbeat timer
        if (heartbeatHandler != null && heartbeatRunnable != null) {
            heartbeatHandler.removeCallbacks(heartbeatRunnable);
            Log.d(TAG, "🧹 Heartbeat timer cleaned up");
        }
        
        // Clean up HTTP client
        if (httpClient != null) {
            httpClient.dispatcher().executorService().shutdown();
            httpClient.connectionPool().evictAll();
            Log.d(TAG, "🧹 HTTP client cleaned up");
        }
    }
}
