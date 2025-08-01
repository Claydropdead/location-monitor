-- Quick Admin Setup for Location Monitor
-- Run this if you're getting 500 errors and need immediate admin access

-- First, let's ensure the basic tables exist
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
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

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

-- Create basic admin check function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Create basic RLS policies that allow admin access
DROP POLICY IF EXISTS "Admin full access users" ON users;
CREATE POLICY "Admin full access users" ON users
  FOR ALL 
  TO authenticated
  USING (is_admin() OR auth.uid() = id)
  WITH CHECK (is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "Admin full access locations" ON user_locations;
CREATE POLICY "Admin full access locations" ON user_locations
  FOR ALL 
  TO authenticated
  USING (is_admin() OR auth.uid() = user_id)
  WITH CHECK (is_admin() OR auth.uid() = user_id);

-- Grant permissions
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- Emergency admin creation function
CREATE OR REPLACE FUNCTION make_user_admin(user_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    auth_user_id uuid;
    result_user public.users;
BEGIN
    -- Get the user ID from auth.users
    SELECT id INTO auth_user_id FROM auth.users WHERE email = user_email LIMIT 1;
    
    IF auth_user_id IS NULL THEN
        RAISE EXCEPTION 'No auth user found with email: %. Please create the auth user first.', user_email;
    END IF;
    
    -- Insert or update user profile with admin role
    INSERT INTO public.users (id, email, name, role, created_at, updated_at)
    VALUES (
        auth_user_id,
        user_email,
        'Admin User',
        'admin',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) 
    DO UPDATE SET 
        role = 'admin',
        updated_at = NOW()
    RETURNING * INTO result_user;
    
    RAISE NOTICE 'User % has been made admin', user_email;
    RETURN row_to_json(result_user);
END;
$$;

GRANT EXECUTE ON FUNCTION make_user_admin TO authenticated;

-- Instructions
DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Quick Admin Setup Complete!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'To make yourself admin:';
    RAISE NOTICE '1. Sign up/login with your email first';
    RAISE NOTICE '2. Then run: SELECT make_user_admin(''your-email@example.com'');';
    RAISE NOTICE '3. Replace your-email@example.com with your actual email';
    RAISE NOTICE '===========================================';
END $$;
