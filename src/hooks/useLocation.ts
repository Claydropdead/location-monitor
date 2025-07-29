'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GeolocationPosition } from '@/types'
import { Capacitor } from '@capacitor/core'
import { backgroundGeolocation } from '@/lib/background-geolocation'
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
  const updateThrottle = 5000 // Only update database every 5 seconds
  
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

    console.log('🚀 Starting location watching for user:', userId)
    setError(null) // Clear any previous errors
    setLoading(true)

    try {
      if (Capacitor.isNativePlatform()) {
        console.log('📱 Starting MediaStyle notification service + Background Geolocation...')
        
        try {
          // First start the MediaStyle notification service
          const LocationServiceBridge = (await import('@/lib/location-service-bridge')).default
          const serviceResult = await LocationServiceBridge.startLocationService()
          console.log('✅ MediaStyle notification service started:', serviceResult.message)
        } catch (serviceError) {
          console.warn('MediaStyle service failed, trying Background Geolocation only:', serviceError)
        }
        
        // Then start background geolocation for reliable tracking
        await backgroundGeolocation.initialize()
        await backgroundGeolocation.startTracking()
        
        console.log('✅ Background location tracking started - will continue even when app is minimized')
        setLoading(false)
        setIsSharing(true)
        return 'background-geolocation-active'
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

  const stopWatching = useCallback(async (watchId?: string | null) => {
    console.log('🛑 Stopping location tracking...')
    
    try {
      if (Capacitor.isNativePlatform()) {
        console.log('📱 Stopping MediaStyle notification service + Background Geolocation...')
        
        // Stop background geolocation
        await backgroundGeolocation.stopTracking()
        console.log('✅ Background location tracking stopped')
        
        try {
          // Stop the MediaStyle notification service
          const LocationServiceBridge = (await import('@/lib/location-service-bridge')).default
          const serviceResult = await LocationServiceBridge.stopLocationService()
          console.log('✅ MediaStyle notification service stopped:', serviceResult.message)
        } catch (serviceError) {
          console.warn('MediaStyle service stop failed:', serviceError)
        }
        
        setIsSharing(false)
      } else {
        console.log('🌐 Stopping web geolocation tracking...')
        await geoService.stopWatching()
        console.log('✅ Web location tracking stopped')
      }
    } catch (error) {
      console.error('❌ Error stopping location watch:', error)
    }
  }, [geoService])

  const checkSharingState = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    // Don't check sharing state if user is not logged in
    if (!userId) {
      console.log('👤 User not logged in - stopping any background tracking...')
      
      try {
        // Stop any background services that might be running
        const { backgroundGeolocation } = await import('@/lib/background-geolocation')
        await backgroundGeolocation.stopTracking()
        
        try {
          const LocationServiceBridge = (await import('@/lib/location-service-bridge')).default
          await LocationServiceBridge.stopLocationService()
        } catch (serviceError) {
          console.warn('MediaStyle service stop failed:', serviceError)
        }
        
        setIsSharing(false)
        console.log('✅ Background services stopped - user not authenticated')
      } catch (error) {
        console.warn('Error stopping background services:', error)
      }
      return
    }

    try {
      // Check both MediaStyle service and Background Geolocation status
      const LocationServiceBridge = (await import('@/lib/location-service-bridge')).default
      const serviceResult = await LocationServiceBridge.isLocationSharing()
      
      // Check if Background Geolocation is active
      const { backgroundGeolocation } = await import('@/lib/background-geolocation')
      const isBackgroundActive = await backgroundGeolocation.isCurrentlyTracking()
      
      console.log('📊 Detailed sharing state check:')
      console.log('  MediaStyle service isSharing:', serviceResult.isSharing)
      console.log('  MediaStyle service serviceRunning:', serviceResult.serviceRunning)
      console.log('  Background Geolocation active:', isBackgroundActive)
      console.log('  Current UI state (isSharing):', isSharing)
      console.log('  User authenticated:', !!userId)
      
      // CRITICAL FIX: If MediaStyle service is paused but Background Geolocation is still running,
      // immediately stop Background Geolocation to sync the systems
      if (!serviceResult.isSharing && isBackgroundActive) {
        console.log('🚨 SYNC ISSUE DETECTED: MediaStyle paused but Background Geolocation still active')
        console.log('🔄 FORCING Background Geolocation to stop...')
        
        try {
          await backgroundGeolocation.stopTracking()
          console.log('✅ Background Geolocation FORCE STOPPED successfully')
          
        } catch (stopError) {
          console.error('❌ Failed to force stop Background Geolocation:', stopError)
          
          // Emergency stop as last resort
          try {
            await backgroundGeolocation.emergencyStop()
            console.log('✅ Emergency stop completed')
          } catch (emergencyError) {
            console.error('❌ Emergency stop also failed:', emergencyError)
          }
        }
        
        // Additional safety check - verify it actually stopped
        setTimeout(async () => {
          try {
            const isStillActive = await backgroundGeolocation.isCurrentlyTracking()
            if (isStillActive) {
              console.error('🚨 CRITICAL: Background Geolocation still active after stop attempt!')
              // Force additional stop attempts
              await backgroundGeolocation.stopTracking()
            } else {
              console.log('✅ Confirmed: Background Geolocation successfully stopped')
            }
          } catch (checkError) {
            console.warn('Could not verify stop status:', checkError)
          }
        }, 1000)
        
        setIsSharing(false)
        console.log('✅ UI updated to show STOPPED')
        return
      }
      
      // If MediaStyle service is active but Background Geolocation is stopped,
      // start Background Geolocation to sync the systems  
      if (serviceResult.isSharing && !isBackgroundActive) {
        console.log('🔄 MediaStyle active but Background Geolocation stopped - starting Background Geolocation...')
        
        try {
          await backgroundGeolocation.startTracking()
          console.log('✅ Background Geolocation started successfully')
        } catch (startError) {
          console.error('❌ Failed to start Background Geolocation:', startError)
        }
        
        setIsSharing(true)
        console.log('✅ UI updated to show SHARING')
        return
      }
      
      // Both systems are in sync - use MediaStyle service state as primary
      const newSharingState = serviceResult.isSharing
      if (newSharingState !== isSharing) {
        console.log(`🔄 Updating UI state from ${isSharing} to ${newSharingState}`)
        setIsSharing(newSharingState)
      }
      
    } catch (error) {
      console.error('❌ Failed to check sharing state:', error)
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

  // Poll sharing state every 1 second to sync with notification controls (more aggressive)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    // Initial cleanup on mount - stop any leftover background services
    const initialCleanup = async () => {
      if (!userId) {
        console.log('🧹 Initial cleanup: No user logged in, stopping any background services...')
        try {
          const { backgroundGeolocation } = await import('@/lib/background-geolocation')
          await backgroundGeolocation.stopTracking()
          
          try {
            const LocationServiceBridge = (await import('@/lib/location-service-bridge')).default
            await LocationServiceBridge.stopLocationService()
          } catch (serviceError) {
            console.warn('Initial cleanup: MediaStyle service stop failed:', serviceError)
          }
          
          setIsSharing(false)
          console.log('✅ Initial cleanup completed - no unauthorized background tracking')
        } catch (error) {
          console.warn('Initial cleanup error:', error)
        }
      }
    }

    initialCleanup()

    const pollInterval = setInterval(() => {
      checkSharingState()
    }, 1000) // Changed from 2000ms to 1000ms for faster detection

    // Check immediately on mount
    checkSharingState()

    return () => clearInterval(pollInterval)
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
    // Add cleanup method for logout
    cleanup: useCallback(async () => {
      console.log('🧹 Cleaning up location tracking on logout...')
      try {
        if (Capacitor.isNativePlatform()) {
          const { backgroundGeolocation } = await import('@/lib/background-geolocation')
          await backgroundGeolocation.stopTracking()
          
          try {
            const LocationServiceBridge = (await import('@/lib/location-service-bridge')).default
            await LocationServiceBridge.stopLocationService()
          } catch (serviceError) {
            console.warn('Cleanup: MediaStyle service stop failed:', serviceError)
          }
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
