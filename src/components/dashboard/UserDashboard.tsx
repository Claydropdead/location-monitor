'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocation } from '@/hooks/useLocation'
import { User } from '@/types'
import { MapPin, Users, Clock, Signal, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function UserDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [watchId, setWatchId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [onlineUsers, setOnlineUsers] = useState(0)
  const [lastLocationUpdate, setLastLocationUpdate] = useState<Date | null>(null)
  
  const supabase = createClient()
  const router = useRouter()

  // Get location sharing hook with notification sync
  const {
    position,
    error,
    permission,
    isSharing,
    startWatching,
    stopWatching,
    requestPermission,
    cleanup
  } = useLocation(user?.id || null, {
    onLocationUpdate: () => {
      setLastLocationUpdate(new Date())
      console.log('📍 Location update sent to server')
    }
  })

  // Load user profile
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        
        if (!authUser) {
          router.push('/login')
          return
        }

        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single()

        if (profile) {
          setUser(profile)
          console.log('✅ User profile loaded:', profile.name)
        }
      } catch (error) {
        console.error('Error loading user profile:', error)
      } finally {
        setLoading(false)
      }
    }

    loadUserProfile()
  }, [supabase, router])

  // Count online users
  useEffect(() => {
    const countOnlineUsers = async () => {
      try {
        const { count } = await supabase
          .from('user_locations')
          .select('*', { count: 'exact', head: true })
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)

        setOnlineUsers(count || 0)
      } catch (error) {
        console.error('Error counting online users:', error)
      }
    }

    if (user) {
      countOnlineUsers()
      const interval = setInterval(countOnlineUsers, 30000)
      return () => clearInterval(interval)
    }
  }, [user, supabase])

  const handleLocationToggle = async () => {
    if (!user?.id) return

    try {
      setLoading(true)

      if (isSharing) {
        // Stop sharing
        console.log('🛑 Stopping location sharing...')
        if (watchId) {
          await stopWatching(watchId)
          setWatchId(null)
        }
        
        // Force immediate state sync check after button press
        setTimeout(() => {
          console.log('🔄 Force checking location sharing state after stop button...')
          // The useLocation hook should automatically detect the change
        }, 500)
        
        // Clear from database
        await supabase
          .from('user_locations')
          .delete()
          .eq('user_id', user.id)

        console.log('✅ Location sharing stopped')
      } else {
        // Start sharing
        console.log('🚀 Starting location sharing...')
        
        if (permission === 'denied') {
          const granted = await requestPermission()
          if (!granted) {
            alert('Location permission is required to share your location')
            return
          }
        }

        const id = await startWatching()
        if (id) {
          setWatchId(id)
          console.log('✅ Location sharing started')
        }
      }
    } catch (error) {
      console.error('Error toggling location:', error)
      alert('Failed to toggle location sharing')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      console.log('🚪 User signing out - cleaning up location tracking...')
      
      // Use the comprehensive cleanup method
      if (cleanup) {
        await cleanup()
      }
      
      // Legacy cleanup for safety
      if (isSharing && watchId) {
        await stopWatching(watchId)
      }
      
      if (user?.id) {
        await supabase
          .from('user_locations')
          .delete()
          .eq('user_id', user.id)
      }

      await supabase.auth.signOut()
      console.log('✅ Sign out completed, redirecting to login...')
      router.push('/login')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const formatTime = (date: Date | null) => {
    if (!date) return 'Never'
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Location Monitor</h1>
              <p className="text-gray-600">Welcome back, {user?.name || 'User'}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

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
                      isSharing ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {isSharing ? 'Sharing' : 'Not Sharing'}
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
                      {formatTime(lastLocationUpdate)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Location Sharing
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Start sharing your location to be visible on the admin map.
            </p>
            
            {position && (
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">
                  Current position: {position.coords.latitude.toFixed(6)}, {position.coords.longitude.toFixed(6)}
                </p>
                <p className="text-sm text-gray-500">
                  Accuracy: ±{Math.round(position.coords.accuracy)} meters
                </p>
              </div>
            )}

            <div className="flex space-x-4">
              <button
                onClick={handleLocationToggle}
                disabled={loading || permission === 'denied'}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${
                  isSharing
                    ? 'text-white bg-red-600 hover:bg-red-700'
                    : 'text-white bg-green-600 hover:bg-green-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <MapPin className="h-4 w-4 mr-2" />
                {isSharing ? 'Stop Sharing' : 'Share Location'}
              </button>

              {permission === 'denied' && (
                <button
                  onClick={requestPermission}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Request Permission
                </button>
              )}
            </div>

            {permission === 'denied' && (
              <p className="mt-2 text-sm text-red-600">
                Location permission denied. Please enable location access in your browser settings.
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Profile Information
            </h3>
            
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Name</dt>
                <dd className="mt-1 text-sm text-gray-900">{user?.name || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Email</dt>
                <dd className="mt-1 text-sm text-gray-900">{user?.email || 'N/A'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
