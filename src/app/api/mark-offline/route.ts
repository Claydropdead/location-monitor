import { createServer } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const { user_id, is_active, timestamp } = JSON.parse(body)
    
    if (!user_id) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    const supabase = await createServer()
    
    // Mark user as offline
    const { error } = await supabase
      .from('user_locations')
      .update({ 
        is_active: false,
        timestamp: timestamp || new Date().toISOString()
      })
      .eq('user_id', user_id)
      .eq('is_active', true)

    if (error) {
      console.error('Error marking user offline:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    console.log('✅ User marked offline via API:', user_id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
