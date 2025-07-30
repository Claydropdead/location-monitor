'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocation } from '@/hooks/useLocation'
import { User } from '@/types'
import { MapPin, Clock, Signal, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function UserDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [watchId, setWatchId] = useState<{ watcherId: string; timerInterval: NodeJS.Timeout } | string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastLocationUpdate, setLastLocationUpdate] = useState<Date | null>(null)
  const [userWentOfflineManually, setUserWentOfflineManually] = useState(false) // Track manual offline
  const [isSigningOut, setIsSigningOut] = useState(false) // Track signing out state
  
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

  // Auto-start location tracking when user logs in
  useEffect(() => {
    const autoStartLocationTracking = async () => {
      if (!user || isSharing || watchId || userWentOfflineManually || isSigningOut) {
        // Don't start if no user, already sharing, already have a watch ID, user manually went offline, or signing out
        return
      }

      console.log('🚀 Auto-starting location tracking for logged in user:', user.name)
      
      try {
        // Request permission if needed
        if (permission === 'denied' || permission === 'prompt') {
          const granted = await requestPermission()
          if (!granted) {
            console.warn('⚠️ Location permission denied - cannot auto-start tracking')
            return
          }
        }

        // Start background location tracking
        const id = await startWatching()
        if (id) {
          setWatchId(id)
          console.log('✅ Auto-started location tracking with ID:', id)
        }
      } catch (error) {
        console.error('❌ Failed to auto-start location tracking:', error)
      }
    }

    autoStartLocationTracking()
  }, [user, isSharing, watchId, userWentOfflineManually, isSigningOut, permission, requestPermission, startWatching])

  const handleLocationToggle = async () => {
    if (!user?.id) return

    try {
      setLoading(true)

      if (isSharing) {
        // Stop sharing - Use the hook's stopWatching with offline flag
        console.log('🛑 Stopping location sharing - going offline...')
        if (watchId) {
          await stopWatching(watchId, true) // true = go offline
          setWatchId(null)
        }
        
        // Mark that user manually went offline
        setUserWentOfflineManually(true)
        
        // Force immediate state sync check after button press
        setTimeout(() => {
          console.log('🔄 Force checking location sharing state after stop button...')
          // The useLocation hook should automatically detect the change
        }, 500)

        console.log('✅ Location sharing stopped - user marked offline')
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
          // Clear manual offline flag when user manually starts sharing
          setUserWentOfflineManually(false)
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
      setIsSigningOut(true) // Set signing out state to prevent UI flicker
      
      // Remember the user's current state before any cleanup
      const wasManuallyOffline = userWentOfflineManually
      
      // Stop any active location tracking first
      if (isSharing && watchId) {
        console.log('🛑 Stopping active location tracking before logout...')
        await stopWatching(watchId, true) // true = mark offline
        setWatchId(null)
      }
      
      // Always delete user location record on logout (regardless of sharing state)
      if (user?.id) {
        console.log('🗑️ Deleting user location record on logout...')
        await supabase
          .from('user_locations')
          .delete()
          .eq('user_id', user.id)
        console.log('✅ User location record deleted')
      }
      
      // Use the comprehensive cleanup method but prevent it from restarting
      if (cleanup) {
        console.log('🧹 Running comprehensive cleanup...')
        await cleanup()
      }
      
      // Clear states after cleanup to prevent any restart attempts
      setUserWentOfflineManually(false)
      setWatchId(null)

      await supabase.auth.signOut()
      console.log('✅ Sign out completed, redirecting to login...')
      router.push('/login')
    } catch (error) {
      console.error('Error signing out:', error)
      setIsSigningOut(false) // Reset state if error occurs
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
              disabled={isSigningOut}
              className={`inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-200`}
            >
              <LogOut className="h-4 w-4 mr-2" />
              {isSigningOut ? 'Signing Out...' : 'Sign Out'}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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
              Location Sharing Control
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              You have full control over your location sharing. You can start or stop sharing at any time, 
              even when the app is running in the background. Use the button below or the notification controls.
            </p>
            
            {/* Enhanced Status Display */}
            <div className="mb-6 p-4 rounded-lg border-2 border-dashed border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-3 ${
                    isSigningOut ? 'bg-yellow-500' : isSharing ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                  }`}></div>
                  <span className={`text-lg font-semibold ${
                    isSigningOut ? 'text-yellow-600' : isSharing ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {isSigningOut ? '🔄 SIGNING OUT...' : isSharing ? '🟢 ONLINE - ACTIVELY SHARING' : '🔴 OFFLINE - NOT SHARING'}
                  </span>
                </div>
                {isSharing && !isSigningOut && (
                  <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Tracking in background
                  </span>
                )}
              </div>
              {isSigningOut ? (
                <p className="text-sm text-gray-600 mt-2">
                  Stopping location tracking and signing out...
                </p>
              ) : isSharing ? (
                <p className="text-sm text-gray-600 mt-2">
                  Your location is being shared and will continue even when you minimize the app. 
                  You can go offline anytime using the button below.
                </p>
              ) : (
                <p className="text-sm text-gray-600 mt-2">
                  You are currently offline. Other users cannot see your location on the map.
                  Click the button below to come online and start sharing.
                </p>
              )}
            </div>
            
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
                disabled={loading || permission === 'denied' || isSigningOut}
                className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm ${
                  isSigningOut 
                    ? 'text-white bg-gray-500 cursor-not-allowed' 
                    : isSharing
                    ? 'text-white bg-red-600 hover:bg-red-700 focus:ring-red-500'
                    : 'text-white bg-green-600 hover:bg-green-700 focus:ring-green-500'
                } disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200`}
              >
                <MapPin className="h-5 w-5 mr-2" />
                {isSigningOut 
                  ? '🔄 Signing Out...' 
                  : isSharing 
                  ? '🔴 Go Offline' 
                  : '📍 Start Sharing Location'}
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
