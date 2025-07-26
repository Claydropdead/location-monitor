# Admin Account Setup Guide

## 🚀 Quick Setup Steps

### 1. Set up Supabase Database

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to the SQL Editor in your Supabase dashboard
3. Copy and paste the entire contents of `supabase/schema.sql` and run it
4. This will create the users and user_locations tables with proper security

### 2. Set up Environment Variables

Create `.env.local` file in your project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Get these values from: Supabase Dashboard > Settings > API

### 3. Create Your First Admin Account

**Option A: Through the Web App (Recommended)**
1. Start your development server: `npm run dev`
2. Go to http://localhost:3000
3. Click "Get Started" or "Sign Up"
4. Create an account with your email and password
5. Go to your Supabase dashboard > Table Editor > users table
6. Find your user record and change the `role` column from 'user' to 'admin'
7. Now you can access the admin dashboard at http://localhost:3000/admin

**Option B: Directly in Supabase (Advanced)**
1. Go to Supabase Dashboard > Table Editor > users
2. Click "Insert" > "Insert row"
3. Add a new user with role 'admin'
4. Then go to Authentication > Users and create the auth user with the same email

### 4. Test Admin Access

1. Sign in with your admin account
2. You should be redirected to `/admin` instead of `/dashboard`
3. The admin panel shows:
   - Total users count
   - Online users (active in last 5 minutes)
   - Real-time map with all user locations
   - User details on marker hover (name, phone, coordinates)

## 🎯 Demo Accounts

For testing, you can create these accounts:

**Admin Account:**
- Email: admin@example.com
- Password: Admin123!
- Role: admin (change in database after signup)

**Test User Account:**
- Email: user@example.com  
- Password: User123!
- Role: user (default)

## 🔧 Troubleshooting

**Can't see admin dashboard?**
- Check that your role is set to 'admin' in the users table
- Clear browser cache and sign in again

**Location not working?**
- Enable location services in your browser
- Make sure you're using HTTPS in production

**Real-time updates not working?**
- Check that real-time is enabled in Supabase
- Verify the `user_locations` table is added to the publication

## 🎮 How to Use

### As Admin:
1. Go to `/admin` after signing in
2. See live map with all users
3. Hover over green/gray dots to see user info
4. Green = online (last 5 min), Gray = offline

### As User:
1. Go to `/dashboard` after signing in
2. Click "Share Location" to start tracking
3. Your location will appear on admin's map
4. Toggle sharing on/off as needed
