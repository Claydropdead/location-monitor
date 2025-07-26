'use client'

import { useEffect, useState, useCallback } from 'react'
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

  // Quick localStorage check to reduce UI delay
  const getInitialLocationState = useCallback((userId: string) => {
    const wasSharing = localStorage.getItem(`location-sharing-${userId}`) === 'true'
    if (wasSharing) {
      console.log('🚀 Quick restore: User was sharing before - setting initial state')
      setIsLocationEnabled(true)
    }
    return wasSharing
  }, [])
  
  const {
    position,
    error,
    permission,
    startWatching,
    stopWatching,
    requestPermission
  } = useLocation(user?.id || null, {
    onLocationUpdate: () => {
      setLastLocationUpdate(new Date())
      console.log('📍 Location update sent to server')
      
      // Auto-enable sharing if user was sharing before and location update happens
      if (user?.id && !isLocationEnabled) {
        const wasSharing = localStorage.getItem(`location-sharing-${user.id}`) === 'true'
        if (wasSharing) {
          console.log('🔄 Location update detected - auto-enabling sharing button')
          setIsLocationEnabled(true)
        }
      }
    }
  })

  // Immediate location sharing restoration when position is detected
  useEffect(() => {
    if (position && user?.id && !isLocationEnabled) {
      const wasSharing = localStorage.getItem(`location-sharing-${user.id}`) === 'true'
      if (wasSharing) {
        console.log('🚀 Position detected + user was sharing - immediately enabling location sharing')
        setIsLocationEnabled(true)
        
        // If no watchId, start watching immediately
        if (!watchId) {
          console.log('🔄 Starting location watch immediately')
          const id = startWatching()
          if (id) {
            setWatchId(id)
            console.log('✅ Location sharing auto-started with watch ID:', id)
          }
        }
      }
    }
  }, [position, user?.id, isLocationEnabled, watchId, startWatching])

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
    
    // Sync location status every 30 seconds to catch discrepancies
    // TEMPORARILY DISABLED - causing conflicts with active status
    /* const syncInterval = setInterval(() => {
      if (user?.id) {
        syncLocationStatus(user.id)
      }
    }, 30000) */
    
    return () => {
      onlineStatsSubscription.unsubscribe()
      clearInterval(interval)
      // clearInterval(syncInterval) // DISABLED
    }
  }, [supabase, user?.id])

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
            if (newProfile) {
              // Quick localStorage check for new profile too
              const wasSharing = getInitialLocationState(newProfile.id)
              
              // If user was sharing, immediately attempt to resume
              if (wasSharing) {
                console.log('🚀 New profile but user was sharing - attempting immediate resume')
                setTimeout(() => {
                  resumeLocationSharing()
                }, 100)
              }
            }
          }
        }
        return
      }

      if (profile) {
        console.log('Profile loaded:', profile)
        setUser(profile)
        
        // Quick localStorage check to reduce UI delay
        const wasSharing = getInitialLocationState(profile.id)
        
        // If user was sharing, immediately attempt to resume
        if (wasSharing) {
          console.log('🚀 User was sharing - attempting immediate resume')
          setTimeout(() => {
            resumeLocationSharing()
          }, 100) // Small delay to ensure profile is set
        }
        
        // Then do full database check
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
      // Professional approach: Users are online if they updated location in last 3 minutes
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString()
      
      const { count } = await supabase
        .from('user_locations')
        .select('user_id', { count: 'exact' })
        .eq('is_active', true)
        .gte('timestamp', threeMinutesAgo)

      setOnlineUsers(count || 0)
    } catch (error) {
      console.error('Error fetching online users count:', error)
    }
  }

  const syncLocationStatus = async (userId: string) => {
    try {
      // Check current database state
      const { data: currentLocation, error } = await supabase
        .from('user_locations')
        .select('is_active, timestamp')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') {
        // Error other than "not found"
        console.error('Error syncing location status:', error)
        return
      }

      if (currentLocation) {
        const dbIsActive = currentLocation.is_active
        const uiIsActive = isLocationEnabled
        
        // If there's a mismatch, sync to database state
        if (dbIsActive !== uiIsActive) {
          console.log(`🔄 Syncing UI state: DB=${dbIsActive}, UI=${uiIsActive}`)
          setIsLocationEnabled(dbIsActive)
          
          // If DB shows inactive but UI shows active, stop watching
          if (!dbIsActive && uiIsActive && watchId) {
            stopWatching(watchId)
            setWatchId(null)
            console.log('🛑 Stopped location watching due to DB sync')
          }
          
          // If DB shows active but UI shows inactive, try to resume
          if (dbIsActive && !uiIsActive) {
            console.log('🔄 DB shows active but UI inactive, attempting to resume...')
            await resumeLocationSharing()
          }
        }
      } else {
        // No database record found
        if (isLocationEnabled) {
          console.log('🔄 UI shows active but no DB record, may need to create one')
        }
      }
    } catch (error) {
      console.error('Error syncing location status:', error)
    }
  }

  // Sync UI state with actual location sharing status
  const syncLocationSharingState = useCallback(async () => {
    if (!user?.id) return
    
    try {
      // Check if we have recent location updates (within last 2 minutes)
      const { data: recentLocation, error } = await supabase
        .from('user_locations')
        .select('timestamp, is_active')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()
      
      if (error || !recentLocation) {
        // No location data - check localStorage intent
        const wasSharing = localStorage.getItem(`location-sharing-${user.id}`) === 'true'
        if (wasSharing && !isLocationEnabled) {
          console.log('🔄 User intended to share but UI shows stopped - correcting state')
          setIsLocationEnabled(true)
        }
        return
      }
      
      const lastUpdate = new Date(recentLocation.timestamp)
      const now = new Date()
      const minutesAgo = (now.getTime() - lastUpdate.getTime()) / (1000 * 60)
      
      // If we have very recent updates AND user preference, user is definitely sharing
      if (minutesAgo < 2 && !isLocationEnabled) {
        const wasSharing = localStorage.getItem(`location-sharing-${user.id}`) === 'true'
        if (wasSharing) {
          console.log('🔄 Recent location updates detected + user preference - correcting state')
          setIsLocationEnabled(true)
        }
      }
      
    } catch (error) {
      console.error('Error syncing location sharing state:', error)
    }
  }, [user?.id, isLocationEnabled, supabase])

  // Check state every 30 seconds to keep UI synchronized
  useEffect(() => {
    if (!user?.id) return
    
    const interval = setInterval(syncLocationSharingState, 30000) // Check every 30 seconds
    
    return () => clearInterval(interval)
  }, [user?.id, syncLocationSharingState])

  const checkLocationSharingStatus = async (userId: string) => {
    try {
      console.log('Checking location sharing status for user:', userId)
      
      // Check localStorage for user's intent to share location
      const wasSharing = localStorage.getItem(`location-sharing-${userId}`) === 'true'
      console.log('Was previously sharing location:', wasSharing)
      
      // Check if user has any active locations
      const { data: activeLocations, error } = await supabase
        .from('user_locations')
        .select('id, timestamp, is_active')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)

      if (error) {
        console.error('Error checking location status:', error)
        return
      }

      if (activeLocations && activeLocations.length > 0) {
        const location = activeLocations[0]
        const lastUpdate = new Date(location.timestamp)
        const now = new Date()
        const timeDiff = now.getTime() - lastUpdate.getTime()
        const minutesDiff = timeDiff / (1000 * 60)

        console.log('Found location record:', {
          is_active: location.is_active,
          minutesAgo: minutesDiff,
          wasSharing
        })

        // CRITICAL: Only restore if user preference exists in localStorage
        // Database active state alone is not enough - user must have intended to share
        if (wasSharing && (location.is_active || minutesDiff < 10)) {
          console.log('✅ Location sharing detected - setting UI state to active')
          setIsLocationEnabled(true)
          
          // If not already watching but should be, start watching
          if (!watchId) {
            console.log('🔄 No watch ID but should be sharing - starting location watch')
            await resumeLocationSharing()
          }
        } else if (wasSharing && minutesDiff < 30) {
          // User was sharing recently but marked offline - likely accidental close
          console.log('🔄 User was sharing recently (accidental close), attempting to resume')
          setIsLocationEnabled(true)
          await resumeLocationSharing()
        } else if (wasSharing && minutesDiff >= 30) {
          // User was sharing but too long ago - show as stopped but keep preference
          console.log('⏰ User was sharing but too long ago (>30 min) - require manual restart')
          setIsLocationEnabled(false)
          // Keep localStorage preference so user knows they had it enabled before
        } else if (location.is_active && !wasSharing) {
          // Database shows active but no user preference - clean up stale data
          console.log('🧹 Found stale active record without user preference - cleaning up')
          await supabase
            .from('user_locations')
            .update({ is_active: false })
            .eq('user_id', userId)
            .eq('is_active', true)
          setIsLocationEnabled(false)
        } else {
          console.log('❌ Location is inactive or too old, not resuming')
          setIsLocationEnabled(false)
          // Clean up localStorage if location is not actually active and it's been too long
          if (wasSharing && minutesDiff >= 30) {
            localStorage.removeItem(`location-sharing-${userId}`)
            console.log('🧹 Cleaned up stale localStorage preference (>30 min)')
          }
        }
      } else if (wasSharing) {
        // No location record but user was previously sharing - try once
        console.log('🆕 No location record but user was sharing before - attempting fresh start')
        setIsLocationEnabled(true)
        await resumeLocationSharing()
      } else {
        console.log('📍 No location records found and user wasn\'t sharing')
        setIsLocationEnabled(false)
      }
    } catch (error) {
      console.error('Error checking location sharing status:', error)
    }
  }

  const resumeLocationSharing = async () => {
    console.log('Attempting to resume location sharing...')
    
    // Set UI state immediately to reflect that we're attempting to share
    setIsLocationEnabled(true)
    
    // Don't wait - try immediately
    if (permission === 'granted') {
      console.log('✅ Permission already granted, starting location watch')
      const id = startWatching()
      if (id) {
        setWatchId(id)
        console.log('✅ Location sharing resumed with watch ID:', id)
      } else {
        console.log('❌ Failed to start location watch')
        setIsLocationEnabled(false)
      }
    } else if (permission === 'prompt') {
      console.log('🔄 Permission prompt, requesting permission')
      try {
        const granted = await requestPermission()
        if (granted) {
          const id = startWatching()
          if (id) {
            setWatchId(id)
            console.log('✅ Location sharing resumed after permission granted')
          } else {
            console.log('❌ Failed to start location watch after permission granted')
            setIsLocationEnabled(false)
          }
        } else {
          console.log('❌ Permission denied, cannot resume location sharing')
          setIsLocationEnabled(false)
          if (user) {
            localStorage.removeItem(`location-sharing-${user.id}`)
          }
        }
      } catch (error) {
        console.log('❌ Error requesting permission:', error)
        setIsLocationEnabled(false)
        if (user) {
          localStorage.removeItem(`location-sharing-${user.id}`)
        }
      }
    } else {
      console.log('❌ Permission denied, cannot resume location sharing')
      setIsLocationEnabled(false)
      if (user) {
        localStorage.removeItem(`location-sharing-${user.id}`)
      }
    }
  }

  const handleLocationToggle = async () => {
    console.log('Location toggle clicked, current state:', isLocationEnabled)
    console.log('User:', user)
    console.log('Permission:', permission)

    if (isLocationEnabled) {
      // Stop location tracking
      if (watchId) {
        stopWatching(watchId)
        setWatchId(null)
      }
      
      // Mark user as inactive and remove localStorage preference
      if (user) {
        console.log('🔴 Manual stop sharing - cleaning up database and localStorage')
        
        // First, mark all records as inactive
        const { error: updateError } = await supabase
          .from('user_locations')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .eq('is_active', true)
        
        if (updateError) {
          console.error('Error marking user location inactive:', updateError)
        } else {
          console.log('✅ All active location records marked inactive')
        }
        
        // Then delete all records for clean slate
        console.log('🗑️ Attempting to delete location records for user:', user.id)
        const { data: deleteResult, error: deleteError } = await supabase
          .from('user_locations')
          .delete()
          .eq('user_id', user.id)
          .select() // Add select to see what was deleted
        
        if (deleteError) {
          console.error('❌ Error deleting user location records:', deleteError)
          console.error('Delete error details:', {
            message: deleteError.message,
            code: deleteError.code,
            details: deleteError.details,
            hint: deleteError.hint
          })
        } else {
          console.log('✅ Location records deleted successfully:', deleteResult)
          console.log(`🗑️ Deleted ${deleteResult?.length || 0} records (manual turn off)`)
        }
        
        // Remove the sharing preference
        localStorage.removeItem(`location-sharing-${user.id}`)
        console.log('🔴 Location sharing preference removed')
        
        // Force refresh to ensure clean state
        await getOnlineUsersCount()
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
        
        // Save user's preference to share location
        if (user) {
          localStorage.setItem(`location-sharing-${user.id}`, 'true')
          console.log('🟢 Location sharing preference saved')
        }
        
        console.log('Location tracking started with ID:', id)
      } else {
        console.error('Failed to start location tracking')
        alert('Failed to start location tracking. Please try again.')
      }
    }
  }

  const handleSignOut = async () => {
    // Stop location tracking before signing out
    if (watchId) {
      stopWatching(watchId)
    }
    
    // Mark user as inactive and clean up localStorage
    if (user) {
      // When logging out, DELETE the location record completely
      await supabase
        .from('user_locations')
        .delete()
        .eq('user_id', user.id)
      
      // Clean up location sharing preference
      localStorage.removeItem(`location-sharing-${user.id}`)
      console.log('�️ Location record deleted (logout)')
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
