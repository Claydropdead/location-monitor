'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface LocationData {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: string
}

interface LocationHistory {
  id: string
  latitude: number
  longitude: number
  accuracy: number
  location_timestamp: string
  is_active: boolean
}

export function useLocationTracking() {
  const [isTracking, setIsTracking] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null)
  const [locationHistory, setLocationHistory] = useState<LocationHistory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null)
  
  const supabase = createClient()

  // Check geolocation permission status
  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermissionStatus(result.state)
        result.addEventListener('change', () => {
          setPermissionStatus(result.state)
        })
      })
    }
  }, [])

  // Fetch location history
  const fetchLocationHistory = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_user_location_history', {
        limit_param: 100
      })

      if (error) {
        console.error('Error fetching location history:', error)
        setError(error.message)
        return
      }

      setLocationHistory(data || [])
      setError(null)
    } catch (err) {
      console.error('Error in fetchLocationHistory:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch location history')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  // Calculate distance between two coordinates in meters
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180 // φ, λ in radians
    const φ2 = lat2 * Math.PI/180
    const Δφ = (lat2-lat1) * Math.PI/180
    const Δλ = (lon2-lon1) * Math.PI/180

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

    return R * c // Distance in meters
  }, [])

  // Smart location save - always updates the single user record with accuracy filtering
  const saveLocationSmart = useCallback(async (location: LocationData) => {
    try {
      // Filter out very inaccurate readings (> 100m)
      if (location.accuracy > 100) {
        console.log(`Rejecting inaccurate location: ±${location.accuracy.toFixed(1)}m - waiting for better accuracy`)
        setError('Waiting for more accurate GPS signal...')
        return false
      }

      // Check if we have a previous location to compare
      if (locationHistory.length > 0) {
        const lastLocation = locationHistory[0]
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          lastLocation.latitude,
          lastLocation.longitude
        )

        console.log(`Distance from last location: ${distance.toFixed(2)}m, New accuracy: ±${location.accuracy.toFixed(1)}m`)

        // If new location is significantly more accurate, always update
        const accuracyImprovement = lastLocation.accuracy - location.accuracy
        if (accuracyImprovement > 20) {
          console.log(`Significant accuracy improvement: ${accuracyImprovement.toFixed(1)}m better`)
        }

        // Determine if this is a significant movement or accuracy improvement
        const threshold = Math.max(Math.min(location.accuracy, lastLocation.accuracy) + 5, 10)
        
        if (distance < threshold && accuracyImprovement < 10) {
          console.log('Location unchanged and no significant accuracy improvement')
        } else {
          console.log('Location changed or accuracy improved significantly')
        }
      } else {
        console.log('First location entry for user')
      }

      // Always use the same function - it will update the existing record
      const { data, error } = await supabase.rpc('add_user_location', {
        latitude_param: location.latitude,
        longitude_param: location.longitude,
        accuracy_param: location.accuracy
      })

      if (error) {
        console.error('Error saving/updating location:', error)
        setError(error.message)
        return false
      }

      console.log('Location updated successfully with accuracy:', `±${location.accuracy.toFixed(1)}m`)
      setError(null) // Clear any previous accuracy warnings
      await fetchLocationHistory()
      return true
    } catch (err) {
      console.error('Error in saveLocationSmart:', err)
      setError(err instanceof Error ? err.message : 'Failed to save location')
      return false
    }
  }, [supabase, fetchLocationHistory, locationHistory, calculateDistance])

  // Save location to database (legacy function - now calls smart save)
  const saveLocation = useCallback(async (location: LocationData) => {
    return await saveLocationSmart(location)
  }, [saveLocationSmart])

  // Get current position with multiple accuracy attempts
  const getCurrentPosition = useCallback(async () => {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'))
        return
      }

      let attempts = 0
      const maxAttempts = 3
      let bestPosition: GeolocationPosition | null = null

      const tryGetPosition = () => {
        attempts++
        
        navigator.geolocation.getCurrentPosition(
          (position) => {
            console.log(`GPS attempt ${attempts}: accuracy ±${position.coords.accuracy.toFixed(1)}m`)
            
            // If this is our first position or it's more accurate than previous
            if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
              bestPosition = position
            }

            // If we have good accuracy (< 20m) or reached max attempts, use best position
            if (position.coords.accuracy < 20 || attempts >= maxAttempts) {
              console.log(`Using position with accuracy: ±${bestPosition.coords.accuracy.toFixed(1)}m`)
              resolve(bestPosition)
            } else {
              // Try again for better accuracy
              setTimeout(tryGetPosition, 1000)
            }
          },
          (error) => {
            console.error(`GPS attempt ${attempts} failed:`, error)
            if (attempts >= maxAttempts) {
              if (bestPosition) {
                console.log(`Using best available position: ±${bestPosition.coords.accuracy.toFixed(1)}m`)
                resolve(bestPosition)
              } else {
                reject(error)
              }
            } else {
              // Try again with different settings
              setTimeout(tryGetPosition, 1000)
            }
          },
          {
            enableHighAccuracy: true,
            timeout: attempts === 1 ? 20000 : 15000, // Longer timeout for first attempt
            maximumAge: 0 // Always get fresh location
          }
        )
      }

      tryGetPosition()
    })
  }, [])

  // Track location once
  const trackLocationOnce = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const position = await getCurrentPosition()
      
      const locationData: LocationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date().toISOString()
      }

      setCurrentLocation(locationData)
      
      // Save to database
      await saveLocation(locationData)
      
      return locationData
    } catch (err) {
      console.error('Error tracking location:', err)
      const errorMessage = err instanceof GeolocationPositionError 
        ? getGeolocationErrorMessage(err)
        : err instanceof Error 
        ? err.message 
        : 'Failed to get location'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [getCurrentPosition, saveLocation])

  // Start continuous tracking
  const startTracking = useCallback((intervalMs: number = 30000) => {
    if (isTracking) return

    setIsTracking(true)
    setError(null)

    // Track immediately
    trackLocationOnce()

    // Set up interval for continuous tracking
    const intervalId = setInterval(() => {
      trackLocationOnce().catch(console.error)
    }, intervalMs)

    // Return cleanup function
    return () => {
      clearInterval(intervalId)
      setIsTracking(false)
    }
  }, [isTracking, trackLocationOnce])

  // Stop tracking
  const stopTracking = useCallback(() => {
    setIsTracking(false)
  }, [])

  // Request location permission
  const requestLocationPermission = useCallback(async () => {
    try {
      await getCurrentPosition()
      return true
    } catch (err) {
      console.error('Permission denied:', err)
      setError('Location permission denied')
      return false
    }
  }, [getCurrentPosition])

  return {
    isTracking,
    currentLocation,
    locationHistory,
    error,
    loading,
    permissionStatus,
    trackLocationOnce,
    startTracking,
    stopTracking,
    fetchLocationHistory,
    requestLocationPermission,
    clearError: () => setError(null)
  }
}

function getGeolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location access denied by user'
    case error.POSITION_UNAVAILABLE:
      return 'Location information unavailable'
    case error.TIMEOUT:
      return 'Location request timed out'
    default:
      return 'An unknown location error occurred'
  }
}
