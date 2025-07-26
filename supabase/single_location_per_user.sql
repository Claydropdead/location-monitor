-- Migration: Ensure only one location record per user
-- This will convert the current multiple-records-per-user system to single-record-per-user

-- Step 1: Clean up existing data - keep only the latest record for each user
WITH latest_locations AS (
  SELECT DISTINCT ON (user_id) 
    id, user_id, latitude, longitude, accuracy, timestamp, is_active
  FROM user_locations
  ORDER BY user_id, timestamp DESC
)
DELETE FROM user_locations 
WHERE id NOT IN (SELECT id FROM latest_locations);

-- Step 2: Add unique constraint on user_id to ensure only one record per user
ALTER TABLE user_locations 
ADD CONSTRAINT unique_user_location UNIQUE (user_id);

-- Step 3: Update the table comment to reflect the new structure
COMMENT ON TABLE user_locations IS 'Single location record per user - upserted on each update';
COMMENT ON CONSTRAINT unique_user_location ON user_locations IS 'Ensures only one location record per user for UPSERT operations';
