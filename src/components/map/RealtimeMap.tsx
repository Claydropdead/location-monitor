'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserWithLocation, MapMarker, LocationWithUser, UserLocation, LocationUpdatePayload } from '@/types'
import { Loader2 } from 'lucide-react'

// Dynamically import the map to avoid SSR issues
const DynamicMap = dynamic(() => import('./RealtimeMapClient'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
        <p className="mt-2 text-sm text-gray-600">Loading map...</p>
      </div>
    </div>
  ),
})

export default function RealtimeMap() {
  const [users, setUsers] = useState<UserWithLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const supabase = createClient()

  // Debounce mechanism to prevent rapid updates
  const debounceUpdateRef = useRef<NodeJS.Timeout | null>(null)
  
  const debouncedSetUsers = useCallback((newUsers: UserWithLocation[]) => {
    if (debounceUpdateRef.current) {
      clearTimeout(debounceUpdateRef.current)
    }
    
    debounceUpdateRef.current = setTimeout(() => {
      setUsers(newUsers)
      setLastUpdateTime(Date.now())
    }, 1000) // Increased to 1000ms debounce to reduce flickering
  }, []) // Empty dependency array to prevent infinite re-renders

  // Initialize data and subscriptions
  useEffect(() => {
    let mounted = true
    
    const initialize = async () => {
      if (!mounted) return
      
      // Initial data fetch
      const fetchPromise = fetchUsersWithLocations()
      
      // Setup real-time subscription
      const cleanup = setupRealtimeSubscription()
      
      await fetchPromise
      
      // Professional offline detection: Check every 2 minutes for stale locations
      const offlineDetectionInterval = setInterval(() => {
        if (!mounted) return
        console.log('🔍 Professional offline detection - checking for stale locations')
        markStaleUsersOffline()
      }, 120000) // 2 minutes
      
      // Backup refresh every 30 seconds (reduced frequency)
      const intervalId = setInterval(() => {
        if (!mounted) return
        console.log('🔄 Backup refresh (every 30 seconds)')
        fetchUsersWithLocations()
      }, 30000)
      
      return () => {
        mounted = false
        if (cleanup) cleanup()
        clearInterval(intervalId)
        clearInterval(offlineDetectionInterval)
      }
    }
    
    const cleanupPromise = initialize()
    
    return () => {
      mounted = false
      cleanupPromise.then(cleanup => cleanup && cleanup())
    }
  }, []) // Empty dependency array to prevent re-initialization

  const fetchUsersWithLocations = useCallback(async () => {
    try {
      console.log('Fetching users with locations...')
      
      // First, let's get the current user to check if they're admin
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
      console.log('Current user:', currentUser?.id)

      if (authError) {
        console.error('Authentication error:', authError)
        setError(`Authentication error: ${authError.message}`)
        return
      }

      if (!currentUser) {
        console.warn('No authenticated user found')
        setError('Not authenticated')
        return
      }

      // Try a simple query first to test permissions
      console.log('Testing user table access...')
      const { data: testUsers, error: testError } = await supabase
        .from('users')
        .select('id, name, role')
        .limit(1)

      if (testError) {
        console.error('User table access test failed:', {
          error: testError,
          message: testError.message,
          code: testError.code,
          details: testError.details
        })
      } else {
        console.log('User table test successful:', { testUsers })
      }

      // Get all locations with user info (both active and inactive for "Last seen")
      // This will show online users (is_active: true) and offline users (is_active: false) 
      console.log('Fetching locations with user data...')
      const { data: locationsData, error: locationsError } = await supabase
        .from('user_locations')
        .select(`
          id,
          user_id,
          latitude,
          longitude,
          accuracy,
          timestamp,
          is_active,
          users!inner(id, name, email, phone, role)
        `)
        // Show both active (online) and inactive (offline with "Last seen") users
        // Only exclude records older than 24 hours to prevent clutter
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('timestamp', { ascending: false })
        .returns<LocationWithUser[]>()

      console.log('Locations query result:', { 
        dataCount: locationsData?.length || 0,
        error: locationsError,
        errorDetails: locationsError ? {
          message: locationsError.message,
          code: locationsError.code,
          details: locationsError.details,
          hint: locationsError.hint
        } : null
      })

      if (locationsError) {
        console.error('Locations error:', locationsError)
        setError(`Database error: ${locationsError.message || 'Unknown error'}`)
        return
      }

      if (!locationsData || locationsData.length === 0) {
        console.log('No active locations found - this means all locations have is_active = false')
        console.log('Check the database: all user_locations should have at least one record with is_active = true')
        setUsers([])
        return
      }

      console.log('Found', locationsData.length, 'active locations')

      // Group locations by user and get only the latest one for each user
      const userLocationMap = new Map<string, LocationWithUser>()
      
      locationsData.forEach(location => {
        const userId = location.users.id
        if (!userId) {
          console.warn('Location without user ID found:', location)
          return
        }
        
        const existingLocation = userLocationMap.get(userId)
        if (!existingLocation || new Date(location.timestamp) > new Date(existingLocation.timestamp)) {
          userLocationMap.set(userId, location)
        }
      })

      // Transform the data with smart offline detection
      const usersWithLatestLocation: UserWithLocation[] = Array.from(userLocationMap.values()).map(location => {
        const now = new Date()
        const lastUpdate = new Date(location.timestamp)
        const minutesAgo = (now.getTime() - lastUpdate.getTime()) / (1000 * 60)
        
        // Smart detection: If location is older than 3 minutes, consider offline
        const isReallyOnline = location.is_active && minutesAgo < 3
        
        return {
          id: location.users.id || '',
          name: location.users.name || 'Unknown',
          email: location.users.email || '',
          phone: location.users.phone || '',
          role: location.users.role as 'user' | 'admin' || 'user',
          created_at: '',
          updated_at: '',
          latest_location: {
            id: location.id,
            user_id: location.user_id,
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy || 0,
            timestamp: location.timestamp,
            is_active: isReallyOnline // Smart detection applied here
          }
        }
      }).filter(user => user.id && user.latest_location)

      console.log('Processed users with smart offline detection:', usersWithLatestLocation.length, 'users')
      
      // Use immediate update for initial load, debounced for subsequent updates
      if (loading) {
        setUsers(usersWithLatestLocation)
      } else {
        debouncedSetUsers(usersWithLatestLocation)
      }
    } catch (err) {
      console.error('Error in fetchUsersWithLocations:', {
        error: err,
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined
      })
      setError(`Failed to fetch user locations: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [supabase, loading]) // Remove debouncedSetUsers to avoid circular dependency

  const setupRealtimeSubscription = useCallback(() => {
    console.log('Setting up real-time subscriptions...')
    
    // Use a single channel for better performance
    const subscription = supabase
      .channel('location_monitor_realtime', {
        config: {
          broadcast: { self: true },
          presence: { key: 'location_updates' }
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_locations'
        },
        async (payload) => {
          try {
            console.log('🆕 REAL-TIME: New location inserted!', payload.new)
            console.log('🆕 User:', payload.new?.user_id, '| Active:', payload.new?.is_active)
            if (payload.new?.is_active) {
              console.log('⚡ Processing new location update...')
              // Add small delay to allow database to stabilize
              setTimeout(() => {
                handleLocationUpdate(payload.new as LocationUpdatePayload)
              }, 200)
            }
          } catch (error) {
            console.error('Error handling INSERT event:', error)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_locations'
        },
        async (payload) => {
          try {
            console.log('🔄 REAL-TIME: Location updated!', payload.new)
            console.log('🔄 User:', payload.new?.user_id, '| Active:', payload.new?.is_active)
            console.log('⚡ Processing location update...')
            // Add small delay to allow database to stabilize
            setTimeout(() => {
              handleLocationUpdate(payload.new as LocationUpdatePayload)
            }, 200)
          } catch (error) {
            console.error('Error handling UPDATE event:', error)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'user_locations'
        },
        (payload) => {
          try {
            console.log('🗑️ Location deleted:', payload.old)
            if (payload.old?.user_id) {
              handleUserOffline(payload.old.user_id as string)
            }
          } catch (error) {
            console.error('Error handling DELETE event:', error)
          }
        }
      )
      .subscribe((status, err) => {
        console.log('🎯 REAL-TIME subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ REAL-TIME ACTIVE! Location monitoring is live!')
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('⚠️ Real-time subscription error:', err)
          console.log('🔄 Falling back to polling every 5 seconds')
          // Fallback to polling more frequently
          const fallbackInterval = setInterval(fetchUsersWithLocations, 5000)
          
          // Clean up fallback when component unmounts
          return () => clearInterval(fallbackInterval)
        } else if (status === 'TIMED_OUT') {
          console.warn('⚠️ Real-time subscription timed out')
        } else if (status === 'CLOSED') {
          console.log('📡 Real-time subscription closed')
        }
      })

    // Cleanup subscriptions
    return () => {
      console.log('Cleaning up real-time subscriptions...')
      subscription.unsubscribe()
    }
  }, [supabase]) // Remove function dependencies to avoid circular references

  const handleLocationUpdate = useCallback(async (locationData: LocationUpdatePayload) => {
    try {
      if (!locationData?.user_id) {
        console.warn('Invalid location data received:', locationData)
        return
      }

      console.log('📍 Processing location update for user:', locationData.user_id)
      
      // If location is not active, remove user from map
      if (!locationData.is_active) {
        console.log('🔴 Location inactive, removing user from map')
        handleUserOffline(locationData.user_id)
        return
      }

      // Get user data for this location update with better error handling
      console.log('Fetching user data for user_id:', locationData.user_id)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, name, email, phone, role')
        .eq('id', locationData.user_id)
        .single()

      if (userError) {
        console.error('Error fetching user for location update:', {
          error: userError,
          message: userError.message,
          code: userError.code,
          details: userError.details,
          hint: userError.hint,
          user_id: locationData.user_id
        })
        
        // Instead of failing completely, trigger a fallback refresh
        console.log('Falling back to full data refresh due to user fetch error...')
        // Use timeout to break out of current execution context
        setTimeout(() => fetchUsersWithLocations(), 100)
        return
      }

      if (!userData) {
        console.warn('No user data found for user_id:', locationData.user_id)
        // Try refreshing all data in case user was added recently
        console.log('Refreshing all data to find new user...')
        // Use timeout to break out of current execution context
        setTimeout(() => fetchUsersWithLocations(), 100)
        return
      }

      console.log('✅ Successfully fetched user data:', userData.name)

      const newLocation: UserLocation = {
        id: locationData.id,
        user_id: locationData.user_id,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        accuracy: locationData.accuracy || 0,
        timestamp: locationData.timestamp,
        is_active: locationData.is_active
      }

      const userWithLocation: UserWithLocation = {
        id: userData.id,
        name: userData.name || 'Unknown',
        email: userData.email || '',
        phone: userData.phone || '',
        role: userData.role as 'user' | 'admin' || 'user',
        created_at: '',
        updated_at: '',
        latest_location: newLocation
      }

      // Update users state directly for instant response
      setUsers(currentUsers => {
        const existingUserIndex = currentUsers.findIndex(user => user.id === locationData.user_id)
        
        if (existingUserIndex >= 0) {
          // Update existing user with new location
          const updatedUsers = [...currentUsers]
          updatedUsers[existingUserIndex] = userWithLocation
          console.log('✅ Updated existing user location for:', userData.name)
          return updatedUsers
        } else {
          // Add new user to the map
          console.log('➕ Added new user to map:', userData.name)
          return [...currentUsers, userWithLocation]
        }
      })

    } catch (error) {
      console.error('Error handling location update:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        locationData
      })
      // Fallback: trigger a full refresh if real-time update fails
      console.log('Falling back to full data refresh due to unexpected error...')
      // Use timeout to break out of current execution context
      setTimeout(() => fetchUsersWithLocations(), 100)
    }
  }, [supabase]) // Remove fetchUsersWithLocations to avoid circular dependency

  const handleUserOffline = useCallback((userId: string) => {
    console.log('🔴 User went offline:', userId)
    // Remove user from the map immediately
    setUsers(currentUsers => {
      const updatedUsers = currentUsers.filter(user => user.id !== userId)
      console.log('Removed offline user, remaining users:', updatedUsers.length)
      return updatedUsers
    })
  }, []) // Empty dependency array

  // Professional offline detection - mark users offline if no location update in 3 minutes
  const markStaleUsersOffline = useCallback(async () => {
    try {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString()
      
      console.log('🔍 Checking for users with stale locations (older than 3 minutes)')
      
      // Find users who claim to be active but haven't updated in 3 minutes
      const { data: staleUsers, error } = await supabase
        .from('user_locations')
        .select('user_id, timestamp')
        .eq('is_active', true)
        .lt('timestamp', threeMinutesAgo)
      
      if (error) {
        console.error('Error checking for stale users:', error)
        return
      }
      
      if (staleUsers && staleUsers.length > 0) {
        console.log(`🔴 Found ${staleUsers.length} stale users, marking them offline`)
        
        // Mark them as offline
        const { error: updateError } = await supabase
          .from('user_locations')
          .update({ is_active: false })
          .eq('is_active', true)
          .lt('timestamp', threeMinutesAgo)
        
        if (updateError) {
          console.error('Error marking stale users offline:', updateError)
        } else {
          console.log('✅ Successfully marked stale users as offline')
          // Refresh the map to reflect changes
          fetchUsersWithLocations()
        }
      } else {
        console.log('✅ No stale users found - all active users are up to date')
      }
    } catch (error) {
      console.error('Error in stale user detection:', error)
    }
  }, [supabase, fetchUsersWithLocations])

  const markers: MapMarker[] = users
    .filter(user => user.latest_location)
    .map(user => ({
      id: user.id,
      position: [user.latest_location!.latitude, user.latest_location!.longitude] as [number, number],
      user,
      location: user.latest_location!
    }))

  console.log('Generated markers:', markers.length, 'markers from', users.length, 'users')
  console.log('Markers data:', markers)
  console.log('Users data:', users)
  
  // Debug: Log each user's location data
  users.forEach((user, index) => {
    console.log(`User ${index + 1}:`, {
      id: user.id,
      name: user.name,
      hasLocation: !!user.latest_location,
      location: user.latest_location ? {
        lat: user.latest_location.latitude,
        lng: user.latest_location.longitude,
        active: user.latest_location.is_active,
        timestamp: user.latest_location.timestamp
      } : null
    })
  })

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
          <p className="mt-2 text-sm text-gray-600">Loading user locations...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-100">
        <div className="text-center text-red-600">
          <p className="text-lg font-semibold">Error loading map</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => {
              setError(null)
              setLoading(true)
              fetchUsersWithLocations()
            }}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full relative">
      <DynamicMap markers={markers} />
    </div>
  )
}
