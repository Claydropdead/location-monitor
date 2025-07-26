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
    } catch (err: any) {
      console.error('Failed to update location in database:', err)
      console.error('Error details:', {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
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
  }, [userId, enableHighAccuracy, timeout, maximumAge, updateLocationInDB])

  const stopWatching = useCallback((watchId: number) => {
    if (navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

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

  return {
    position,
    error,
    loading,
    permission,
    getCurrentPosition,
    startWatching,
    stopWatching,
    requestPermission
  }
}
