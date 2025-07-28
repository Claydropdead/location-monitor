package com.locationmonitor.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import okhttp3.*;
import org.json.JSONObject;
import java.io.IOException;

public class SupabaseClient {
    private static final String TAG = "SupabaseClient";
    private static final String SUPABASE_URL = "https://fctfzvzaqvyrsaykmhwn.supabase.co";
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjdGZ6dnphcXZ5cnNheWttaHduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUxMzk3NjQsImV4cCI6MjA1MDcxNTc2NH0.2GCDOc8VrVjMTUGWW5Z8VWl5Kup2PNXGl5YHyVk2mDI";
    
    private final OkHttpClient client;
    private final Context context;

    public SupabaseClient(Context context) {
        this.context = context;
        this.client = new OkHttpClient();
    }

    public void upsertLocation(double latitude, double longitude) {
        String userId = getUserId();
        if (userId == null) {
            Log.w(TAG, "No user ID found, skipping location update");
            return;
        }

        try {
            JSONObject locationData = new JSONObject();
            locationData.put("user_id", userId);
            locationData.put("latitude", latitude);
            locationData.put("longitude", longitude);
            locationData.put("timestamp", System.currentTimeMillis() / 1000); // Unix timestamp

            RequestBody body = RequestBody.create(
                locationData.toString(),
                MediaType.parse("application/json")
            );

            Request request = new Request.Builder()
                .url(SUPABASE_URL + "/rest/v1/locations")
                .post(body)
                .addHeader("apikey", SUPABASE_ANON_KEY)
                .addHeader("Authorization", "Bearer " + getAccessToken())
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", "resolution=merge-duplicates")
                .build();

            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    Log.e(TAG, "Failed to send location", e);
                }

                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    if (response.isSuccessful()) {
                        Log.d(TAG, "Location updated successfully");
                    } else {
                        Log.e(TAG, "Failed to update location: " + response.code() + " " + response.message());
                    }
                    response.close();
                }
            });

        } catch (Exception e) {
            Log.e(TAG, "Error creating location request", e);
        }
    }

    private String getUserId() {
        SharedPreferences prefs = context.getSharedPreferences("supabase_auth", Context.MODE_PRIVATE);
        return prefs.getString("user_id", null);
    }

    private String getAccessToken() {
        SharedPreferences prefs = context.getSharedPreferences("supabase_auth", Context.MODE_PRIVATE);
        return prefs.getString("access_token", SUPABASE_ANON_KEY);
    }
}
