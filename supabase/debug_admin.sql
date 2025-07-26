-- Debug script to check current state

-- 1. Check all users and their roles
SELECT 'Users Table:' as info;
SELECT id, email, name, role, created_at FROM users;

-- 2. Check all user locations
SELECT 'User Locations:' as info;
SELECT ul.id, ul.user_id, u.name as user_name, ul.latitude, ul.longitude, ul.is_active, ul.timestamp 
FROM user_locations ul
LEFT JOIN users u ON ul.user_id = u.id
ORDER BY ul.timestamp DESC;

-- 3. Check RLS policies
SELECT 'RLS Policies:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('users', 'user_locations')
ORDER BY tablename, policyname;
