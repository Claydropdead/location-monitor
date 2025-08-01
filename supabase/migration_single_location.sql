-- Migration: Convert to single location record per user
-- Run this to update existing databases to use one record per user

-- Step 1: Create a backup table (optional)
CREATE TABLE IF NOT EXISTS user_locations_backup AS 
SELECT * FROM user_locations;

-- Step 2: Create new table structure with unique user_id constraint
DROP TABLE IF EXISTS user_locations_new;
CREATE TABLE user_locations_new (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(8, 2),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: Migrate data - keep only the most recent location per user
INSERT INTO user_locations_new (user_id, latitude, longitude, accuracy, timestamp, is_active, created_at)
SELECT DISTINCT ON (user_id)
  user_id,
  latitude,
  longitude,
  accuracy,
  timestamp,
  is_active,
  created_at
FROM user_locations
ORDER BY user_id, timestamp DESC;

-- Step 4: Drop dependent objects and replace old table
DROP VIEW IF EXISTS active_user_locations CASCADE;
DROP TABLE user_locations CASCADE;
ALTER TABLE user_locations_new RENAME TO user_locations;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_timestamp ON user_locations(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_locations_active ON user_locations(is_active);
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id_latest ON user_locations(user_id, timestamp DESC) WHERE is_active = true;

-- Step 6: Update RLS policies
DROP POLICY IF EXISTS "Enable insert for own locations" ON user_locations;
DROP POLICY IF EXISTS "Enable read for own locations or admin" ON user_locations;
DROP POLICY IF EXISTS "Enable update for own locations or admin" ON user_locations;
DROP POLICY IF EXISTS "Enable delete for own locations or admin" ON user_locations;

CREATE POLICY "Enable insert for own locations" ON user_locations
  FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable read for own locations or admin" ON user_locations
  FOR SELECT 
  TO authenticated
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Enable update for own locations or admin" ON user_locations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

CREATE POLICY "Enable delete for own locations or admin" ON user_locations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin());

-- Step 7: Enable RLS
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

-- Step 7.5: Recreate any dependent views if they existed
CREATE OR REPLACE VIEW active_user_locations AS
SELECT 
  ul.*,
  u.name as user_name,
  u.email as user_email
FROM user_locations ul
JOIN users u ON ul.user_id = u.id
WHERE ul.is_active = true;

-- Step 8: Update the add_user_location function to work with single record
CREATE OR REPLACE FUNCTION add_user_location(
  latitude_param decimal,
  longitude_param decimal,
  accuracy_param decimal DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_location public.user_locations;
  current_user_id uuid := auth.uid();
BEGIN
  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = current_user_id) THEN
    RAISE EXCEPTION 'User profile not found. Please complete your profile first.';
  END IF;
  
  -- Insert or update location (only one record per user)
  INSERT INTO public.user_locations (user_id, latitude, longitude, accuracy, timestamp, is_active)
  VALUES (
    current_user_id,
    latitude_param,
    longitude_param,
    accuracy_param,
    NOW(),
    true
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    accuracy = EXCLUDED.accuracy,
    timestamp = NOW(),
    is_active = true
  RETURNING * INTO result_location;
  
  -- Return the location data as JSON
  RETURN row_to_json(result_location);
END;
$$;

DO $$
BEGIN
    RAISE NOTICE 'Migration complete: Now using single location record per user';
    RAISE NOTICE 'Each user now has exactly one location record that gets updated in real-time';
END $$;
