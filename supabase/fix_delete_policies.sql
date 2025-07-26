-- Fix the missing DELETE policies for user_locations table
-- This will allow users to delete their own location records when logging out or turning off location sharing

-- Add DELETE policy for user_locations table - users can delete their own records
CREATE POLICY "Enable delete for users based on user_id" ON user_locations
  FOR DELETE USING (auth.uid() = user_id);

-- Also add DELETE policy for admins to clean up any orphaned records
CREATE POLICY "Enable delete for admins on locations" ON user_locations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Verify current policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'user_locations'
ORDER BY policyname;

-- Test that DELETE operations work for authenticated users
-- (You can run this in your SQL editor after applying the policy)
/*
-- Example test (replace with actual user_id):
INSERT INTO user_locations (user_id, latitude, longitude) 
VALUES (auth.uid(), 40.7128, -74.0060);

DELETE FROM user_locations WHERE user_id = auth.uid();
*/
