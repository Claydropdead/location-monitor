# Quick Setup Guide

## 1. Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Copy your project URL and anon key from Settings > API
3. In the SQL Editor, run the commands from `supabase/schema.sql`
4. Go to Authentication > Settings and configure:
   - Enable email confirmations (optional)
   - Add your domain to allowed origins for production

## 2. Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## 3. First Admin User

After setting up the database and running the app:

1. Sign up for an account through the web interface
2. Go to your Supabase dashboard > Table Editor > users
3. Find your user record and change the `role` from 'user' to 'admin'
4. Now you can access the admin dashboard at `/admin`

## 4. Development

```bash
npm install
npm run dev
```

Visit http://localhost:3000

## 5. Testing Location Features

- Enable location services in your browser
- Sign up as a user and start sharing location
- Sign in as admin to see the real-time map
- Test with multiple browser tabs/users

## Troubleshooting

- **Location not working**: Check browser permissions and HTTPS
- **Map not loading**: Ensure Leaflet CSS is loaded
- **Real-time not working**: Check Supabase real-time settings
- **Auth issues**: Verify environment variables and RLS policies
