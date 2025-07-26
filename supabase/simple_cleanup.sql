-- SIMPLE CLEANUP SCRIPT - Run this in your Supabase SQL Editor
-- This will remove all test/manual locations and reset the location sharing state

-- 1. First, see what we have currently
SELECT 
    COUNT(*) as total_locations,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_locations
FROM user_locations;

-- 2. Remove all locations (clean slate)
DELETE FROM user_locations;

-- 3. Verify cleanup
SELECT 
    COUNT(*) as remaining_locations
FROM user_locations;

-- 4. Check users table (should remain intact)
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users
FROM users;
