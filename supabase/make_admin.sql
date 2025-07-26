-- First, let's check who are the current users
SELECT id, email, name, role FROM users;

-- Update Patrick's account to admin (replace with your actual email)
UPDATE users 
SET role = 'admin' 
WHERE email = 'pattie.valmores12@gmail.com';

-- Alternative: Update using the user ID visible in the screenshots
-- UPDATE users 
-- SET role = 'admin' 
-- WHERE id = '77ffeb40-d7b5-4a69-ac8c-92247f4fbfd2';

-- Verify the update
SELECT id, email, name, role FROM users WHERE role = 'admin';
