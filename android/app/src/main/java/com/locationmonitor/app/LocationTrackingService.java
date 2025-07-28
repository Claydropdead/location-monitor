package com.locationmonitor.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

public class LocationTrackingService extends Service {
    private static final String CHANNEL_ID = "location_tracking_channel";
    private static final int NOTIFICATION_ID = 1;
    private static final String ACTION_PLAY_PAUSE = "com.locationmonitor.app.PLAY_PAUSE";
    private static final String ACTION_STOP = "com.locationmonitor.app.STOP";
    
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private Handler handler;
    private Runnable locationRunnable;
    private boolean isTracking = false;
    private NotificationManager notificationManager;
    private SupabaseClient supabaseClient;

    @Override
    public void onCreate() {
        super.onCreate();
        
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        supabaseClient = new SupabaseClient(this);
        handler = new Handler(Looper.getMainLooper());
        
        createNotificationChannel();
        setupLocationCallback();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            switch (intent.getAction()) {
                case ACTION_PLAY_PAUSE:
                    toggleTracking();
                    break;
                case ACTION_STOP:
                    stopLocationTracking();
                    stopSelf();
                    return START_NOT_STICKY;
            }
        } else {
            // Default behavior: start tracking
            startLocationTracking();
        }
        
        startForeground(NOTIFICATION_ID, createNotification());
        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Location Tracking",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Tracks your location in the background");
            channel.setShowBadge(false);
            notificationManager.createNotificationChannel(channel);
        }
    }

    private Notification createNotification() {
        Intent playPauseIntent = new Intent(this, LocationTrackingService.class);
        playPauseIntent.setAction(ACTION_PLAY_PAUSE);
        PendingIntent playPausePendingIntent = PendingIntent.getService(
            this, 0, playPauseIntent, 
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, LocationTrackingService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent, 
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String statusText = isTracking ? "Sharing location..." : "Location sharing paused";
        int playPauseIcon = isTracking ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String playPauseText = isTracking ? "Pause" : "Play";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Location Monitor")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setStyle(new MediaStyle()
                .setShowActionsInCompactView(0, 1))
            .addAction(playPauseIcon, playPauseText, playPausePendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPendingIntent)
            .build();
    }

    private void updateNotification() {
        if (notificationManager != null) {
            notificationManager.notify(NOTIFICATION_ID, createNotification());
        }
    }

    private void setupLocationCallback() {
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult != null && isTracking) {
                    Location location = locationResult.getLastLocation();
                    if (location != null) {
                        supabaseClient.upsertLocation(location.getLatitude(), location.getLongitude());
                    }
                }
            }
        };
    }

    private void startLocationTracking() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            isTracking = true;
            
            // Store sharing state for web app sync
            SharedPreferences prefs = getSharedPreferences("location_sharing", MODE_PRIVATE);
            prefs.edit().putBoolean("is_sharing", true).apply();
            
            // Create location request for 5-second intervals
            LocationRequest locationRequest = new LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY, 5000) // 5 seconds
                .setMinUpdateIntervalMillis(5000)
                .build();

            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());
            updateNotification();
        }
    }

    private void stopLocationTracking() {
        isTracking = false;
        
        // Store sharing state for web app sync
        SharedPreferences prefs = getSharedPreferences("location_sharing", MODE_PRIVATE);
        prefs.edit().putBoolean("is_sharing", false).apply();
        
        if (fusedLocationClient != null && locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
        }
        updateNotification();
    }

    private void toggleTracking() {
        if (isTracking) {
            stopLocationTracking();
        } else {
            startLocationTracking();
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopLocationTracking();
        if (handler != null && locationRunnable != null) {
            handler.removeCallbacks(locationRunnable);
        }
    }
}
