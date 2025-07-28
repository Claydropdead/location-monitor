package com.locationmonitor.app;

import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LocationServiceBridge")
public class LocationServiceBridge extends Plugin {

    @PluginMethod
    public void getLocationSharingState(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences("location_sharing", getContext().MODE_PRIVATE);
        boolean isSharing = prefs.getBoolean("is_sharing", false);
        
        JSObject result = new JSObject();
        result.put("isSharing", isSharing);
        call.resolve(result);
    }

    @PluginMethod
    public void setLocationSharingState(PluginCall call) {
        boolean isSharing = call.getBoolean("isSharing", false);
        
        SharedPreferences prefs = getContext().getSharedPreferences("location_sharing", getContext().MODE_PRIVATE);
        prefs.edit().putBoolean("is_sharing", isSharing).apply();
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
}
