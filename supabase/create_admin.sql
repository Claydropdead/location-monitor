-- Manual Admin Account Creation Script with RLS Fix
-- Run this in your Supabase SQL Editor if the automatic creation didn't work

-- FIRST: Temporarily disable RLS to fix any issues
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Check if the admin user exists
SELECT email, role FROM users WHERE email = 'admin@locationmonitor.com';

-- Create the admin user if it doesn't exist
DO $$
DECLARE
    existing_user_id UUID;
    auth_user_id UUID;
BEGIN
    -- Check if user already exists in auth.users
    SELECT id INTO auth_user_id 
    FROM auth.users 
    WHERE email = 'admin@locationmonitor.com';
    
    IF auth_user_id IS NOT NULL THEN
        -- Check if user exists in users table
        SELECT id INTO existing_user_id 
        FROM users 
        WHERE id = auth_user_id;
        
        IF existing_user_id IS NOT NULL THEN
            -- User exists in both tables, just update role
            UPDATE users 
            SET role = 'admin' 
            WHERE id = auth_user_id;
            RAISE NOTICE 'Updated existing user to admin role: %', auth_user_id;
        ELSE
            -- User exists in auth.users but not in users table, create profile
            INSERT INTO users (id, email, name, role)
            VALUES (auth_user_id, 'admin@locationmonitor.com', 'Admin User', 'admin');
            RAISE NOTICE 'Created user profile with admin role: %', auth_user_id;
        END IF;
    ELSE
        -- User doesn't exist in auth.users, create them manually
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
        ) RETURNING id INTO auth_user_id;
        
        -- Create the user profile
        INSERT INTO users (id, email, name, role)
        VALUES (auth_user_id, 'admin@locationmonitor.com', 'Admin User', 'admin');
        
        RAISE NOTICE 'Created new admin user: %', auth_user_id;
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error: %', SQLERRM;
END $$;

-- Re-enable RLS with better policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop and recreate RLS policies with fixes
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Allow user creation on signup" ON users;

-- Better RLS policies that allow proper functionality
-- Allow users to view their own profile OR admins to view all
CREATE POLICY "Users can view profiles" ON users
  FOR SELECT USING (
    auth.uid() = id OR 
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow users to update their own profile OR admins to update all
CREATE POLICY "Users can update profiles" ON users
  FOR UPDATE USING (
    auth.uid() = id OR 
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow user profile creation during signup (this is crucial!)
CREATE POLICY "Allow user creation on signup" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow admins to insert new users
CREATE POLICY "Admins can insert users" ON users
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to delete users
CREATE POLICY "Admins can delete users" ON users
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Check all users and their roles
SELECT id, email, name, role, created_at FROM users ORDER BY created_at;

-- Verify the admin user was created properly
SELECT 'Admin user check:' as status, email, role 
FROM users 
WHERE email = 'admin@locationmonitor.com';
