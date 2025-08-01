'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocationTracking } from '@/hooks/useLocationTracking'
import { MapPin, RefreshCw, Clock, Navigation, AlertCircle, CheckCircle, Share2, Activity } from 'lucide-react'

export default function UserDashboard() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [autoTracking, setAutoTracking] = useState(false)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null)
  const supabase = createClient()

  const {
    currentLocation,
    locationHistory,
    error: locationError,
    permissionStatus,
    trackLocationOnce,
    fetchLocationHistory,
    requestLocationPermission,
    clearError
  } = useLocationTracking()

  // Get user data
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
          console.error('Auth error:', authError)
          return
        }

        setUser(user)

        // Try to create/get user profile using the RLS-safe function
        try {
          const { data: profileResult, error: profileFunctionError } = await supabase
            .rpc('create_user_profile', {
              user_id: user.id,
              user_email: user.email,
              user_name: user.user_metadata?.name || user.email,
              user_role: 'user'
            })

          if (profileFunctionError) {
            console.error('Profile function error:', profileFunctionError)
            // Fallback: try direct query
            const { data: userProfile, error: directQueryError } = await supabase
              .from('users')
              .select('*')
              .eq('id', user.id)
              .single()

            if (directQueryError) {
              console.error('Direct query error:', directQueryError)
              // Create a basic profile object if everything fails
              setProfile({
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || user.email || 'User',
                role: 'user'
              })
            } else {
              setProfile(userProfile)
            }
          } else {
            console.log('Profile function success:', profileResult)
            setProfile(profileResult)
          }
        } catch (profileError) {
          console.error('Profile setup error:', profileError)
          // Create a basic profile object as fallback
          setProfile({
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name || user.email || 'User',
            role: 'user'
          })
        }
      } catch (err) {
        console.error('Error getting user:', err)
      } finally {
        setLoading(false)
      }
    }

    getUser()
  }, [supabase])

  // Fetch location history on mount
  useEffect(() => {
    if (user) {
      fetchLocationHistory()
    }
  }, [user, fetchLocationHistory])

  // Auto tracking every 30 seconds with high accuracy and retry logic
  useEffect(() => {
    let intervalId: NodeJS.Timeout

    if (autoTracking && permissionStatus === 'granted') {
      // Track immediately when starting
      trackLocationOnce().then(() => {
        setLastUpdateTime(new Date())
      }).catch((error) => {
        console.error('Initial tracking failed:', error)
      })

      // Then track every 30 seconds with high accuracy
      intervalId = setInterval(async () => {
        try {
          console.log('Auto-tracking: Getting high-accuracy location...')
          await trackLocationOnce()
          setLastUpdateTime(new Date())
          console.log('Auto-tracking: Location update completed')
        } catch (error) {
          console.error('Auto tracking error:', error)
          // Continue trying even if one attempt fails
        }
      }, 30000) // 30 seconds
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [autoTracking, permissionStatus, trackLocationOnce])

  const handleSignOut = async () => {
    try {
      // First, delete the user's location data
      console.log('Deleting location data on sign out...')
      const { error: deleteError } = await supabase
        .from('user_locations')
        .delete()
        .eq('user_id', user?.id)

      if (deleteError) {
        console.error('Error deleting location data:', deleteError)
        // Continue with sign out even if delete fails
      } else {
        console.log('Location data deleted successfully')
      }

      // Then sign out
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (error) {
      console.error('Error during sign out:', error)
      // Force sign out even if there's an error
      await supabase.auth.signOut()
      window.location.href = '/'
    }
  }

  const handleStartSharing = async () => {
    if (permissionStatus !== 'granted') {
      await requestLocationPermission()
      return
    }
    setAutoTracking(true)
  }

  const handleStopSharing = () => {
    setAutoTracking(false)
    setLastUpdateTime(null)
  }

  const formatTime = (timestamp: string | Date) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
    return date.toLocaleString()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Location Sharing</h1>
              <p className="text-sm text-gray-600">Welcome, {profile?.name || user?.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Main Sharing Control */}
          <div className="bg-white rounded-lg shadow p-8">
            <div className="text-center">
              <Share2 className="mx-auto h-16 w-16 text-indigo-600 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Location Sharing</h2>
              <p className="text-gray-600 mb-6">
                Share your location automatically with administrators every 30 seconds
              </p>

              {/* Permission Status */}
              <div className="mb-6">
                {permissionStatus === 'granted' ? (
                  <div className="flex items-center justify-center space-x-2 text-green-700">
                    <CheckCircle className="h-5 w-5" />
                    <span>Location permission granted</span>
                  </div>
                ) : permissionStatus === 'denied' ? (
                  <div className="flex items-center justify-center space-x-2 text-red-700">
                    <AlertCircle className="h-5 w-5" />
                    <span>Location permission denied - please enable in browser settings</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2 text-yellow-700">
                    <AlertCircle className="h-5 w-5" />
                    <span>Location permission required</span>
                  </div>
                )}
              </div>

              {/* Error Display */}
              {locationError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex justify-center">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <div className="ml-3">
                      <p className="text-sm text-red-700">{locationError}</p>
                      <button
                        onClick={clearError}
                        className="mt-1 text-xs text-red-600 hover:text-red-500"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Main Action Button */}
              {!autoTracking ? (
                <button
                  onClick={handleStartSharing}
                  disabled={permissionStatus === 'denied'}
                  className="w-full max-w-xs mx-auto flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Activity className="h-5 w-5 mr-2" />
                  Start Sharing Location
                </button>
              ) : (
                <button
                  onClick={handleStopSharing}
                  className="w-full max-w-xs mx-auto flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                >
                  <Activity className="h-5 w-5 mr-2" />
                  Stop Sharing Location
                </button>
              )}
            </div>
          </div>

          {/* Status Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sharing Status */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Sharing Status</h3>
              
              {autoTracking ? (
                <div className="space-y-3">
                  <div className="flex items-center text-green-700">
                    <div className="h-3 w-3 bg-green-500 rounded-full mr-3 animate-pulse"></div>
                    <span className="font-medium">Active - Sharing every 30 seconds</span>
                  </div>
                  
                  {lastUpdateTime && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="h-4 w-4 mr-2" />
                      <span>Last update: {formatTime(lastUpdateTime)}</span>
                    </div>
                  )}
                  
                  {currentLocation && (
                    <div className="text-sm text-gray-600 space-y-2">
                      <div className="flex items-center">
                        <MapPin className="h-4 w-4 mr-2" />
                        <span>High-accuracy GPS tracking active</span>
                      </div>
                      <div className="flex items-center">
                        <Navigation className="h-4 w-4 mr-2" />
                        <span className={`font-medium ${
                          currentLocation.accuracy <= 20 ? 'text-green-600' :
                          currentLocation.accuracy <= 50 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          Accuracy: ±{Math.round(currentLocation.accuracy)}m
                          {currentLocation.accuracy <= 20 && ' (Excellent)'}
                          {currentLocation.accuracy > 20 && currentLocation.accuracy <= 50 && ' (Good)'}
                          {currentLocation.accuracy > 50 && ' (Poor)'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {currentLocation.accuracy > 50 ? 
                          'Move to an open area for better GPS signal' :
                          'GPS signal quality is good'
                        }
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center text-gray-500">
                  <div className="h-3 w-3 bg-gray-300 rounded-full mr-3"></div>
                  <span>Location sharing is stopped</span>
                </div>
              )}
            </div>

            {/* History Summary */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Current Location Status</h3>
                <button
                  onClick={fetchLocationHistory}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              
              <div className="space-y-2">
                {locationHistory.length > 0 ? (
                  <>
                    <div className="text-2xl font-bold text-indigo-600">
                      Active
                    </div>
                    <div className="text-sm text-gray-600">
                      Location sharing is active
                    </div>
                    <div className="text-xs text-gray-500 mt-3">
                      Last update: {formatTime(locationHistory[0]?.location_timestamp)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-gray-400">
                      No Location
                    </div>
                    <div className="text-sm text-gray-600">
                      Start sharing to set your location
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Information */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-medium text-blue-900 mb-2">High-Precision GPS Tracking</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Advanced GPS with multiple accuracy attempts (targets &lt;20m accuracy)</li>
              <li>• Intelligent accuracy filtering - rejects readings &gt;100m</li>
              <li>• Your location record is continuously updated in real-time</li>
              <li>• Automatic retry system for optimal GPS signal quality</li>
              <li>• Visual accuracy indicators (Excellent/Good/Poor)</li>
              <li>• Only authorized administrators can view your location</li>
              <li>• You can start or stop sharing at any time</li>
            </ul>
            <div className="mt-3 p-2 bg-blue-100 rounded text-xs text-blue-700">
              💡 <strong>Tip:</strong> For best accuracy, use outdoors with clear sky view. Indoor accuracy may be limited.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
