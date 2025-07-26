-- Temporary fix: Disable RLS to test functionality
-- Run this first to test if the app works without RLS

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations DISABLE ROW LEVEL SECURITY;

-- Check if this fixes the admin dashboard
-- After confirming it works, we'll re-enable with better policies
