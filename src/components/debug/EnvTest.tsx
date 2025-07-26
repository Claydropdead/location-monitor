'use client'

import { useEffect } from 'react'

export default function EnvTest() {
  useEffect(() => {
    console.log('Environment Variables:')
    console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing')
  }, [])

  return (
    <div className="p-4">
      <h2>Environment Test</h2>
      <p>URL: {process.env.NEXT_PUBLIC_SUPABASE_URL || 'Missing'}</p>
      <p>Key: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing'}</p>
    </div>
  )
}
