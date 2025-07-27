'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GeolocationPosition } from '@/types'
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
      console.warn('No userId provided for location watching')
      return null
    }

    console.log('Starting location watching for user:', userId)
    setError(null) // Clear any previous errors
    setLoading(true)

    try {
      const watchId = await geoService.startWatching((position: GeolocationPosition) => {
        console.log('Location updated:', position.coords.latitude, position.coords.longitude)
        retryCountRef.current = 0 // Reset retry count on success
        setLoading(false)
        setPosition(position)
        updateLocationInDB(position) // Throttled updates for continuous watching
      })

      console.log('Watch started with ID:', watchId)
      return watchId
    } catch (err: unknown) {
      console.error('Start watching error:', err)
      
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
    if (watchId) {
      // If a specific watch ID is provided, we can't stop it with our service
      // since it manages its own watch ID internally
      console.warn('Cannot stop specific watch ID with native service')
    }
    
    try {
      await geoService.stopWatching()
      console.log('Location watching stopped')
    } catch (error) {
      console.error('Error stopping location watch:', error)
    }
  }, [geoService])

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
