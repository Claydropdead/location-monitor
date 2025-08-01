'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Clear any existing session on component mount
  useEffect(() => {
    const clearSession = async () => {
      try {
        // Clear any existing session to avoid conflicts
        await supabase.auth.signOut()
      } catch (error) {
        // Ignore signOut errors during initialization
        console.log('Session clear on mount:', error)
      }
    }
    clearSession()
  }, [supabase])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // First, ensure we're signed out to avoid session conflicts
      await supabase.auth.signOut()
      
      // Then attempt to sign in
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })

      if (signInError) {
        setError(signInError.message)
        return
      }

      if (data.user) {
        // Wait a moment for the session to be established
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        try {
          // Check if this is an admin email first
          const adminEmails = ['admin@locationmonitor.com', 'admin@example.com']
          const isAdminEmail = adminEmails.includes(email.trim().toLowerCase())
          const assignedRole = isAdminEmail ? 'admin' : 'user'
          
          console.log('Setting up profile for:', email, 'with role:', assignedRole)

          // First, try to create/update the user profile using the database function
          // This will work even with RLS because the function has elevated privileges
          const { data: profileResult, error: functionError } = await supabase
            .rpc('create_user_profile', {
              user_id: data.user.id,
              user_email: data.user.email || email.trim(),
              user_name: data.user.user_metadata?.name || data.user.email || email.trim(),
              user_role: assignedRole  // Use the determined role instead of hardcoded 'user'
            })

          if (functionError) {
            console.warn('Profile function warning:', functionError)
          } else {
            console.log('Profile created/updated successfully:', profileResult)
          }

          // Now try to get the user role using the safe function
          const { data: userRole, error: roleError } = await supabase
            .rpc('get_user_role')

          if (roleError) {
            console.error('Role check error:', roleError)
            // For admin emails, allow access even if role check fails
            const adminEmails = ['admin@locationmonitor.com', 'admin@example.com']
            const isAdminEmail = adminEmails.includes(email.trim().toLowerCase())
            
            if (isAdminEmail) {
              console.log('Admin email detected, proceeding with admin access')
              window.location.href = '/admin'
              return
            } else {
              setError('Failed to verify user role. Please try again.')
              await supabase.auth.signOut()
              return
            }
          }

          console.log('User role from database:', userRole)

          // Route based on role - use the role we just set if the database query had issues
          const finalRole = userRole || assignedRole
          
          if (finalRole === 'admin') {
            console.log('Redirecting to admin dashboard')
            window.location.href = '/admin'
          } else if (finalRole === 'user') {
            console.log('Redirecting to user dashboard')
            window.location.href = '/dashboard'
          } else {
            console.log('Unknown role, checking admin emails again')
            // If not admin or user, try to promote admin emails
            const adminEmails = ['admin@locationmonitor.com', 'admin@example.com']
            const isAdminEmail = adminEmails.includes(email.trim().toLowerCase())
            
            if (isAdminEmail) {
              // Try to set up admin using the dedicated function
              try {
                const { data: adminResult, error: adminFunctionError } = await supabase
                  .rpc('setup_admin_user', {
                    admin_email: email.trim()
                  })
                
                if (!adminFunctionError && adminResult) {
                  console.log('Successfully set up admin via function')
                  window.location.href = '/admin'
                  return
                }
              } catch (adminError) {
                console.warn('Admin function error:', adminError)
              }

              setError('Failed to set up admin access. Please contact administrator.')
              await supabase.auth.signOut()
            } else {
              // Regular user without proper role, redirect to dashboard
              console.log('User without specific role, defaulting to dashboard')
              window.location.href = '/dashboard'
            }
          }
        } catch (profileError) {
          console.error('Profile check error:', profileError)
          setError('Failed to verify admin privileges. Please try again.')
          await supabase.auth.signOut()
        }
      }
    } catch (loginError) {
      console.error('Login error:', loginError)
      setError('An unexpected error occurred during login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Admin Login
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Administrative access to location monitoring dashboard
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Admin email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in as Admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
