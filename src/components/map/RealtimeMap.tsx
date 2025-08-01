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
      
      // Simple backup refresh every 30 seconds
      const intervalId = setInterval(() => {
        if (!mounted) return
        console.log('🔄 Backup refresh')
        fetchUsersWithLocations()
      }, 30000)
      
      return () => {
        mounted = false
        if (cleanup) cleanup()
        clearInterval(intervalId)
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
      console.log('Checking user role...')
      const { data: userRole, error: roleError } = await supabase
        .rpc('get_user_role')

      if (roleError) {
        console.error('Role check error:', roleError)
        setError(`Role check error: ${roleError.message}`)
        return
      }

      console.log('User role:', userRole)
      
      if (userRole !== 'admin') {
        setError('Access denied. Admin privileges required.')
        return
      }

      // Use the new function to get users with locations
      console.log('Fetching users with locations using admin function...')
      const { data: usersData, error: usersError } = await supabase
        .rpc('get_users_with_locations')

      console.log('Users query result:', { 
        dataCount: usersData?.length || 0,
        error: usersError,
        errorDetails: usersError ? {
          message: usersError.message,
          code: usersError.code,
          details: usersError.details,
          hint: usersError.hint
        } : null
      })

      if (usersError) {
        console.error('Users error:', usersError)
        setError(`Database error: ${usersError.message || 'Unknown error'}`)
        return
      }

      if (!usersData || usersData.length === 0) {
        console.log('No users with locations found')
        setUsers([])
        return
      }

      console.log('Found', usersData.length, 'users with locations')

      // Transform the data to match our UserWithLocation interface
      const usersWithLatestLocation: UserWithLocation[] = usersData
        .filter((user: any) => user.user_id && user.latest_latitude && user.latest_longitude)
        .map((user: any) => ({
          id: user.user_id,
          name: user.user_name || 'Unknown',
          email: user.user_email || '',
          phone: user.user_phone || '',
          role: (user.user_role as 'user' | 'admin') || 'user',
          created_at: '',
          updated_at: '',
          latest_location: {
            id: '', // We don't have the location ID from the function
            user_id: user.user_id,
            latitude: user.latest_latitude,
            longitude: user.latest_longitude,
            accuracy: user.latest_accuracy || 0,
            timestamp: user.latest_timestamp || new Date().toISOString(),
            is_active: user.is_active ?? true
          }
        }))

      console.log('Processed users:', usersWithLatestLocation.length, 'users')
      
      // Use immediate update for initial load, debounced for subsequent updates
      if (loading) {
        setUsers(usersWithLatestLocation)
      } else {
        debouncedSetUsers(usersWithLatestLocation)
      }
      setError(null)
      
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
              // Reduced delay for faster real-time response
              setTimeout(() => {
                handleLocationUpdate(payload.new as LocationUpdatePayload)
              }, 50) // Reduced from 200ms to 50ms
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
            // Reduced delay for faster real-time response
            setTimeout(() => {
              handleLocationUpdate(payload.new as LocationUpdatePayload)
            }, 50) // Reduced from 200ms to 50ms
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
              console.log('🔄 Refreshing map after location deletion')
              setTimeout(() => fetchUsersWithLocations(), 100)
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
      
      // Handle both active and inactive location updates
      if (!locationData.is_active) {
        console.log('🔴 Location marked inactive, updating user status to offline')
        // Update existing user to show as offline instead of removing them
        setUsers(currentUsers => {
          return currentUsers.map(user => {
            if (user.id === locationData.user_id) {
              return {
                ...user,
                latest_location: {
                  ...user.latest_location!,
                  is_active: false,
                  timestamp: locationData.timestamp
                }
              }
            }
            return user
          })
        })
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
