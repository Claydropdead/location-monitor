'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DatabaseTest() {
  const [status, setStatus] = useState('Testing...')
  const [users, setUsers] = useState<unknown[]>([])
  const supabase = createClient()

  const testDatabase = async () => {
    try {
      // Test basic connection
      const { data: authUser } = await supabase.auth.getUser()
      console.log('Auth user:', authUser)

      // Test users table
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .limit(5)

      if (usersError) {
        console.error('Users table error:', usersError)
        setStatus(`Users table error: ${usersError.message}`)
        return
      }

      console.log('Users data:', usersData)
      setUsers(usersData || [])

      // Test user_locations table
      const { data: locationsData, error: locationsError } = await supabase
        .from('user_locations')
        .select('*')
        .limit(5)

      if (locationsError) {
        console.error('Locations table error:', locationsError)
        setStatus(`Locations table error: ${locationsError.message}`)
        return
      }

      console.log('Locations data:', locationsData)
      setStatus(`✅ Database connected! Users: ${usersData?.length || 0}, Locations: ${locationsData?.length || 0}`)

    } catch (error) {
      console.error('Database test error:', error)
      setStatus(`❌ Database error: ${error}`)
    }
  }

  useEffect(() => {
    testDatabase()
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Database Test</h1>
      
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <strong>Status:</strong> {status}
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Environment Variables</h2>
        <p>URL: {process.env.NEXT_PUBLIC_SUPABASE_URL || 'Missing'}</p>
        <p>Key: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing'}</p>
      </div>

      {users.length > 0 && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Users in Database</h2>
          <div className="bg-gray-50 p-4 rounded">
            <pre>{JSON.stringify(users, null, 2)}</pre>
          </div>
        </div>
      )}

      <button
        onClick={testDatabase}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Retest Database
      </button>
    </div>
  )
}
