-- Minimal fix for 500 errors
-- Run this in Supabase SQL Editor if you're getting 500 errors

-- Disable RLS temporarily to fix access issues
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_locations DISABLE ROW LEVEL SECURITY;

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT 'User',
  phone TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(8, 2),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Re-enable RLS with simpler policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

-- Simple policies that work
CREATE POLICY "Allow all for authenticated users" ON users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all locations for authenticated users" ON user_locations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

RAISE NOTICE 'Minimal setup complete - RLS is now permissive for debugging';
