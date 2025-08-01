-- Location Monitor Database Schema
-- This schema creates the necessary tables, policies, and functions for the location monitoring system

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

-- Create user_locations table for real-time location tracking
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_timestamp ON user_locations(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_locations_active ON user_locations(is_active);
CREATE INDEX IF NOT EXISTS idx_user_locations_user_timestamp ON user_locations(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
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

-- RLS Policies for users table
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all users" ON users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for user_locations table
CREATE POLICY "Users can insert their own location" ON user_locations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own location" ON user_locations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own location" ON user_locations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own location" ON user_locations
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all locations" ON user_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all locations" ON user_locations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete all locations" ON user_locations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on users table
DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to clean up old location records (optional)
CREATE OR REPLACE FUNCTION public.cleanup_old_locations()
RETURNS void AS $$
BEGIN
  -- Delete location records older than 30 days
  DELETE FROM user_locations 
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view for active user locations (frequently used query)
CREATE OR REPLACE VIEW active_user_locations AS
SELECT 
  ul.*,
  u.name,
  u.email,
  u.phone,
  u.role
FROM user_locations ul
JOIN users u ON ul.user_id = u.id
WHERE ul.is_active = true
  AND ul.timestamp > NOW() - INTERVAL '2 minutes';

-- Enable real-time subscriptions (only if not already added)
DO $$
BEGIN
    -- Add user_locations table to realtime publication if not already added
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'user_locations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE user_locations;
        RAISE NOTICE 'Added user_locations to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'user_locations already in supabase_realtime publication';
    END IF;
    
    -- Add users table to realtime publication if not already added
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'users'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE users;
        RAISE NOTICE 'Added users to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'users already in supabase_realtime publication';
    END IF;
END $$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE users TO anon, authenticated;
GRANT ALL ON TABLE user_locations TO anon, authenticated;
GRANT SELECT ON active_user_locations TO authenticated;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Create helpful comments
COMMENT ON TABLE users IS 'User profiles with role-based access';
COMMENT ON TABLE user_locations IS 'Real-time location tracking data';
COMMENT ON COLUMN users.role IS 'User role: user or admin';
COMMENT ON COLUMN user_locations.is_active IS 'Whether user is actively sharing location';
COMMENT ON COLUMN user_locations.accuracy IS 'GPS accuracy in meters';
COMMENT ON INDEX idx_user_locations_user_timestamp IS 'Optimizes queries for user location history';
COMMENT ON VIEW active_user_locations IS 'Currently active users with recent location updates';

-- Create sample admin account
-- Note: This creates a user in auth.users and then sets their role to admin
DO $$
DECLARE
    admin_user_id UUID;
BEGIN
    -- Insert into auth.users (this will trigger the handle_new_user function)
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        'admin@locationmonitor.com',
        crypt('admin123456', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    ) RETURNING id INTO admin_user_id;
    
    -- Update the user role to admin in the users table
    UPDATE users SET role = 'admin' WHERE id = admin_user_id;
    
    -- Log the creation
    RAISE NOTICE 'Sample admin account created with email: admin@locationmonitor.com and password: admin123456';
    
EXCEPTION 
    WHEN unique_violation THEN
        RAISE NOTICE 'Admin account already exists with email: admin@locationmonitor.com';
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating admin account: %', SQLERRM;
END $$;
