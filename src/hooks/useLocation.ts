'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GeolocationPosition } from '@/types'

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
  
  // Use ref for retry count to avoid triggering re-renders
  const retryCountRef = useRef(0)
  const lastUpdateRef = useRef(0)
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)
  const updateThrottle = 5000 // Only update database every 5 seconds
  
  const supabase = createClient()
  
  const {
    enableHighAccuracy = false, // Changed to false to reduce battery usage and frequency
    timeout = 30000, // 30 seconds timeout
    maximumAge = 120000, // Increased to 2 minutes to use cached positions longer
    onLocationUpdate
  } = options

  const checkPermission = useCallback(async () => {
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' })
        setPermission(result.state)
        
        result.addEventListener('change', () => {
          setPermission(result.state)
        })
      } catch {
        console.warn('Could not query geolocation permission')
      }
    }
  }, [])

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
      // Use UPSERT (INSERT ... ON CONFLICT DO UPDATE) for efficiency
      // This will either insert a new record or update existing one
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
          onConflict: 'user_id',
          ignoreDuplicates: false
        })

      if (error) {
        console.error('❌ Error updating location:', error)
        
        // Fallback: try the old method if upsert fails
        console.log('🔄 Fallback: Using update/insert method...')
        
        // First try to update existing record
        const { data: updateData, error: updateError } = await supabase
          .from('user_locations')
          .update({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: new Date().toISOString(),
            is_active: true
          })
          .eq('user_id', userId)
          .eq('is_active', true)
          .select()

        if (updateError || !updateData || updateData.length === 0) {
          // No existing active record, create new one but limit total records
          console.log('🆕 Creating new location record...')
          
          // First, mark old records as inactive (keep only last 10 records per user)
          await supabase
            .from('user_locations')
            .update({ is_active: false })
            .eq('user_id', userId)

          // Insert new record
          await supabase
            .from('user_locations')
            .insert({
              user_id: userId,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: new Date().toISOString(),
              is_active: true
            })
        }
      } else {
        console.log('✅ Location updated successfully using UPSERT')
      }

      // Notify parent component that location was updated
      if (onLocationUpdate) {
        onLocationUpdate()
      }
    } catch (err) {
      console.error('Failed to update location in database:', err)
    }
  }, [userId, supabase, onLocationUpdate])

  // Mark user as offline when they accidentally close the app (keep on map)
  const markUserOffline = useCallback(async () => {
    if (!userId) return
    
    console.log('🔴 Marking user offline (accidental disconnect):', userId)
    try {
      await supabase
        .from('user_locations')
        .update({ 
          is_active: false, // Keep record but mark as offline
          timestamp: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('is_active', true)
    } catch (err) {
      console.error('Failed to mark user offline:', err)
    }
  }, [userId, supabase])

  // Remove user completely when they intentionally turn off location or logout
  const removeUserFromMap = useCallback(async () => {
    if (!userId) return
    
    console.log('🗑️ Removing user from map (intentional disconnect):', userId)
    try {
      await supabase
        .from('user_locations')
        .delete()
        .eq('user_id', userId)
    } catch (err) {
      console.error('Failed to remove user from map:', err)
    }
  }, [userId, supabase])

  // Heartbeat to keep user active
  const startHeartbeat = useCallback(() => {
    if (!userId) return
    
    console.log('💗 Starting heartbeat for user:', userId)
    
    // Clear existing heartbeat
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
    }
    
    // Send heartbeat every 30 seconds to keep user active
    heartbeatRef.current = setInterval(async () => {
      try {
        await supabase
          .from('user_locations')
          .update({ 
            timestamp: new Date().toISOString(),
            is_active: true
          })
          .eq('user_id', userId)
          .eq('is_active', true)
        
        console.log('💗 Heartbeat sent for user:', userId)
      } catch (err) {
        console.error('Heartbeat failed:', err)
      }
    }, 30000) // 30 seconds
  }, [userId, supabase])

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
      console.log('💔 Heartbeat stopped')
    }
  }, [])

  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser')
      return
    }

    setLoading(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const position: GeolocationPosition = {
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude ?? undefined,
            altitudeAccuracy: pos.coords.altitudeAccuracy ?? undefined,
            heading: pos.coords.heading ?? undefined,
            speed: pos.coords.speed ?? undefined
          },
          timestamp: pos.timestamp
        }
        
        setPosition(position)
        updateLocationInDB(position, true) // Force update for manual getCurrentPosition
        setLoading(false)
      },
      (err) => {
        console.error('getCurrentPosition error:', err)
        console.error('Error details:', {
          code: err?.code,
          message: err?.message,
          type: typeof err,
          keys: Object.keys(err || {}),
          fullError: JSON.stringify(err)
        })
        
        let errorMessage = 'An error occurred while retrieving location'
        
        // Handle empty error objects or malformed errors
        if (!err || (typeof err === 'object' && Object.keys(err).length === 0)) {
          errorMessage = 'Browser location service temporarily unavailable. Please check your location settings and try again.'
          console.warn('Received empty/malformed error object from getCurrentPosition API')
          setError(errorMessage)
          setLoading(false)
          return
        }
        
        if (err && typeof err.code === 'number') {
          switch (err.code) {
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
              errorMessage = `Unknown location error (code: ${err.code})`
          }
        } else {
          errorMessage = 'Browser location service error. Please check your location settings and try again.'
          console.warn('Received malformed error object from getCurrentPosition')
        }
        
        setError(errorMessage)
        setLoading(false)
      },
      {
        enableHighAccuracy,
        timeout,
        maximumAge
      }
    )
  }, [enableHighAccuracy, timeout, maximumAge, updateLocationInDB])

  const startWatching = useCallback(() => {
    if (!navigator.geolocation || !userId) {
      console.warn('Geolocation not available or no userId')
      return null
    }

    console.log('Starting location watching for user:', userId)
    setError(null) // Clear any previous errors
    setLoading(true)
    
    // Start heartbeat to keep user active
    startHeartbeat()

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        console.log('Location updated:', pos.coords.latitude, pos.coords.longitude)
        retryCountRef.current = 0 // Reset retry count on success
        setLoading(false)
        
        const position: GeolocationPosition = {
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude ?? undefined,
            altitudeAccuracy: pos.coords.altitudeAccuracy ?? undefined,
            heading: pos.coords.heading ?? undefined,
            speed: pos.coords.speed ?? undefined
          },
          timestamp: pos.timestamp
        }
        
        setPosition(position)
        updateLocationInDB(position) // Throttled updates for continuous watching
      },
      (err) => {
        console.error('Watch position error:', err)
        console.error('Error details:', {
          code: err?.code,
          message: err?.message,
          type: typeof err,
          keys: Object.keys(err || {}),
          fullError: JSON.stringify(err)
        })
        
        let errorMessage = 'Location error: '
        
        // Handle empty error objects or malformed errors
        if (!err || (typeof err === 'object' && Object.keys(err).length === 0)) {
          console.warn('Received empty/malformed error object from geolocation API')
          
          // Try to retry a few times for empty errors
          if (retryCountRef.current < 2) {
            console.log(`Retrying location watch (attempt ${retryCountRef.current + 1}/2)...`)
            retryCountRef.current += 1
            setTimeout(() => {
              // Just log the retry, don't create infinite recursion
              console.log('Location service retry scheduled')
            }, 2000 * retryCountRef.current)
            return
          }
          
          errorMessage = 'Browser location service temporarily unavailable after multiple attempts. This may be due to:'
          setError(errorMessage + '\n• Poor GPS signal\n• Browser location service issues\n• Network connectivity problems\nTry refreshing the page or check your location settings.')
          setLoading(false)
          retryCountRef.current = 0 // Reset retry count
          return
        }
        
        // Check if err has the expected properties
        if (err && typeof err.code === 'number') {
          switch (err.code) {
            case 1: // PERMISSION_DENIED
              errorMessage += 'Permission denied - Please allow location access in your browser'
              setPermission('denied')
              break
            case 2: // POSITION_UNAVAILABLE
              errorMessage += 'Position unavailable - GPS signal not available'
              break
            case 3: // TIMEOUT
              errorMessage += 'Location request timed out - Try again or check GPS signal'
              break
            default:
              errorMessage += `Unknown error (code: ${err.code})`
          }
        } else if (err && err.message) {
          errorMessage += err.message
        } else {
          // Fallback for any other malformed error
          errorMessage += 'Browser location service error. Please check your location settings and try again.'
        }
        
        setError(errorMessage)
        setLoading(false)
      },
      {
        enableHighAccuracy,
        timeout,
        maximumAge
      }
    )

    console.log('Watch started with ID:', watchId)
    return watchId
  }, [userId, enableHighAccuracy, timeout, maximumAge, updateLocationInDB, startHeartbeat])

  const stopWatching = useCallback((watchId: number, intentional: boolean = false) => {
    if (navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId)
    }
    // Stop heartbeat when watching stops
    stopHeartbeat()
    
    // If it's intentional (user clicked stop or logout), remove from map
    if (intentional) {
      removeUserFromMap()
    } else {
      // If accidental (error, etc.), just mark offline
      markUserOffline()
    }
  }, [stopHeartbeat, removeUserFromMap, markUserOffline])

  const requestPermission = useCallback(async () => {
    return new Promise<boolean>((resolve) => {
      if (!navigator.geolocation) {
        resolve(false)
        return
      }

      navigator.geolocation.getCurrentPosition(
        () => {
          setPermission('granted')
          resolve(true)
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setPermission('denied')
          }
          resolve(false)
        },
        { timeout: 5000 }
      )
    })
  }, [])

  useEffect(() => {
    checkPermission()
  }, [checkPermission])

  // Add beforeunload event to mark user offline when closing app
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable last-second requests
      if (userId && navigator.sendBeacon) {
        const data = JSON.stringify({
          user_id: userId,
          is_active: false,
          timestamp: new Date().toISOString()
        })
        
        // Try to send offline status using sendBeacon (more reliable for page unload)
        navigator.sendBeacon('/api/mark-offline', data)
      }
      
      // Also try the regular method as fallback
      markUserOffline()
      stopHeartbeat()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('unload', handleBeforeUnload)
    
    // Also handle when the page loses focus (user switches tabs/apps)
    const handleVisibilityChange = () => {
      if (document.hidden && userId) {
        console.log('🔴 Page hidden, marking user offline and stopping heartbeat')
        markUserOffline()
        stopHeartbeat()
      } else if (!document.hidden && userId) {
        console.log('🟢 Page visible, starting heartbeat')
        startHeartbeat()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('unload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopHeartbeat() // Clean up heartbeat on unmount
    }
  }, [userId, markUserOffline, stopHeartbeat, startHeartbeat])

  return {
    position,
    error,
    loading,
    permission,
    getCurrentPosition,
    startWatching,
    stopWatching,
    requestPermission,
    removeUserFromMap // Export for logout functionality
  }
}
