-- Create admin user with RLS considerations
-- This script should be run as a Supabase admin/service role

-- First, create the auth user (you'll need to do this through Supabase Dashboard or API)
-- Then run this script to set up the admin user in the users table

-- Replace 'your-admin-email@example.com' with your actual admin email
-- Replace 'your-user-uuid' with the actual UUID from auth.users table

DO $$
DECLARE
    admin_email text := 'admin@locationmonitor.com'; -- Change this to your admin email
    admin_user_id uuid;
BEGIN
    -- Get the user ID from auth.users table
    SELECT id INTO admin_user_id 
    FROM auth.users 
    WHERE email = admin_email 
    LIMIT 1;
    
    IF admin_user_id IS NOT NULL THEN
        -- Insert or update the admin user in the users table
        INSERT INTO public.users (id, email, name, role, created_at, updated_at)
        VALUES (
            admin_user_id,
            admin_email,
            'Admin User',
            'admin',
            NOW(),
            NOW()
        )
        ON CONFLICT (id) 
        DO UPDATE SET 
            role = 'admin',
            updated_at = NOW();
            
        RAISE NOTICE 'Admin user created/updated successfully for email: %', admin_email;
    ELSE
        RAISE EXCEPTION 'No auth user found with email: %. Please create the auth user first through Supabase Dashboard.', admin_email;
    END IF;
END $$;

-- Alternative: If you know the exact UUID, you can use this direct approach
-- Replace the UUID below with the actual UUID from your auth.users table

/*
INSERT INTO public.users (id, email, name, role, created_at, updated_at)
VALUES (
    'your-user-uuid-here'::uuid,  -- Replace with actual UUID
    'admin@locationmonitor.com',   -- Replace with your admin email
    'Admin User',
    'admin',
    NOW(),
    NOW()
)
ON CONFLICT (id) 
DO UPDATE SET 
    role = 'admin',
    updated_at = NOW();
*/

-- Grant necessary permissions (if needed)
-- These might be helpful if RLS policies are very restrictive

-- Ensure RLS policies allow admin users to access all data
-- (These should already be in your schema.sql, but just in case)

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

-- Allow admins to read all user profiles
CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Allow users to read their own profile
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Allow users to insert their own profile (for signup)
CREATE POLICY "Users can insert own profile" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);
