-- Temporary fix: Disable RLS to test the app
-- WARNING: This makes your data public, only use for testing

-- Disable RLS temporarily
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations DISABLE ROW LEVEL SECURITY;

-- After testing, you can re-enable with:
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;
