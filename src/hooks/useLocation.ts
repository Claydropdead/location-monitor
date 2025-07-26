'use client'

import { useEffect, useState, useCallback } from 'react'
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
  const [retryCount, setRetryCount] = useState(0)
  
  const supabase = createClient()
  
  const {
    enableHighAccuracy = true,
    timeout = 30000, // Increased to 30 seconds to reduce timeout errors
    maximumAge = 60000, // Increased to 60 seconds to allow cached positions
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

  const updateLocationInDB = useCallback(async (pos: GeolocationPosition) => {
    if (!userId) {
      console.warn('No userId provided for location update')
      return
    }

    console.log('🌍 Updating location in DB for user:', userId)
    console.log('📍 Position:', pos.coords.latitude, pos.coords.longitude)

    try {
      // First, mark all previous locations as inactive
      const { error: updateError } = await supabase
        .from('user_locations')
        .update({ is_active: false })
        .eq('user_id', userId)

      if (updateError) {
        console.error('Error marking previous locations inactive:', updateError)
      }

      // Insert new location with immediate timestamp
      const { error } = await supabase
        .from('user_locations')
        .insert({
          user_id: userId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date().toISOString(), // Use current time for faster updates
          is_active: true
        })

      if (error) {
        console.error('❌ Error updating location:', error)
      } else {
        console.log('✅ Location updated successfully - Real-time update should trigger now')
        // Notify parent component that location was updated
        if (onLocationUpdate) {
          onLocationUpdate()
        }
      }
    } catch (err) {
      console.error('Failed to update location in database:', err)
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
        updateLocationInDB(position)
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
        setRetryCount(0) // Reset retry count on success
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
        updateLocationInDB(position)
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
          if (retryCount < 2) {
            console.log(`Retrying location watch (attempt ${retryCount + 1}/2)...`)
            setRetryCount(prev => prev + 1)
            setTimeout(() => {
              // Just log the retry, don't create infinite recursion
              console.log('Location service retry scheduled')
            }, 2000 * (retryCount + 1))
            return
          }
          
          errorMessage = 'Browser location service temporarily unavailable after multiple attempts. This may be due to:'
          setError(errorMessage + '\n• Poor GPS signal\n• Browser location service issues\n• Network connectivity problems\nTry refreshing the page or check your location settings.')
          setLoading(false)
          setRetryCount(0) // Reset retry count
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
    requestPermission,
    retryCount // Export retry count for debugging
  }
}
