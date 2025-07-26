-- Insert test location data to see markers on the map
-- First, let's see what users we have
SELECT id, name, email FROM users;

-- Insert some test locations for your user
-- Replace 'your-user-id' with your actual user ID from the query above

-- Example locations around New York City area
INSERT INTO user_locations (user_id, latitude, longitude, accuracy, is_active) VALUES
-- Replace this UUID with your actual user ID
('77ffeb40-d7b5-4a69-ac8c-92247f4fbfd2', 40.7128, -74.0060, 50.0, true),
('77ffeb40-d7b5-4a69-ac8c-92247f4fbfd2', 40.7589, -73.9851, 75.0, false); -- Previous location

-- If you have multiple users, you can add more test data:
-- ('another-user-id', 40.7505, -73.9934, 60.0, true);

-- Check the inserted data
SELECT ul.*, u.name as user_name 
FROM user_locations ul 
JOIN users u ON ul.user_id = u.id 
ORDER BY ul.timestamp DESC;
