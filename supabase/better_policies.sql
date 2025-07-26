-- Better RLS policies that avoid recursion
-- Run this AFTER testing with RLS disabled

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies first
DROP POLICY IF EXISTS "Enable read access for users based on user_id" ON users;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;
DROP POLICY IF EXISTS "Enable read access for admins" ON users;
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON user_locations;
DROP POLICY IF EXISTS "Enable read access for users based on user_id" ON user_locations;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON user_locations;
DROP POLICY IF EXISTS "Enable read access for admins on locations" ON user_locations;

-- Simple policies for users table
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Admin policy using a function to avoid recursion
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM users WHERE id = user_id;
  RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin access to all users
CREATE POLICY "users_admin_all" ON users FOR SELECT USING (is_admin(auth.uid()));

-- Location policies
CREATE POLICY "locations_insert_own" ON user_locations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "locations_select_own" ON user_locations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "locations_update_own" ON user_locations FOR UPDATE USING (auth.uid() = user_id);

-- Admin access to all locations
CREATE POLICY "locations_admin_all" ON user_locations FOR SELECT USING (is_admin(auth.uid()));
