'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocation } from '@/hooks/useLocation'
import { User } from '@/types'
import { MapPin, Users, Clock, Signal, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function UserDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [isLocationEnabled, setIsLocationEnabled] = useState(false)
  const [watchId, setWatchId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [onlineUsers, setOnlineUsers] = useState(0)
  const [lastLocationUpdate, setLastLocationUpdate] = useState<Date | null>(null)
  
  const supabase = createClient()
  const router = useRouter()
  
  const {
    position,
    error,
    permission,
    startWatching,
    stopWatching,
    requestPermission,
    removeUserFromMap
  } = useLocation(user?.id || null, {
    onLocationUpdate: () => {
      setLastLocationUpdate(new Date())
      console.log('📍 Location update sent to server')
    }
  })

  useEffect(() => {
    getUser()
    getOnlineUsersCount()
    
    // Set up real-time subscription for online user count
    const onlineStatsSubscription = supabase
      .channel('user_stats_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_locations'
        },
        () => {
          console.log('📊 Online users count update triggered')
          getOnlineUsersCount() // Update count immediately when locations change
        }
      )
      .subscribe((status) => {
        console.log('User stats subscription status:', status)
      })
    
    // Backup refresh every 10 seconds (faster updates)
    const interval = setInterval(getOnlineUsersCount, 10000)
    
    return () => {
      onlineStatsSubscription.unsubscribe()
      clearInterval(interval)
    }
  }, [supabase])

  const getUser = async () => {
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      
      if (authError) {
        console.error('Auth error:', authError)
        router.push('/login')
        return
      }

      if (!authUser) {
        console.log('No authenticated user found')
        router.push('/login')
        return
      }

      console.log('Authenticated user:', authUser.id)

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (profileError) {
        console.error('Profile error:', profileError)
        // If profile doesn't exist, create it
        if (profileError.code === 'PGRST116') {
          console.log('Profile not found, creating...')
          const { data: newProfile, error: insertError } = await supabase
            .from('users')
            .insert({
              id: authUser.id,
              email: authUser.email || '',
              name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
              phone: authUser.user_metadata?.phone || null,
              role: 'user'
            })
            .select()
            .single()

          if (insertError) {
            console.error('Error creating profile:', insertError)
          } else {
            setUser(newProfile)
          }
        }
        return
      }

      if (profile) {
        console.log('Profile loaded:', profile)
        setUser(profile)
        // Check if user has active location sharing
        checkLocationSharingStatus(profile.id)
      }
    } catch (error) {
      console.error('Error fetching user:', error)
    } finally {
      setLoading(false)
    }
  }

  const getOnlineUsersCount = async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      
      const { count } = await supabase
        .from('user_locations')
        .select('user_id', { count: 'exact' })
        .eq('is_active', true)
        .gte('timestamp', fiveMinutesAgo)

      setOnlineUsers(count || 0)
    } catch (error) {
      console.error('Error fetching online users count:', error)
    }
  }

  const checkLocationSharingStatus = async (userId: string) => {
    try {
      console.log('Checking location sharing status for user:', userId)
      
      // Check if user has any active locations
      const { data: activeLocations, error } = await supabase
        .from('user_locations')
        .select('id, timestamp')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('timestamp', { ascending: false })
        .limit(1)

      if (error) {
        console.error('Error checking location status:', error)
        return
      }

      if (activeLocations && activeLocations.length > 0) {
        const lastUpdate = new Date(activeLocations[0].timestamp)
        const now = new Date()
        const timeDiff = now.getTime() - lastUpdate.getTime()
        const minutesDiff = timeDiff / (1000 * 60)

        console.log('Found active location, last updated:', minutesDiff, 'minutes ago')

        // If location was updated within the last 10 minutes, consider it active
        if (minutesDiff < 10) {
          console.log('Restoring location sharing state')
          setIsLocationEnabled(true)
          
          // Start watching location again if we have permission
          if (permission === 'granted') {
            const id = startWatching()
            if (id) {
              setWatchId(id)
              console.log('Restarted location watching with ID:', id)
            }
          }
        } else {
          console.log('Location too old, marking as inactive')
          // Mark old location as inactive
          await supabase
            .from('user_locations')
            .update({ is_active: false })
            .eq('user_id', userId)
        }
      } else {
        console.log('No active locations found')
        setIsLocationEnabled(false)
      }
    } catch (error) {
      console.error('Error checking location sharing status:', error)
    }
  }

  const handleLocationToggle = async () => {
    console.log('Location toggle clicked, current state:', isLocationEnabled)
    console.log('User:', user)
    console.log('Permission:', permission)

    if (isLocationEnabled) {
      // Stop location tracking (INTENTIONAL - user clicked stop)
      if (watchId) {
        stopWatching(watchId, true) // true = intentional disconnect, will remove from map
        setWatchId(null)
      }
      
      // Remove user completely from map (intentional stop)
      if (user && removeUserFromMap) {
        removeUserFromMap()
      }
      
      setIsLocationEnabled(false)
    } else {
      // Check if user is loaded
      if (!user) {
        alert('User profile not loaded. Please refresh the page.')
        return
      }

      // Request permission if needed
      if (permission === 'denied') {
        alert('Location access is denied. Please enable it in your browser settings and refresh the page.')
        return
      }
      
      if (permission === 'prompt') {
        console.log('Requesting location permission...')
        const granted = await requestPermission()
        if (!granted) {
          alert('Location access is required to share your location.')
          return
        }
      }
      
      // Start location tracking
      console.log('Starting location tracking...')
      const id = startWatching()
      if (id) {
        setWatchId(id)
        setIsLocationEnabled(true)
        console.log('Location tracking started with ID:', id)
      } else {
        console.error('Failed to start location tracking')
        alert('Failed to start location tracking. Please try again.')
      }
    }
  }

  const handleSignOut = async () => {
    // Stop location tracking before signing out (INTENTIONAL - user logout)
    if (watchId) {
      stopWatching(watchId, true) // true = intentional disconnect, will remove from map
    }
    
    // Remove user completely from map (intentional logout)
    if (user && removeUserFromMap) {
      removeUserFromMap()
    }
    
    await supabase.auth.signOut()
    router.push('/login')
  }

  const formatCoordinates = (lat: number, lng: number) => {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Location Monitor</h1>
              <p className="text-sm text-gray-600">Welcome back, {user?.name}</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Users className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Online Users
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {onlineUsers}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Signal className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Location Status
                      </dt>
                      <dd className={`text-lg font-medium ${
                        isLocationEnabled ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {isLocationEnabled ? 'Sharing' : 'Not Sharing'}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Clock className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Last Update
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {position ? new Date(position.timestamp).toLocaleTimeString() : 'Never'}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Location Control */}
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Location Sharing
              </h3>
              
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">
                    {isLocationEnabled 
                      ? '🟢 Your location is being shared with administrators in real-time.'
                      : 'Start sharing your location to be visible on the admin map.'
                    }
                  </p>
                  {isLocationEnabled && lastLocationUpdate && (
                    <p className="text-xs text-green-600 mt-1">
                      ✅ Last update sent: {lastLocationUpdate.toLocaleTimeString()}
                    </p>
                  )}
                  {position && (
                    <p className="text-xs text-gray-500 mt-1">
                      Current position: {formatCoordinates(position.coords.latitude, position.coords.longitude)}
                      <br />
                      Accuracy: ±{position.coords.accuracy.toFixed(0)} meters
                    </p>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={handleLocationToggle}
                    disabled={permission === 'denied'}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${
                      isLocationEnabled
                        ? 'text-white bg-red-600 hover:bg-red-700'
                        : 'text-white bg-green-600 hover:bg-green-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    {isLocationEnabled ? 'Stop Sharing' : 'Share Location'}
                  </button>
                  
                  <button
                    onClick={async () => {
                      console.log('=== LOCATION DEBUG TEST ===')
                      console.log('User:', user)
                      console.log('Permission:', permission)
                      console.log('Navigator geolocation available:', !!navigator.geolocation)
                      
                      if (navigator.geolocation) {
                        console.log('Testing getCurrentPosition...')
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            console.log('✅ getCurrentPosition SUCCESS:', pos)
                            console.log('Coordinates:', pos.coords.latitude, pos.coords.longitude)
                            console.log('Accuracy:', pos.coords.accuracy)
                          },
                          (err) => {
                            console.log('❌ getCurrentPosition ERROR:', err)
                            console.log('Error code:', err?.code)
                            console.log('Error message:', err?.message)
                          },
                          { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
                        )
                      }
                    }}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    🔍 Test Location
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* User Profile */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Profile Information
              </h3>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Name</dt>
                  <dd className="mt-1 text-sm text-gray-900">{user?.name}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="mt-1 text-sm text-gray-900">{user?.email}</dd>
                </div>
                {user?.phone && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Phone</dt>
                    <dd className="mt-1 text-sm text-gray-900">{user.phone}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm font-medium text-gray-500">Role</dt>
                  <dd className="mt-1 text-sm text-gray-900 capitalize">{user?.role}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
