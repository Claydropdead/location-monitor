'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TestPage() {
  const [debug, setDebug] = useState<{
    users: unknown[]
    locations: unknown[]
    currentUser: unknown
    error: string | null
  }>({
    users: [],
    locations: [],
    currentUser: null,
    error: null
  })

  useEffect(() => {
    testData()
  }, [])

  const testData = async () => {
    const supabase = createClient()
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      // Get all users
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
      
      // Get all locations
      const { data: locations, error: locationsError } = await supabase
        .from('user_locations')
        .select('*')
        .order('timestamp', { ascending: false })
      
      setDebug({
        users: users || [],
        locations: locations || [],
        currentUser: user,
        error: usersError?.message || locationsError?.message || null
      })
    } catch (err) {
      setDebug(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Unknown error' }))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Database Debug</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-3">Current User</h2>
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
              {JSON.stringify(debug.currentUser, null, 2)}
            </pre>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-3">Users ({debug.users.length})</h2>
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-64">
              {JSON.stringify(debug.users, null, 2)}
            </pre>
          </div>

          <div className="bg-white p-4 rounded-lg shadow md:col-span-2">
            <h2 className="text-lg font-semibold mb-3">User Locations ({debug.locations.length})</h2>
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-64">
              {JSON.stringify(debug.locations, null, 2)}
            </pre>
          </div>

          {debug.error && (
            <div className="bg-red-50 p-4 rounded-lg shadow md:col-span-2">
              <h2 className="text-lg font-semibold mb-3 text-red-800">Error</h2>
              <pre className="text-xs bg-red-100 p-2 rounded overflow-auto text-red-700">
                {JSON.stringify(debug.error, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="mt-6">
          <button
            onClick={testData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh Data
          </button>
        </div>
      </div>
    </div>
  )
}
