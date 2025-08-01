-- EMERGENCY SETUP - Run this first to fix immediate issues
-- This will create basic tables and functions needed for the app to work

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

-- Enable RLS but make it permissive for now
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Allow authenticated access" ON users;
DROP POLICY IF EXISTS "Allow authenticated locations" ON user_locations;

-- Create permissive policies for debugging
CREATE POLICY "Allow authenticated access" ON users
  FOR ALL TO authenticated 
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated locations" ON user_locations
  FOR ALL TO authenticated 
  USING (true) WITH CHECK (true);

-- Essential functions
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()),
    'user'
  );
$$;

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

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_profile TO authenticated;

-- Create initial admin if using admin email
DO $$
DECLARE
    admin_user_id uuid;
BEGIN
    -- Check if admin user exists in auth.users
    SELECT id INTO admin_user_id FROM auth.users WHERE email = 'admin@locationmonitor.com' LIMIT 1;
    
    IF admin_user_id IS NOT NULL THEN
        -- Create admin profile
        INSERT INTO public.users (id, email, name, role, created_at, updated_at)
        VALUES (
            admin_user_id,
            'admin@locationmonitor.com',
            'Admin User',
            'admin',
            NOW(),
            NOW()
        )
        ON CONFLICT (id) 
        DO UPDATE SET 
            role = 'admin',
            updated_at = NOW();
        
        RAISE NOTICE 'Admin profile created/updated for existing auth user';
    ELSE
        RAISE NOTICE 'No auth user found with admin email - sign up first';
    END IF;
END $$;

RAISE NOTICE 'Emergency setup complete! App should work now.';
