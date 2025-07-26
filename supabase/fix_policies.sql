-- First, let's drop the problematic policies and recreate them correctly

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can insert their own location" ON user_locations;
DROP POLICY IF EXISTS "Users can view their own location" ON user_locations;
DROP POLICY IF EXISTS "Users can update their own location" ON user_locations;
DROP POLICY IF EXISTS "Admins can view all locations" ON user_locations;

-- Recreate policies without recursion issues

-- RLS Policies for users table (simplified to avoid recursion)
CREATE POLICY "Enable read access for users based on user_id" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Enable update for users based on user_id" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Enable insert for authenticated users only" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admin policy - check if current user has admin role in database
CREATE POLICY "Enable read access for admins" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for user_locations table
CREATE POLICY "Enable insert for users based on user_id" ON user_locations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable read access for users based on user_id" ON user_locations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Enable update for users based on user_id" ON user_locations
  FOR UPDATE USING (auth.uid() = user_id);

-- Admin access to all locations - check if current user has admin role
CREATE POLICY "Enable read access for admins on locations" ON user_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
