'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@/types'
import { Users, MapPin, Clock, Signal, LogOut, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import RealtimeMap from '@/components/map/RealtimeMap'

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [stats, setStats] = useState({
    totalUsers: 0,
    onlineUsers: 0,
    activeUsers: 0
  })
  
  const supabase = createClient()
  const router = useRouter()

  // Debounce mechanism to prevent rapid stats updates
  const debounceStatsRef = useRef<NodeJS.Timeout | null>(null)
  
  const debouncedSetStats = useCallback((newStats: typeof stats) => {
    if (debounceStatsRef.current) {
      clearTimeout(debounceStatsRef.current)
    }
    
    debounceStatsRef.current = setTimeout(() => {
      setStats(newStats)
      setLastUpdate(new Date())
    }, 2000) // Increased to 2 seconds debounce for stats to reduce flickering
  }, [])

  useEffect(() => {
    const initializeData = async () => {
      await getUser()
      await getStats()
    }
    
    initializeData()
    
    // Set up real-time subscription for stats updates
    const statsSubscription = supabase
      .channel('admin_stats_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_locations'
        },
        () => {
          console.log('📊 Stats update triggered by location change')
          // Add delay to prevent rapid updates
          setTimeout(() => {
            getStats()
          }, 2000) // Increased delay to reduce flickering
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users'
        },
        () => {
          console.log('👥 Stats update triggered by user change')
          // Add delay to prevent rapid updates
          setTimeout(() => {
            getStats()
          }, 2000) // Increased delay to reduce flickering
        }
      )
      .subscribe((status) => {
        console.log('Admin stats subscription status:', status)
      })
    
    // Reduce backup refresh frequency to prevent flickering (every 60 seconds)
    const interval = setInterval(() => {
      console.log('📊 Periodic stats refresh')
      getStats()
    }, 60000)
    
    return () => {
      statsSubscription.unsubscribe()
      clearInterval(interval)
    }
  }, [supabase])

  const getUser = async () => {
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
        if (profile.role !== 'admin') {
          router.push('/dashboard')
          return
        }
        setUser(profile)
      }
    } catch (error) {
      console.error('Error fetching user:', error)
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  const getStats = async () => {
    try {
      setRefreshing(true)
      
      // Total users
      const { count: totalUsers } = await supabase
        .from('users')
        .select('id', { count: 'exact' })
        .neq('role', 'admin')

      // Online users (users who have updated their location in the last 2 minutes)
      // More realistic timeframe since our service updates every 45 seconds
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const { count: onlineUsers } = await supabase
        .from('user_locations')
        .select('user_id', { count: 'exact' })
        .gte('timestamp', twoMinutesAgo)

      // Active users (actively sharing location AND recently updated)
      const { count: activeUsers } = await supabase
        .from('user_locations')
        .select('user_id', { count: 'exact' })
        .eq('is_active', true)
        .gte('timestamp', twoMinutesAgo)

      const newStats = {
        totalUsers: totalUsers || 0,
        onlineUsers: onlineUsers || 0,
        activeUsers: activeUsers || 0
      }

      // Use immediate update for initial load, debounced for subsequent updates
      if (loading) {
        setStats(newStats)
        setLastUpdate(new Date())
      } else {
        debouncedSetStats(newStats)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleRefresh = async () => {
    console.log('🔄 Manual refresh triggered')
    await getStats()
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
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-600">Real-time user location monitoring</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">Welcome, {user?.name}</span>
              <div className="text-xs text-gray-400">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </div>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Users className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Total Users
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {stats.totalUsers}
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
                    <Signal className="h-8 w-8 text-green-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Online Now
                      </dt>
                      <dd className="text-lg font-medium text-green-600">
                        {stats.onlineUsers}
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
                    <MapPin className="h-8 w-8 text-blue-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Sharing Location
                      </dt>
                      <dd className="text-lg font-medium text-blue-600">
                        {stats.activeUsers}
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
                    <Clock className="h-8 w-8 text-indigo-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Last Updated
                      </dt>
                      <dd className="text-lg font-medium text-indigo-600">
                        {new Date().toLocaleTimeString()}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Map - Much larger and focused on Mindoro */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Mindoro Real-time Location Monitor
                  </h3>
                  <p className="text-sm text-gray-600">Live tracking of users in Mindoro area</p>
                </div>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
                      Online (active within 5 min)
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-gray-400 rounded-full mr-2"></div>
                      Offline (inactive 5+ min)
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Much larger map container - full screen height minus header */}
              <div className="h-[calc(100vh-400px)] min-h-[600px] rounded-lg overflow-hidden border border-gray-200 shadow-inner">
                <RealtimeMap />
              </div>
              
              <div className="mt-4 text-sm text-gray-500 bg-blue-50 p-3 rounded">
                <p>
                  <strong>Map Features:</strong> 
                  • Hover over markers for user details • Zoom in/out with mouse wheel • 
                  Drag to pan around Mindoro • Green markers = active within 5 minutes • 
                  Gray markers = inactive for 5+ minutes • Click markers for detailed popup with contact info
                </p>
                <p className="mt-2">
                  <strong>Heartbeat System:</strong> 
                  • Stationary users send heartbeat every 3 minutes to stay online • 
                  • Movement updates location immediately • 
                  • Users marked offline after 5 minutes of no activity/heartbeat
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
