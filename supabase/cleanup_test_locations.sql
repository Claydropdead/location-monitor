-- Clean up test and manual locations
-- This script removes test locations that were manually inserted

-- First, let's see what locations we have
SELECT 
    ul.id,
    ul.user_id,
    ul.latitude,
    ul.longitude,
    ul.accuracy,
    ul.timestamp,
    ul.is_active,
    u.name as user_name,
    u.email as user_email
FROM user_locations ul 
JOIN users u ON ul.user_id = u.id 
ORDER BY ul.timestamp DESC;

-- Remove all test locations (locations that look like manual test data)
-- These are typically locations with round numbers or specific test coordinates

-- Delete locations around NYC area (common test coordinates)
DELETE FROM user_locations 
WHERE latitude BETWEEN 40.7 AND 40.8 
AND longitude BETWEEN -74.1 AND -73.9;

-- Delete any duplicate locations for the same user (keeping only the latest)
WITH ranked_locations AS (
    SELECT id, 
           user_id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp DESC) as rn
    FROM user_locations 
    WHERE is_active = true
)
DELETE FROM user_locations 
WHERE id IN (
    SELECT id FROM ranked_locations WHERE rn > 1
);

-- Set all remaining locations to inactive first
UPDATE user_locations SET is_active = false;

-- Verify cleanup
SELECT 
    ul.id,
    ul.user_id,
    ul.latitude,
    ul.longitude,
    ul.accuracy,
    ul.timestamp,
    ul.is_active,
    u.name as user_name
FROM user_locations ul 
JOIN users u ON ul.user_id = u.id 
ORDER BY ul.timestamp DESC;

-- Show current user count
SELECT COUNT(*) as total_users FROM users;
SELECT COUNT(*) as total_locations FROM user_locations;
SELECT COUNT(*) as active_locations FROM user_locations WHERE is_active = true;
