-- Test script to demonstrate the new behavior
-- Run this in your Supabase SQL editor to see the difference

-- Show current user_locations
SELECT 
  ul.user_id,
  u.name,
  ul.is_active,
  ul.timestamp,
  CASE 
    WHEN ul.is_active = true THEN '🟢 Online'
    WHEN ul.is_active = false THEN '🔴 Offline (accidental disconnect)'
    ELSE '❌ Not found (intentional disconnect)'
  END as status
FROM user_locations ul
JOIN users u ON ul.user_id = u.id
ORDER BY ul.timestamp DESC;

-- This query shows what the map will display:
-- ✅ Records with is_active = true → Show as online
-- ✅ Records with is_active = false → Show as offline  
-- ❌ No records → Not shown on map (user logged out or turned off location)
