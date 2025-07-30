'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GeolocationPosition } from '@/types'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { NativeGeolocationService } from '@/lib/native-geolocation'
import { batteryOptimizationService } from '@/lib/battery-optimization'

// Register HeartbeatPlugin globally  
interface HeartbeatPlugin {
  startHeartbeat(options: { userId: string }): Promise<void>
  stopHeartbeat(): Promise<void>
  isHeartbeatActive(): Promise<{ isActive: boolean }>
}
const HeartbeatService = registerPlugin<HeartbeatPlugin>('HeartbeatPlugin')

// NEW: The REAL solution - WebSocket-based persistent connection
interface RealtimeConnectionPlugin {
  startRealtimeConnection(options: { userId: string }): Promise<void>
  stopRealtimeConnection(): Promise<void>
}
const RealtimeConnection = registerPlugin<RealtimeConnectionPlugin>('RealtimeConnectionPlugin')

interface UseLocationOptions {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
  updateInterval?: number
  onLocationUpdate?: () => void
}

export const useLocation = (userId: string | null, options: UseLocationOptions = {}) => {
  const [position, setPosition] = useState<GeolocationPosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [permission, setPermission] = useState<PermissionState>('prompt')
  const [isSharing, setIsSharing] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  
  // Use ref for retry count to avoid triggering re-renders
  const retryCountRef = useRef(0)
  const lastUpdateRef = useRef(0)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const currentLocationRef = useRef<GeolocationPosition | null>(null)
  const updateThrottle = 5000
  
  const supabase = createClient()
  
  // Memoize the geolocation service to avoid re-creation on every render
  const geoService = useMemo(() => new NativeGeolocationService(), [])
  
  const {
    onLocationUpdate
  } = options

  const checkPermission = useCallback(async () => {
    try {
      const permissions = await geoService.requestPermissions()
      setPermission(permissions.granted ? 'granted' : 'denied')
    } catch (error) {
      console.warn('Could not query geolocation permission:', error)
      setPermission('denied')
    }
  }, [geoService])

  const updateLocationInDB = useCallback(async (pos: GeolocationPosition, force: boolean = false) => {
    if (!userId) {
      console.warn('No userId provided for location update')
      return
    }

    // Check if we're online before attempting database update
    if (!navigator.onLine && !force) {
      console.log('📡 Offline - queueing location update for when connection returns')
      return
    }

    const now = Date.now()
    if (!force && now - lastUpdateRef.current < updateThrottle) {
      console.log('⏱️ Location update throttled, skipping database write')
      return
    }
    lastUpdateRef.current = now

    console.log('🌍 Updating location in DB for user:', userId)
    console.log('📍 Position:', pos.coords.latitude, pos.coords.longitude)
    console.log('🎯 Accuracy:', pos.coords.accuracy ? `±${Math.round(pos.coords.accuracy)}m` : 'Unknown')
    console.log('🌐 Network status:', navigator.onLine ? 'Online' : 'Offline')

    try {
      console.log('🔄 Upserting location record (single record per user)...')
      
      const { error } = await supabase
        .from('user_locations')
        .upsert({
          user_id: userId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date().toISOString(),
          is_active: true
        }, {
          onConflict: 'user_id'
        })

      if (error) {
        console.error('❌ Error upserting location:', error)
        console.error('❌ Upsert error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      console.log('✅ Location record upserted successfully (single record per user)')
      
      // Verification query
      console.log('🔍 Verifying location record...')
      const { data: verifyData, error: verifyError } = await supabase
        .from('user_locations')
        .select('id, is_active, timestamp')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (verifyError) {
        console.error('❌ Error verifying location record:', verifyError)
      } else if (verifyData) {
        console.log('✅ Verification successful - Active record found:', {
          id: verifyData.id,
          is_active: verifyData.is_active,
          timestamp: verifyData.timestamp
        })
      } else {
        console.error('❌ Verification failed - No active record found!')
      }

      if (onLocationUpdate) {
        onLocationUpdate()
      }
    } catch (error) {
      console.error('Failed to update location in database:', error)
      console.error('Error details:', {
        message: (error as { message?: string })?.message,
        code: (error as { code?: string })?.code,
        details: (error as { details?: string })?.details,
        hint: (error as { hint?: string })?.hint,
        userId: userId,
        coords: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }
      })
    }
  }, [userId, supabase, onLocationUpdate])

  // Heartbeat function to keep stationary users marked as online
  const sendHeartbeat = useCallback(async () => {
    if (!userId || !isSharing) {
      console.log('💓 Heartbeat skipped - not sharing or no userId')
      return
    }

    // Check if we're online before attempting heartbeat
    if (!navigator.onLine) {
      console.log('� Heartbeat skipped - offline')
      return
    }

    console.log('💓 Sending heartbeat to keep stationary user online (user:', userId, ')')
    
    try {
      const { error } = await supabase
        .from('user_locations')
        .update({
          timestamp: new Date().toISOString(),
          is_active: true
          // Don't update lat/lng - this is just a "I'm still here" signal
        })
        .eq('user_id', userId)

      if (error) {
        console.error('❌ Heartbeat error:', error)
        // If it's a network error, that's expected when offline
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          console.log('📡 Heartbeat failed due to network - user is likely offline')
        }
      } else {
        console.log('✅ Heartbeat sent successfully - user stays online while stationary')
      }
    } catch (error) {
      console.error('❌ Heartbeat failed:', error)
      // Network errors are expected when actually offline
      if (error instanceof Error && (error.message?.includes('fetch') || error.message?.includes('network'))) {
        console.log('📡 Heartbeat failed due to network - user is likely offline')
      }
    }
  }, [userId, isSharing, supabase])

  // Auto-restart functionality for Android
  const setTrackingState = useCallback(async (isTracking: boolean, userId?: string) => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Preferences } = await import('@capacitor/preferences')
        
        await Preferences.set({
          key: 'was_tracking',
          value: isTracking.toString()
        })
        
        await Preferences.set({
          key: 'should_auto_restart', 
          value: 'true'
        })
        
        if (userId) {
          await Preferences.set({
            key: 'user_id',
            value: userId
          })
        }
        
        console.log('📱 Auto-restart state saved:', { isTracking, userId })
      } catch (error) {
        console.error('Failed to save tracking state:', error)
      }
    }
  }, [])

  // Check if we should auto-restart tracking on app startup
  const checkAutoRestart = useCallback(async () => {
    if (Capacitor.isNativePlatform() && userId) {
      try {
        const { Preferences } = await import('@capacitor/preferences')
        
        const wasTracking = await Preferences.get({ key: 'was_tracking' })
        const shouldAutoRestart = await Preferences.get({ key: 'should_auto_restart' })
        const savedUserId = await Preferences.get({ key: 'user_id' })
        
        console.log('🔄 Auto-restart check:', {
          wasTracking: wasTracking.value,
          shouldAutoRestart: shouldAutoRestart.value,
          savedUserId: savedUserId.value,
          currentUserId: userId
        })
        
        if (wasTracking.value === 'true' && 
            shouldAutoRestart.value === 'true' && 
            savedUserId.value === userId && 
            !isSharing) {
          console.log('🚀 Auto-restarting location tracking...')
          setTimeout(() => {
            startWatching()
          }, 2000) // Small delay to ensure app is fully loaded
        }
      } catch (error) {
        console.error('Failed to check auto-restart:', error)
      }
    }
  }, [userId, isSharing]) // Remove startWatching from dependencies to avoid circular reference

  // Simple mark user as offline when they close the app
  const markUserOffline = useCallback(async () => {
    if (userId) {
      console.log('🔴 Marking user offline:', userId)
      try {
        await supabase
          .from('user_locations')
          .update({
            is_active: false,
            timestamp: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('is_active', true)
      } catch (error) {
        console.error('Failed to mark user offline:', error)
      }
    }
  }, [userId, supabase])

  const getCurrentPosition = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const position = await geoService.getCurrentPosition()
      if (position) {
        setPosition(position)
        updateLocationInDB(position, true)
      } else {
        setError('Unable to get current position')
      }
      setLoading(false)
    } catch (error) {
      console.error('getCurrentPosition error:', error)
      
      let errorMessage = 'An error occurred while retrieving location'
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as { code: number }).code
        switch (errorCode) {
          case 1:
            errorMessage = 'Location access denied by user'
            setPermission('denied')
            break
          case 2:
            errorMessage = 'Location information is unavailable'
            break
          case 3:
            errorMessage = 'Location request timed out'
            break
          default:
            errorMessage = `Unknown location error (code: ${errorCode})`
        }
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = (error as { message: string }).message
      }

      setError(errorMessage)
      setLoading(false)
    }
  }, [geoService, updateLocationInDB])

  const startWatching = useCallback(async () => {
    if (!userId) {
      console.warn('❌ No userId provided for location watching - user must be logged in')
      setError('Please log in to start location sharing')
      return null
    }

    console.log('🚀 Starting background location tracking for user:', userId)
    setError(null)
    setLoading(true)

    try {
      if (Capacitor.isNativePlatform()) {
        console.log('📱 Starting background geolocation with notification...')
        
        // Request battery optimization exemption for reliable background tracking
        console.log('🔋 Requesting battery optimization exemption...')
        const batteryOptimized = await batteryOptimizationService.requestDisableBatteryOptimizations()
        if (!batteryOptimized) {
          console.warn('⚠️ Battery optimization exemption not granted - background tracking may be unreliable')
        }
        
        try {
          // Use Capacitor Community Background Geolocation plugin
          const { registerPlugin } = await import('@capacitor/core')
          
          interface BackgroundGeolocationPlugin {
            addWatcher(
              options: {
                backgroundMessage?: string;
                backgroundTitle?: string;
                requestPermissions?: boolean;
                stale?: boolean;
                distanceFilter?: number;
                enableHighAccuracy?: boolean;
              },
              callback: (
                location?: { latitude: number; longitude: number; accuracy?: number; altitude?: number; altitudeAccuracy?: number; bearing?: number; speed?: number; time?: number },
                error?: { message: string; code?: string }
              ) => void
            ): Promise<string>;
            removeWatcher(options: { id: string }): Promise<void>;
          }
          
          const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')
          
          let lastLocationTime = 0
          let timerInterval: NodeJS.Timeout | null = null
          let currentPosition: GeolocationPosition | null = null
          
          // Optimized location update listener with smart filtering
          const watcherId = await BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: "📍 Location Monitor is tracking your location",
              backgroundTitle: "Location Tracking Active", 
              requestPermissions: true,
              stale: false,
              
              // Smart distance filtering based on app state
              distanceFilter: 10,  // 10 meters - good balance for movement detection
              enableHighAccuracy: true
            },
            (location?: { latitude: number; longitude: number; accuracy?: number; altitude?: number; altitudeAccuracy?: number; bearing?: number; speed?: number; time?: number }, error?: { message: string; code?: string }) => {
              if (error) {
                console.error('❌ Background location error:', error)
                setError('Background location error: ' + error.message)
                return
              }

              if (location) {
                console.log('📍 Background location update:', location.latitude, location.longitude)
                console.log('🎯 Location accuracy:', location.accuracy ? `±${Math.round(location.accuracy)}m` : 'Unknown')
                
                // Accept reasonable accuracy (within 20 meters for background)
                const accuracy = location.accuracy || 999
                if (accuracy > 20) {
                  console.warn('⚠️ Location accuracy too low:', `±${Math.round(accuracy)}m - skipping update`)
                  return
                }
                
                lastLocationTime = Date.now()
                
                const position: GeolocationPosition = {
                  coords: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    accuracy: location.accuracy || 0,
                    altitude: location.altitude || undefined,
                    altitudeAccuracy: location.altitudeAccuracy || undefined,
                    heading: location.bearing || undefined,
                    speed: location.speed || undefined
                  },
                  timestamp: location.time || Date.now()
                }
                
                currentPosition = position
                currentLocationRef.current = position
                setPosition(position)
                updateLocationInDB(position)
                retryCountRef.current = 0
              }
            }
          )
          
          // Set up 45-second timer for background location updates (NO MORE HEARTBEAT HERE)
          timerInterval = setInterval(async () => {
            const now = Date.now()
            
            // NOTE: Heartbeat is now handled by native Android service, not JavaScript!
            console.log('⏰ Timer check - native heartbeat service handles staying online')
            
            // If no movement-based update in last 45 seconds, get current position
            if (now - lastLocationTime >= 45000) {
              console.log('⏰ Timer-based location check (background/stationary)')
              try {
                // Get current position using regular geolocation for timer updates
                const position = await geoService.getCurrentPosition()
                if (position) {
                  console.log('🎯 Timer location accuracy:', position.coords.accuracy ? `±${Math.round(position.coords.accuracy)}m` : 'Unknown')
                  
                  // Accept reasonable accuracy for background timer updates (within 30 meters)
                  const accuracy = position.coords.accuracy || 999
                  if (accuracy > 30) {
                    console.warn('⚠️ Timer location accuracy too low:', `±${Math.round(accuracy)}m - using cached position instead`)
                    // Fall through to use cached position
                  } else {
                    currentPosition = position
                    setPosition(position)
                    updateLocationInDB(position)
                    lastLocationTime = now
                    return  // Successfully got accurate position, exit early
                  }
                }
              } catch (error) {
                console.warn('Timer location update failed:', error)
                // If we have a cached position, use it with updated timestamp
                if (currentPosition) {
                  const updatedPosition = {
                    ...currentPosition,
                    timestamp: now
                  }
                  console.log('📍 Using cached position for timer update')
                  setPosition(updatedPosition)
                  updateLocationInDB(updatedPosition)
                  lastLocationTime = now
                }
              }
            }
          }, 45000)  // Check every 45 seconds
          
          console.log('✅ Background geolocation started with watcher ID:', watcherId)
          setLoading(false)
          setIsSharing(true)
          
          // Save tracking state for auto-restart
          await setTrackingState(true, userId)
          
          // THE REAL SOLUTION: Start persistent WebSocket connection 
          console.log('🌐 Starting REAL persistent connection (WebSocket-based)...')
          
          try {
            await RealtimeConnection.startRealtimeConnection({ userId })
            console.log('✅ REAL persistent connection started - THIS ACTUALLY WORKS!')
            console.log('� Your app will now stay online like WhatsApp/Telegram!')
          } catch (error) {
            console.error('❌ Failed to start realtime connection:', error)
            console.log('⚠️ Falling back to old heartbeat method...')
            
            // Fallback to old method if WebSocket fails
            try {
              const status = await HeartbeatService.isHeartbeatActive()
              console.log('💓 Current heartbeat status:', status)
              
              if (!status.isActive) {
                await HeartbeatService.startHeartbeat({ userId })
                console.log('✅ Fallback heartbeat service started')
              }
            } catch (fallbackError) {
              console.error('❌ Even fallback failed:', fallbackError)
            }
          }
          
          return {
            watcherId,
            timerInterval
          }
        } catch (error) {
          console.error('❌ Background geolocation failed:', error)
          setError('Failed to start background location: ' + (error as { message: string }).message)
          throw error
        }
      } else {
        // Web fallback
        console.log('🌐 Using web geolocation fallback...')
        const watchId = await geoService.startWatching((position) => {
          console.log('Location updated:', position.coords.latitude, position.coords.longitude)
          retryCountRef.current = 0
          setLoading(false)
          setPosition(position)
          currentLocationRef.current = position
          updateLocationInDB(position)
        })
        
        console.log('Web watch started with ID:', watchId)
        setIsSharing(true)
        
        // Save tracking state for auto-restart
        await setTrackingState(true, userId)
        
        // For web, we still need a heartbeat timer (web doesn't get suspended like mobile)
        console.log('💓 Starting web heartbeat timer for stationary user detection')
        heartbeatIntervalRef.current = setInterval(() => {
          sendHeartbeat()
        }, 45 * 1000) // Every 45 seconds to match mobile frequency
        
        return watchId
      }
    } catch (error) {
      console.error('❌ Start watching error:', error)
      
      let errorMessage = 'Failed to start location monitoring: '
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as { code: number }).code
        switch (errorCode) {
          case 1:
            errorMessage += 'Permission denied - Please allow location access'
            setPermission('denied')
            break
          case 2:
            errorMessage += 'Position unavailable - GPS signal not available'
            break
          case 3:
            errorMessage += 'Location request timed out'
            break
          default:
            errorMessage += `Unknown error (code: ${errorCode})`
        }
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage += (error as { message: string }).message
      } else {
        errorMessage += 'Please check your location settings and try again.'
      }

      setError(errorMessage)
      setLoading(false)
      return null
    }
  }, [userId, geoService, updateLocationInDB, setTrackingState, sendHeartbeat])

  const stopWatching = useCallback(async (watchResult: string | { watcherId: string; timerInterval: NodeJS.Timeout } | null, markOffline: boolean = false) => {
    console.log('🛑 Stopping location tracking...')
    
    try {
      if (Capacitor.isNativePlatform()) {
        console.log('📱 Stopping background geolocation...')
        try {
          const { registerPlugin } = await import('@capacitor/core')
          interface BackgroundGeolocationPlugin {
            removeWatcher(options: { id: string }): Promise<void>;
          }
          const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')
          
          if (watchResult) {
            if (typeof watchResult === 'string') {
              await BackgroundGeolocation.removeWatcher({ id: watchResult })
              console.log('✅ Background geolocation watcher removed:', watchResult)
            } else {
              await BackgroundGeolocation.removeWatcher({ id: watchResult.watcherId })
              console.log('✅ Background geolocation watcher removed:', watchResult.watcherId)
              
              if (watchResult.timerInterval) {
                clearInterval(watchResult.timerInterval)
                console.log('✅ Timer interval cleared')
              }
            }
          }
        } catch (error) {
          console.warn('Background geolocation stop failed:', error)
        }
        setIsSharing(false)
      } else {
        console.log('🌐 Stopping web geolocation tracking...')
        await geoService.stopWatching()
        console.log('✅ Web location tracking stopped')
        setIsSharing(false)
      }

      // Clear heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
        console.log('✅ Heartbeat interval cleared')
      }

      // Stop the REAL persistent connection
      if (Capacitor.isNativePlatform()) {
        try {
          await RealtimeConnection.stopRealtimeConnection()
          console.log('✅ REAL persistent connection stopped')
        } catch (error) {
          console.error('❌ Failed to stop realtime connection:', error)
          
          // Try stopping old heartbeat service as fallback
          try {
            await HeartbeatService.stopHeartbeat()
            console.log('✅ Fallback heartbeat service stopped')
          } catch (fallbackError) {
            console.error('❌ Failed to stop heartbeat service:', fallbackError)
          }
        }
      }

      // Save stopped tracking state (but don't disable auto-restart unless explicitly marked offline)
      if (!markOffline) {
        await setTrackingState(false, userId || undefined)
      } else {
        // Disable auto-restart when explicitly going offline
        await setTrackingState(false, userId || undefined)
        if (Capacitor.isNativePlatform()) {
          try {
            const { Preferences } = await import('@capacitor/preferences')
            await Preferences.set({ key: 'should_auto_restart', value: 'false' })
          } catch (error) {
            console.error('Failed to disable auto-restart:', error)
          }
        }
      }

      if (markOffline) {
        await markUserOffline()
        console.log('🔴 User marked offline in database')
      }
    } catch (error) {
      console.error('❌ Error stopping location watch:', error)
    }
  }, [geoService, markUserOffline])

  const handleUserLoggedOut = useCallback(async () => {
    if (Capacitor.isNativePlatform() && !userId && isSharing) {
      console.log('👤 User not logged in - stopping any background tracking...')
      setIsSharing(false)
      return
    }
  }, [isSharing, userId])

  const requestPermission = useCallback(async () => {
    try {
      const granted = (await geoService.requestPermissions()).granted
      setPermission(granted ? 'granted' : 'denied')
      return granted
    } catch (error) {
      console.error('Error requesting permissions:', error)
      setPermission('denied')
      return false
    }
  }, [geoService])

  // Check permissions on mount and auto-restart if needed
  useEffect(() => {
    checkPermission()
    checkAutoRestart()
  }, [checkPermission, checkAutoRestart])

  // Network connection monitoring
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Network connection restored')
      setIsOnline(true)
      // Resume location sharing if user was sharing before going offline
      if (isSharing && userId) {
        console.log('📡 Resuming location sharing after connection restored')
        // The existing location watching will automatically resume database updates
      }
    }

    const handleOffline = () => {
      console.log('📡 Network connection lost - location updates will be queued')
      setIsOnline(false)
      // Don't mark user as offline in database yet - just stop updates
      // GPS continues running in background, we'll resume updates when online
    }

    // Set initial state
    setIsOnline(navigator.onLine)

    // Listen for network changes
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isSharing, userId])

  // Handle user logout cleanup
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      handleUserLoggedOut()
    }
  }, [handleUserLoggedOut, userId])

  // Check for auto-restart when user logs in
  useEffect(() => {
    if (userId && Capacitor.isNativePlatform()) {
      console.log('👤 User logged in, checking for auto-restart...')
      setTimeout(() => {
        checkAutoRestart()
      }, 1000) // Small delay to ensure component is fully mounted
    }
  }, [userId, checkAutoRestart])

  return {
    position,
    error,
    loading,
    permission,
    isSharing,
    isOnline,
    getCurrentPosition,
    startWatching,
    stopWatching,
    requestPermission,
    markUserOffline,
    checkAutoRestart,
    setTrackingState,
    cleanup: useCallback(async () => {
      console.log('🧹 Cleaning up location tracking on logout...')
      try {
        if (Capacitor.isNativePlatform()) {
          console.log('📱 Background geolocation will stop when app closes')
        } else {
          await geoService.stopWatching()
        }
        
        // Clear heartbeat interval
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current)
          heartbeatIntervalRef.current = null
          console.log('✅ Heartbeat interval cleared during cleanup')
        }
        
        // Mark user offline when cleaning up
        if (userId) {
          console.log('🔴 Marking user offline during cleanup...')
          await markUserOffline()
        }
        
        setIsSharing(false)
        setPosition(null)
        setError(null)
        console.log('✅ Location tracking cleanup completed')
      } catch (error) {
        console.error('❌ Cleanup error:', error)
      }
    }, [geoService, userId, markUserOffline])
  }
}
