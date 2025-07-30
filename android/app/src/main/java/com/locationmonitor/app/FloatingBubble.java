package com.locationmonitor.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.Toast;

/**
 * BEAUTIFUL FLOATING BUBBLE - Clean, small, elegant
 * This creates a tiny floating bubble that keeps the app alive
 */
public class FloatingBubble {
    private static final String TAG = "FloatingBubble";
    private Context context;
    private WindowManager windowManager;
    private View floatingView;
    private WindowManager.LayoutParams params;
    private boolean isShowing = false;
    
    // Bubble properties
    private static final int BUBBLE_SIZE = 120; // Small size in pixels
    private int initialX, initialY; // Changed from float to int
    private float initialTouchX, initialTouchY;
    private boolean isConnected = true; // Connection status for color
    
    public FloatingBubble(Context context) {
        this.context = context;
        this.windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        
        // Log device info for debugging
        Log.d(TAG, "🔍 Device: " + Build.MANUFACTURER + " " + Build.MODEL);
        Log.d(TAG, "🔍 Android: " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
        
        if (hasProblematicManufacturer()) {
            Log.w(TAG, "⚠️ Detected potentially problematic manufacturer for overlays");
        }
    }
    
    /**
     * Check if the device manufacturer is known to have overlay issues
     */
    private boolean hasProblematicManufacturer() {
        String manufacturer = Build.MANUFACTURER.toLowerCase();
        return manufacturer.contains("xiaomi") || 
               manufacturer.contains("huawei") || 
               manufacturer.contains("honor") ||
               manufacturer.contains("oppo") || 
               manufacturer.contains("vivo") ||
               manufacturer.contains("realme");
    }
    
    /**
     * Check if overlay permission is granted
     */
    public boolean hasOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return Settings.canDrawOverlays(context);
        }
        return true;
    }
    
    /**
     * Request overlay permission with manufacturer-specific guidance
     */
    public void requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !hasOverlayPermission()) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            
            // Manufacturer-specific guidance
            String manufacturer = Build.MANUFACTURER.toLowerCase();
            String message = "Please allow 'Display over other apps' for Location Monitor";
            
            if (manufacturer.contains("xiaomi")) {
                message += "\n\nXiaomi: Also enable 'Display pop-up windows' in MIUI settings";
            } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
                message += "\n\nHuawei/Honor: Enable 'Display over other apps' in Phone Manager";
            } else if (manufacturer.contains("oppo") || manufacturer.contains("oneplus")) {
                message += "\n\nOppo/OnePlus: Allow 'Display over other apps' in App permissions";
            } else if (manufacturer.contains("vivo")) {
                message += "\n\nVivo: Enable 'Display over other apps' in i Manager";
            }
            
            Toast.makeText(context, message, Toast.LENGTH_LONG).show();
        }
    }
    
    /**
     * Show the beautiful floating bubble
     */
    public void showBubble() {
        if (!hasOverlayPermission()) {
            Log.w(TAG, "No overlay permission - requesting...");
            requestOverlayPermission();
            return;
        }
        
        if (isShowing) {
            Log.d(TAG, "Bubble already showing");
            return;
        }
        
        try {
            // Create bubble view
            createBubbleView();
            
            // Set up window parameters
            setupWindowParams();
            
            // Add bubble to window
            windowManager.addView(floatingView, params);
            isShowing = true;
            
            Log.d(TAG, "✨ Beautiful floating bubble created!");
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Failed to create floating bubble", e);
        }
    }
    
    /**
     * Create the beautiful bubble view
     */
    private void createBubbleView() {
        // Create a simple circular view
        floatingView = new View(context) {
            @Override
            protected void onDraw(android.graphics.Canvas canvas) {
                // Draw a beautiful circular bubble
                android.graphics.Paint paint = new android.graphics.Paint();
                paint.setAntiAlias(true);
                
                // Outer circle (shadow/border)
                paint.setColor(0x40000000); // Semi-transparent black shadow
                canvas.drawCircle(BUBBLE_SIZE/2f, BUBBLE_SIZE/2f, BUBBLE_SIZE/2f - 2, paint);
                
                // Inner circle (main bubble) - color changes based on connection
                int bubbleColor = isConnected ? 0xFF4CAF50 : 0xFFFF5722; // Green if connected, red if not
                paint.setColor(bubbleColor);
                canvas.drawCircle(BUBBLE_SIZE/2f, BUBBLE_SIZE/2f, BUBBLE_SIZE/2f - 8, paint);
                
                // Inner ring (accent)
                paint.setColor(0x80FFFFFF); // Semi-transparent white
                paint.setStyle(android.graphics.Paint.Style.STROKE);
                paint.setStrokeWidth(3);
                canvas.drawCircle(BUBBLE_SIZE/2f, BUBBLE_SIZE/2f, BUBBLE_SIZE/2f - 20, paint);
                
                // Center dot (indicator) - pulses when connected
                paint.setStyle(android.graphics.Paint.Style.FILL);
                paint.setColor(0xFFFFFFFF); // White
                float pulseRadius = isConnected ? 10 : 6; // Larger when connected
                canvas.drawCircle(BUBBLE_SIZE/2f, BUBBLE_SIZE/2f, pulseRadius, paint);
                
                // Location icon - small "📍" effect
                paint.setColor(0x80FFFFFF);
                canvas.drawCircle(BUBBLE_SIZE/2f, BUBBLE_SIZE/2f - 15, 4, paint);
                
                super.onDraw(canvas);
            }
        };
        
        // Set bubble size
        floatingView.setLayoutParams(new WindowManager.LayoutParams(BUBBLE_SIZE, BUBBLE_SIZE));
        
        // Add touch listeners for dragging
        setupTouchListeners();
    }
    
    /**
     * Setup window parameters for the bubble with enhanced compatibility
     */
    private void setupWindowParams() {
        // Choose the best window type for maximum compatibility
        int windowType;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            windowType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            windowType = WindowManager.LayoutParams.TYPE_PHONE;
        } else {
            windowType = WindowManager.LayoutParams.TYPE_SYSTEM_OVERLAY;
        }
        
        params = new WindowManager.LayoutParams(
            BUBBLE_SIZE,
            BUBBLE_SIZE,
            windowType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | 
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL |
            WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH |
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED, // Better performance
            PixelFormat.TRANSLUCENT
        );
        
        // Position bubble on right side of screen
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 50; // 50px from left
        params.y = 200; // 200px from top
        
        // Enhanced compatibility settings
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
    }
    
    /**
     * Setup touch listeners for dragging the bubble
     */
    private void setupTouchListeners() {
        floatingView.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        // Remember initial position
                        initialX = params.x;
                        initialY = params.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        return true;
                        
                    case MotionEvent.ACTION_MOVE:
                        // Update bubble position with proper casting
                        params.x = (int) (initialX + (event.getRawX() - initialTouchX));
                        params.y = (int) (initialY + (event.getRawY() - initialTouchY));
                        
                        try {
                            windowManager.updateViewLayout(floatingView, params);
                        } catch (Exception e) {
                            Log.e(TAG, "Failed to update bubble position", e);
                        }
                        return true;
                        
                    case MotionEvent.ACTION_UP:
                        // Snap to edge for better UX
                        snapToEdge();
                        
                        // Check if it was a click (not drag)
                        if (Math.abs(event.getRawX() - initialTouchX) < 20 && 
                            Math.abs(event.getRawY() - initialTouchY) < 20) {
                            onBubbleClicked();
                        }
                        return true;
                }
                return false;
            }
        });
    }
    
    /**
     * Snap bubble to screen edge for better UX
     */
    private void snapToEdge() {
        try {
            // Get screen width
            android.util.DisplayMetrics metrics = new android.util.DisplayMetrics();
            windowManager.getDefaultDisplay().getMetrics(metrics);
            int screenWidth = metrics.widthPixels;
            
            // Snap to closest edge
            if (params.x < screenWidth / 2) {
                params.x = 20; // Snap to left
            } else {
                params.x = screenWidth - BUBBLE_SIZE - 20; // Snap to right
            }
            
            // Keep within screen bounds
            if (params.y < 0) params.y = 0;
            if (params.y > metrics.heightPixels - BUBBLE_SIZE) {
                params.y = metrics.heightPixels - BUBBLE_SIZE;
            }
            
            windowManager.updateViewLayout(floatingView, params);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to snap bubble to edge", e);
        }
    }
    
    /**
     * Handle bubble click
     */
    private void onBubbleClicked() {
        Log.d(TAG, "🎯 Bubble clicked!");
        
        // Open the main app
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            context.startActivity(intent);
        }
        
        // Show a quick toast
        Toast.makeText(context, "📍 Location Monitor Active", Toast.LENGTH_SHORT).show();
    }
    
    /**
     * Hide the floating bubble
     */
    public void hideBubble() {
        if (isShowing && floatingView != null) {
            try {
                windowManager.removeView(floatingView);
                isShowing = false;
                Log.d(TAG, "🫧 Floating bubble hidden");
            } catch (Exception e) {
                Log.e(TAG, "Failed to hide bubble", e);
            }
        }
    }
    
    /**
     * Update bubble appearance based on connection status
     */
    public void updateBubbleStatus(boolean isConnected) {
        this.isConnected = isConnected;
        if (floatingView != null) {
            // Change color based on status
            floatingView.post(() -> {
                // This will trigger onDraw with updated status
                floatingView.invalidate();
            });
            
            Log.d(TAG, isConnected ? "🟢 Bubble: Connected" : "🔴 Bubble: Disconnected");
        }
    }
    
    /**
     * Check if bubble is currently showing
     */
    public boolean isShowing() {
        return isShowing;
    }
}
