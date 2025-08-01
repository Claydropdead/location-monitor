-- Complete Location Monitor Database Setup
-- Run this script in Supabase SQL Editor to set up the entire database

-- =============================================
-- 1. TABLES AND INDEXES
-- =============================================

-- Create users table with additional profile information
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_locations table for real-time location tracking (one record per user)
CREATE TABLE IF NOT EXISTS user_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(8, 2),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_timestamp ON user_locations(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_locations_active ON user_locations(is_active);
CREATE INDEX IF NOT EXISTS idx_user_locations_user_timestamp ON user_locations(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id_latest ON user_locations(user_id, timestamp DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- =============================================
-- 2. ENABLE ROW LEVEL SECURITY
-- =============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 3. SECURITY FUNCTIONS
-- =============================================

-- Function to check if current user is admin (bypasses RLS)
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

-- Function to get user role safely
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()),
    'anonymous'
  );
$$;

-- Function to create/update user profiles
CREATE OR REPLACE FUNCTION create_user_profile(
    user_id uuid DEFAULT auth.uid(),
    user_email text DEFAULT NULL,
    user_name text DEFAULT NULL,
    user_role text DEFAULT 'user'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result_user public.users;
    auth_user_email text;
BEGIN
    -- Get email from auth.users if not provided
    IF user_email IS NULL THEN
        SELECT email INTO auth_user_email FROM auth.users WHERE id = user_id;
        user_email := auth_user_email;
    END IF;
    
    -- Set default name if not provided
    IF user_name IS NULL THEN
        user_name := COALESCE(user_email, 'User');
    END IF;
    
    -- Insert or update user profile
    INSERT INTO public.users (id, email, name, role, created_at, updated_at)
    VALUES (
        user_id,
        user_email,
        user_name,
        user_role,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) 
    DO UPDATE SET 
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        updated_at = NOW()
    RETURNING * INTO result_user;
    
    -- Return the user data as JSON
    RETURN row_to_json(result_user);
END;
$$;

-- Function to set up admin users
CREATE OR REPLACE FUNCTION setup_admin_user(
    admin_email text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result_user public.users;
    auth_user_id uuid;
BEGIN
    -- Get the user ID from auth.users
    SELECT id INTO auth_user_id FROM auth.users WHERE email = admin_email LIMIT 1;
    
    IF auth_user_id IS NULL THEN
        RAISE EXCEPTION 'No auth user found with email: %. Please create the auth user first.', admin_email;
    END IF;
    
    -- Insert or update user profile with admin role
    INSERT INTO public.users (id, email, name, role, created_at, updated_at)
    VALUES (
        auth_user_id,
        admin_email,
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
    
    -- Return the user data as JSON
    RETURN row_to_json(result_user);
END;
$$;

-- =============================================
-- 4. LOCATION FUNCTIONS
-- =============================================

-- Function for users to get their current location (single record per user)
CREATE OR REPLACE FUNCTION get_user_location_history(
  user_id_param uuid DEFAULT auth.uid(),
  limit_param integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  latitude decimal,
  longitude decimal,
  accuracy decimal,
  location_timestamp timestamptz,
  is_active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ul.id,
    ul.latitude,
    ul.longitude,
    ul.accuracy,
    ul.timestamp as location_timestamp,
    ul.is_active
  FROM public.user_locations ul
  WHERE ul.user_id = user_id_param
  ORDER BY ul.timestamp DESC
  LIMIT 1; -- Only return the single record for this user
$$;

-- Function to add/update location for current user (single record per user)
CREATE OR REPLACE FUNCTION add_user_location(
  latitude_param decimal,
  longitude_param decimal,
  accuracy_param decimal DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_location public.user_locations;
  current_user_id uuid := auth.uid();
BEGIN
  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = current_user_id) THEN
    RAISE EXCEPTION 'User profile not found. Please complete your profile first.';
  END IF;
  
  -- Insert or update location (only one record per user)
  INSERT INTO public.user_locations (user_id, latitude, longitude, accuracy, timestamp, is_active)
  VALUES (
    current_user_id,
    latitude_param,
    longitude_param,
    accuracy_param,
    NOW(),
    true
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    accuracy = EXCLUDED.accuracy,
    timestamp = NOW(),
    is_active = true
  RETURNING * INTO result_location;
  
  -- Return the location data as JSON
  RETURN row_to_json(result_location);
END;
$$;

-- Function for admin dashboard to get all users with locations
CREATE OR REPLACE FUNCTION get_users_with_locations()
RETURNS TABLE (
  user_id uuid,
  user_name text,
  user_email text,
  user_phone text,
  user_role text,
  latest_latitude decimal,
  latest_longitude decimal,
  latest_accuracy decimal,
  latest_timestamp timestamptz,
  is_active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (u.id)
    u.id as user_id,
    u.name as user_name,
    u.email as user_email,
    u.phone as user_phone,
    u.role as user_role,
    ul.latitude as latest_latitude,
    ul.longitude as latest_longitude,
    ul.accuracy as latest_accuracy,
    ul.timestamp as latest_timestamp,
    ul.is_active
  FROM public.users u
  LEFT JOIN public.user_locations ul ON u.id = ul.user_id
  ORDER BY u.id, ul.timestamp DESC NULLS LAST;
$$;

-- Function to delete user's location data (for sign out)
CREATE OR REPLACE FUNCTION delete_user_location(
  user_id_param uuid DEFAULT auth.uid()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete the user's location record
  DELETE FROM public.user_locations 
  WHERE user_id = user_id_param;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Return result
  RETURN json_build_object(
    'success', true,
    'deleted_count', deleted_count,
    'message', 'Location data deleted successfully'
  );
END;
$$;

-- =============================================
-- 5. GRANT PERMISSIONS
-- =============================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_profile TO authenticated;
GRANT EXECUTE ON FUNCTION setup_admin_user TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_location_history TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_location TO authenticated;
GRANT EXECUTE ON FUNCTION get_users_with_locations TO authenticated;

-- =============================================
-- 6. ROW LEVEL SECURITY POLICIES
-- =============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable read for own profile or admin" ON users;
DROP POLICY IF EXISTS "Enable update for own profile or admin" ON users;
DROP POLICY IF EXISTS "Enable delete for admin" ON users;

DROP POLICY IF EXISTS "Users can insert their own location" ON user_locations;
DROP POLICY IF EXISTS "Users can view their own location" ON user_locations;
DROP POLICY IF EXISTS "Users can update their own location" ON user_locations;
DROP POLICY IF EXISTS "Users can delete their own location" ON user_locations;
DROP POLICY IF EXISTS "Admins can view all locations" ON user_locations;
DROP POLICY IF EXISTS "Admins can update all locations" ON user_locations;
DROP POLICY IF EXISTS "Admins can delete all locations" ON user_locations;
DROP POLICY IF EXISTS "Enable insert for own locations" ON user_locations;
DROP POLICY IF EXISTS "Enable read for own locations or admin" ON user_locations;
DROP POLICY IF EXISTS "Enable update for own locations or admin" ON user_locations;
DROP POLICY IF EXISTS "Enable delete for own locations or admin" ON user_locations;

-- Users table policies
CREATE POLICY "Enable insert for authenticated users" ON users
  FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable read for own profile or admin" ON users
  FOR SELECT 
  TO authenticated
  USING (auth.uid() = id OR is_admin());

CREATE POLICY "Enable update for own profile or admin" ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());

CREATE POLICY "Enable delete for admin" ON users
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- User locations table policies
CREATE POLICY "Enable insert for own locations" ON user_locations
  FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable read for own locations or admin" ON user_locations
  FOR SELECT 
  TO authenticated
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Enable update for own locations or admin" ON user_locations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

CREATE POLICY "Enable delete for own locations or admin" ON user_locations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin());

-- =============================================
-- 7. AUTO-ADMIN SETUP FUNCTION
-- =============================================

-- Function to automatically set admin role for specific emails
CREATE OR REPLACE FUNCTION auto_setup_admin_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    admin_emails text[] := ARRAY[
        'admin@locationmonitor.com',
        'admin@example.com',
        'patrick@example.com'
    ];
    user_role text := 'user';
BEGIN
    -- Check if the email should be admin
    IF NEW.email = ANY(admin_emails) THEN
        user_role := 'admin';
    END IF;
    
    -- Insert user profile
    INSERT INTO public.users (id, email, name, role, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        user_role,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) 
    DO UPDATE SET 
        email = EXCLUDED.email,
        name = COALESCE(NEW.raw_user_meta_data->>'name', EXCLUDED.name),
        role = user_role,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$;

-- Create trigger to auto-setup user profiles on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION auto_setup_admin_on_signup();

-- =============================================
-- 8. EMERGENCY ADMIN CREATION
-- =============================================

-- Function to create admin without needing existing auth user
CREATE OR REPLACE FUNCTION create_emergency_admin(
    admin_email text,
    admin_password text DEFAULT 'admin123!'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    auth_user_id uuid;
    result_user public.users;
BEGIN
    -- First check if auth user exists
    SELECT id INTO auth_user_id FROM auth.users WHERE email = admin_email LIMIT 1;
    
    -- If auth user doesn't exist, we'll create a placeholder profile anyway
    -- The admin will need to sign up normally but will get admin role automatically
    IF auth_user_id IS NULL THEN
        -- Generate a UUID for the placeholder
        auth_user_id := gen_random_uuid();
        
        RAISE NOTICE 'Created placeholder admin profile. Admin must sign up with email: %', admin_email;
    END IF;
    
    -- Insert or update user profile with admin role
    INSERT INTO public.users (id, email, name, role, created_at, updated_at)
    VALUES (
        auth_user_id,
        admin_email,
        'Admin User',
        'admin',
        NOW(),
        NOW()
    )
    ON CONFLICT (email) 
    DO UPDATE SET 
        role = 'admin',
        updated_at = NOW()
    RETURNING * INTO result_user;
    
    -- Return the user data as JSON
    RETURN row_to_json(result_user);
END;
$$;

-- Grant execute permission for emergency admin creation
GRANT EXECUTE ON FUNCTION create_emergency_admin TO authenticated;
GRANT EXECUTE ON FUNCTION auto_setup_admin_on_signup TO authenticated;

-- =============================================
-- 9. CREATE DEFAULT ADMIN IF NONE EXISTS
-- =============================================

-- Create a default admin profile that will be activated when someone signs up
DO $$
BEGIN
    -- Only create if no admin exists
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE role = 'admin') THEN
        PERFORM create_emergency_admin('admin@locationmonitor.com');
        RAISE NOTICE 'Created emergency admin profile for: admin@locationmonitor.com';
        RAISE NOTICE 'Sign up with this email to activate admin access';
    END IF;
END $$;

-- =============================================
-- 10. SETUP COMPLETE MESSAGE
-- =============================================

DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Location Monitor Database Setup Complete!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Sign up with email: admin@locationmonitor.com';
    RAISE NOTICE '2. This email will automatically get admin role';
    RAISE NOTICE '3. Users with other emails will get user role';
    RAISE NOTICE '4. All functions and policies are now active';
    RAISE NOTICE '5. Emergency admin profile created and ready';
    RAISE NOTICE '===========================================';
END $$;
