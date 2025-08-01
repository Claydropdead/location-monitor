-- Simple Admin Creation Script
-- This bypasses RLS issues completely

-- Step 1: Temporarily disable RLS on users table
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Step 2: Create admin user directly (if you have one in auth.users already)
-- Replace 'your-actual-email@example.com' with the email you used to sign up
INSERT INTO users (id, email, name, role, created_at, updated_at)
SELECT 
    au.id, 
    au.email, 
    COALESCE(au.raw_user_meta_data->>'name', au.email),
    'admin',
    NOW(),
    NOW()
FROM auth.users au
WHERE au.email = 'your-actual-email@example.com'  -- CHANGE THIS TO YOUR EMAIL
ON CONFLICT (id) DO UPDATE SET 
    role = 'admin',
    updated_at = NOW();

-- Step 3: Re-enable RLS with a simple policy
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Step 4: Create simple RLS policy
DROP POLICY IF EXISTS "Allow all for authenticated users" ON users;
CREATE POLICY "Allow all for authenticated users" ON users 
  FOR ALL TO authenticated 
  USING (true) 
  WITH CHECK (true);

-- Step 5: Verify the admin user was created
SELECT 'Admin check:' as status, id, email, name, role 
FROM users 
WHERE role = 'admin';

-- Instructions:
-- 1. First, sign up at your app with your email/password
-- 2. Replace 'your-actual-email@example.com' above with your actual email
-- 3. Run this script
-- 4. Try logging in with your credentials
