'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GeolocationPosition } from '@/types'
import { Capacitor } from '@capacitor/core'
import { NativeGeolocationService } from '@/lib/native-geolocation'

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
  
  // Use ref for retry count to avoid triggering re-renders
  const retryCountRef = useRef(0)
  const lastUpdateRef = useRef(0)
  const updateThrottle = 5000 // Allow database updates every 5 seconds to match GPS interval
  
  const supabase = createClient()
  
  // Memoize the geolocation service to avoid re-creation on every render
  const geoService = useMemo(() => new NativeGeolocationService(), [])
  
  const {
    onLocationUpdate
  } = options

  const checkPermission = useCallback(async () => {
    try {
      const result = await geoService.requestPermissions()
      setPermission(result.granted ? 'granted' : 'denied')
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

    // Throttle updates: only update database every 5 seconds unless forced
    const now = Date.now()
    if (!force && (now - lastUpdateRef.current) < updateThrottle) {
      console.log('⏱️ Location update throttled, skipping database write')
      return
    }
    
    lastUpdateRef.current = now

    console.log('🌍 Updating location in DB for user:', userId)
    console.log('📍 Position:', pos.coords.latitude, pos.coords.longitude)
    console.log('🎯 Accuracy:', pos.coords.accuracy ? `±${Math.round(pos.coords.accuracy)}m` : 'Unknown')

    try {
      // UPSERT approach: Single record per user - insert if doesn't exist, update if exists
      console.log('🔄 Upserting location record (single record per user)...')
      
      const { error: upsertError } = await supabase
        .from('user_locations')
        .upsert({
          user_id: userId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date().toISOString(),
          is_active: true
        }, {
          onConflict: 'user_id' // Update existing record for this user_id
        })

      if (upsertError) {
        console.error('❌ Error upserting location:', upsertError)
        console.error('❌ Upsert error details:', {
          message: upsertError.message,
          code: upsertError.code,
          details: upsertError.details,
          hint: upsertError.hint
        })
        throw upsertError
      }

      console.log('✅ Location record upserted successfully (single record per user)')

      // Verify the record was updated/created properly
      console.log('🔍 Verifying location record...')
      const { data: verification, error: verifyError } = await supabase
        .from('user_locations')
        .select('id, is_active, timestamp')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (verifyError) {
        console.error('❌ Error verifying location record:', verifyError)
      } else if (verification) {
        console.log('✅ Verification successful - Active record found:', {
          id: verification.id,
          is_active: verification.is_active,
          timestamp: verification.timestamp
        })
      } else {
        console.error('❌ Verification failed - No active record found!')
      }

      // Notify parent component that location was updated
      if (onLocationUpdate) {
        onLocationUpdate()
      }
    } catch (err: unknown) {
      console.error('Failed to update location in database:', err)
      const errorObj = err as { message?: string, code?: string, details?: unknown, hint?: string }
      console.error('Error details:', {
        message: errorObj?.message,
        code: errorObj?.code,
        details: errorObj?.details,
        hint: errorObj?.hint,
        userId,
        coords: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }
      })
      
      // Don't throw error, just log it - we don't want to break the location tracking
      // The UI will still show the position even if database update fails
    }
  }, [userId, supabase, onLocationUpdate])

  // Simple mark user as offline when they close the app
  const markUserOffline = useCallback(async () => {
    if (!userId) return
    
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
    } catch (err) {
      console.error('Failed to mark user offline:', err)
    }
  }, [userId, supabase])

  const getCurrentPosition = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const pos = await geoService.getCurrentPosition()
      
      if (pos) {
        setPosition(pos)
        updateLocationInDB(pos, true) // Force update for manual getCurrentPosition
      } else {
        setError('Unable to get current position')
      }
      setLoading(false)
    } catch (err: unknown) {
      console.error('getCurrentPosition error:', err)
      
      let errorMessage = 'An error occurred while retrieving location'
      
      if (err && typeof err === 'object' && 'code' in err) {
        const errorCode = (err as { code?: number }).code
        switch (errorCode) {
          case 1: // PERMISSION_DENIED
            errorMessage = 'Location access denied by user'
            setPermission('denied')
            break
          case 2: // POSITION_UNAVAILABLE
            errorMessage = 'Location information is unavailable'
            break
          case 3: // TIMEOUT
            errorMessage = 'Location request timed out'
            break
          default:
            errorMessage = `Unknown location error (code: ${errorCode})`
        }
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = (err as { message: string }).message
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
    setError(null) // Clear any previous errors
    setLoading(true)

    try {
      if (Capacitor.isNativePlatform()) {
        console.log('📱 Starting background geolocation with notification...')
        
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
          
          // Add location update listener with notification - DISTANCE-BASED + TIMER-BASED HYBRID
          const watcherId = await BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: "📍 Location Monitor is tracking your location",
              backgroundTitle: "Location Tracking Active", 
              requestPermissions: true,
              stale: false,
              distanceFilter: 3,  // Reduced to 3 meters for higher sensitivity to movement
              enableHighAccuracy: true  // Force high accuracy GPS mode
            },
            (location?: { latitude: number; longitude: number; accuracy?: number; altitude?: number; altitudeAccuracy?: number; bearing?: number; speed?: number; time?: number }, error?: { message: string; code?: string }) => {
              if (error) {
                console.error('❌ Background location error:', error)
                setError('Background location error: ' + error.message)
                return
              }

              if (location) {
                console.log('📍 Background location update (movement-based):', location.latitude, location.longitude)
                console.log('🎯 Location accuracy:', location.accuracy ? `±${Math.round(location.accuracy)}m` : 'Unknown')
                
                // Only process locations with reasonable accuracy (within 50 meters)
                const accuracy = location.accuracy || 999
                if (accuracy > 50) {
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
                setPosition(position)
                updateLocationInDB(position)
                retryCountRef.current = 0
              }
            }
          )
          
          // Set up 5-second timer for stationary updates
          timerInterval = setInterval(async () => {
            const now = Date.now()
            // If no movement-based update in last 5 seconds, get current position
            if (now - lastLocationTime >= 5000) {
              console.log('⏰ Timer-based location update (stationary)')
              try {
                // Get current position using regular geolocation for timer updates
                const position = await geoService.getCurrentPosition()
                if (position) {
                  console.log('🎯 Timer location accuracy:', position.coords.accuracy ? `±${Math.round(position.coords.accuracy)}m` : 'Unknown')
                  
                  // Only process locations with reasonable accuracy (within 50 meters)
                  const accuracy = position.coords.accuracy || 999
                  if (accuracy > 50) {
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
          }, 5000) // Every 5 seconds
          
          console.log('✅ Background geolocation started with watcher ID:', watcherId)
          setLoading(false)
          setIsSharing(true)
          
          // Store timer reference for cleanup
          return { watcherId, timerInterval }
        } catch (serviceError) {
          console.error('❌ Background geolocation failed:', serviceError)
          setError('Failed to start background location: ' + (serviceError as Error).message)
          throw serviceError
        }
      } else {
        console.log('🌐 Using web geolocation fallback...')
        
        const watchId = await geoService.startWatching((position: GeolocationPosition) => {
          console.log('Location updated:', position.coords.latitude, position.coords.longitude)
          retryCountRef.current = 0 // Reset retry count on success
          setLoading(false)
          setPosition(position)
          updateLocationInDB(position) // Throttled updates for continuous watching
        })

        console.log('Web watch started with ID:', watchId)
        setIsSharing(true)
        return watchId
      }
    } catch (err: unknown) {
      console.error('❌ Start watching error:', err)
      
      let errorMessage = 'Failed to start location monitoring: '
      
      if (err && typeof err === 'object' && 'code' in err) {
        const errorCode = (err as { code?: number }).code
        switch (errorCode) {
          case 1: // PERMISSION_DENIED
            errorMessage += 'Permission denied - Please allow location access'
            setPermission('denied')
            break
          case 2: // POSITION_UNAVAILABLE
            errorMessage += 'Position unavailable - GPS signal not available'
            break
          case 3: // TIMEOUT
            errorMessage += 'Location request timed out'
            break
          default:
            errorMessage += `Unknown error (code: ${errorCode})`
        }
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage += (err as { message: string }).message
      } else {
        errorMessage += 'Please check your location settings and try again.'
      }
      
      setError(errorMessage)
      setLoading(false)
      return null
    }
  }, [userId, geoService, updateLocationInDB])

  const stopWatching = useCallback(async (watcherData?: { watcherId: string; timerInterval: NodeJS.Timeout } | string | null, shouldGoOffline = false) => {
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
          
          // Handle both old string format and new object format
          if (watcherData) {
            if (typeof watcherData === 'string') {
              // Legacy format - just the watcher ID
              await BackgroundGeolocation.removeWatcher({ id: watcherData })
              console.log('✅ Background geolocation watcher removed:', watcherData)
            } else {
              // New format with timer
              await BackgroundGeolocation.removeWatcher({ id: watcherData.watcherId })
              console.log('✅ Background geolocation watcher removed:', watcherData.watcherId)
              
              if (watcherData.timerInterval) {
                clearInterval(watcherData.timerInterval)
                console.log('✅ Timer interval cleared')
              }
            }
          }
        } catch (serviceError) {
          console.warn('Background geolocation stop failed:', serviceError)
        }
        
        setIsSharing(false)
      } else {
        console.log('🌐 Stopping web geolocation tracking...')
        await geoService.stopWatching()
        console.log('✅ Web location tracking stopped')
        setIsSharing(false)
      }

      // Mark user as offline if requested (for stop button vs sign out)
      if (shouldGoOffline) {
        await markUserOffline()
        console.log('🔴 User marked offline in database')
      }
    } catch (error) {
      console.error('❌ Error stopping location watch:', error)
    }
  }, [geoService, markUserOffline])

  const checkSharingState = useCallback(async () => {
    // For native platforms, we'll rely on the component state since 
    // background geolocation doesn't provide a state check API
    if (!Capacitor.isNativePlatform()) {
      return
    }

    // Don't run background tracking if user is not logged in
    if (!userId && isSharing) {
      console.log('👤 User not logged in - stopping any background tracking...')
      setIsSharing(false)
      return
    }
  }, [isSharing, userId])

  const requestPermission = useCallback(async () => {
    try {
      const result = await geoService.requestPermissions()
      const granted = result.granted
      setPermission(granted ? 'granted' : 'denied')
      return granted
    } catch (error) {
      console.error('Error requesting permissions:', error)
      setPermission('denied')
      return false
    }
  }, [geoService])

  useEffect(() => {
    checkPermission()
  }, [checkPermission])

  // Simple effect to ensure no unauthorized background tracking
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    // Cleanup any old MediaStyle services on mount
    const cleanupOldServices = async () => {
      try {
        const LocationServiceBridge = (await import('@/lib/location-service-bridge')).default
        await LocationServiceBridge.stopLocationService()
        console.log('🧹 Stopped any existing MediaStyle location service')
      } catch (error) {
        console.log('ℹ️ No existing MediaStyle service to stop')
      }
    }

    cleanupOldServices()

    // Check once on mount and when userId changes
    checkSharingState()
  }, [checkSharingState, userId])

  return {
    position,
    error,
    loading,
    permission,
    isSharing,
    getCurrentPosition,
    startWatching,
    stopWatching,
    requestPermission,
    markUserOffline,
    // Add cleanup method for logout
    cleanup: useCallback(async () => {
      console.log('🧹 Cleaning up location tracking on logout...')
      try {
        if (Capacitor.isNativePlatform()) {
          // Note: We can't stop individual watchers without their IDs
          // The background geolocation will stop when the app is closed
          console.log('📱 Background geolocation will stop when app closes')
        } else {
          await geoService.stopWatching()
        }
        
        setIsSharing(false)
        setPosition(null)
        setError(null)
        console.log('✅ Location tracking cleanup completed')
      } catch (error) {
        console.error('❌ Cleanup error:', error)
      }
    }, [geoService])
  }
}
