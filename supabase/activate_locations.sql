-- Set the most recent location for each user as active
-- This will make the markers appear on the admin map

-- First, set all locations to inactive
UPDATE user_locations SET is_active = false;

-- Then set the most recent location for each user as active
WITH latest_locations AS (
  SELECT DISTINCT ON (user_id) 
    id, user_id, timestamp
  FROM user_locations 
  ORDER BY user_id, timestamp DESC
)
UPDATE user_locations 
SET is_active = true 
WHERE id IN (SELECT id FROM latest_locations);

-- Check the results
SELECT 
  ul.id,
  ul.user_id,
  u.name as user_name,
  ul.latitude,
  ul.longitude,
  ul.is_active,
  ul.timestamp
FROM user_locations ul
JOIN users u ON ul.user_id = u.id
WHERE ul.is_active = true
ORDER BY ul.timestamp DESC;
