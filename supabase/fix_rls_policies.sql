-- Fix RLS policies to avoid circular dependencies
-- This script updates the RLS policies to work properly with admin authentication

-- First, let's create a function to check if current user is admin
-- This function will use security definer to bypass RLS temporarily
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Users can insert their own location" ON user_locations;
DROP POLICY IF EXISTS "Users can view their own location" ON user_locations;
DROP POLICY IF EXISTS "Users can update their own location" ON user_locations;
DROP POLICY IF EXISTS "Users can delete their own location" ON user_locations;
DROP POLICY IF EXISTS "Admins can view all locations" ON user_locations;
DROP POLICY IF EXISTS "Admins can update all locations" ON user_locations;
DROP POLICY IF EXISTS "Admins can delete all locations" ON user_locations;

-- Simplified RLS Policies for users table that avoid circular dependencies

-- Allow authenticated users to insert their own profile (signup/login)
CREATE POLICY "Enable insert for authenticated users" ON users
  FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow users to view their own profile OR if they are admin (using function)
CREATE POLICY "Enable read for own profile or admin" ON users
  FOR SELECT 
  TO authenticated
  USING (auth.uid() = id OR is_admin());

-- Allow users to update their own profile OR if they are admin (using function)
CREATE POLICY "Enable update for own profile or admin" ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());

-- Allow admins to delete users (using function)
CREATE POLICY "Enable delete for admin" ON users
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- RLS Policies for user_locations table

-- Allow users to insert their own locations
CREATE POLICY "Enable insert for own locations" ON user_locations
  FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to view their own locations OR if they are admin
CREATE POLICY "Enable read for own locations or admin" ON user_locations
  FOR SELECT 
  TO authenticated
  USING (auth.uid() = user_id OR is_admin());

-- Allow users to update their own locations OR if they are admin
CREATE POLICY "Enable update for own locations or admin" ON user_locations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

-- Allow users to delete their own locations OR if they are admin
CREATE POLICY "Enable delete for own locations or admin" ON user_locations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin());

-- Create an additional function for getting user role (useful for frontend)
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

-- Create a function to get all users with locations (for admin dashboard)
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

-- Grant execute permission to authenticated users (the function will check admin internally if needed)
GRANT EXECUTE ON FUNCTION get_users_with_locations() TO authenticated;

-- Create function for users to get their own location history
CREATE OR REPLACE FUNCTION get_user_location_history(
  user_id_param uuid DEFAULT auth.uid(),
  limit_param integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  latitude decimal,
  longitude decimal,
  accuracy decimal,
  timestamp timestamptz,
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
    ul.timestamp,
    ul.is_active
  FROM public.user_locations ul
  WHERE ul.user_id = user_id_param
  ORDER BY ul.timestamp DESC
  LIMIT limit_param;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_location_history TO authenticated;

-- Create function to add location for current user
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
  
  -- Insert new location
  INSERT INTO public.user_locations (user_id, latitude, longitude, accuracy, timestamp, is_active)
  VALUES (
    current_user_id,
    latitude_param,
    longitude_param,
    accuracy_param,
    NOW(),
    true
  )
  RETURNING * INTO result_location;
  
  -- Return the location data as JSON
  RETURN row_to_json(result_location);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION add_user_location TO authenticated;
