# Location Monitor Admin Dashboard

An administrative dashboard for monitoring user locations collected from a React Native mobile application. Built with Next.js, TypeScript, and Supabase for real-time location tracking and user management.

## 🚀 Features

- **Admin-only Access**: Secure administrative portal with role-based authentication
- **Real-time Location Monitoring**: View user locations collected from mobile app in real-time
- **Interactive Map**: Leaflet-powered map with user markers and detailed information
- **User Management**: View and manage all registered users
- **Live Updates**: Real-time subscriptions for instant location updates from mobile devices
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Real-time)
- **Maps**: Leaflet with React-Leaflet
- **Authentication**: Supabase Auth with SSR
- **Icons**: Lucide React
- **Deployment**: Vercel-ready

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd location-monitor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Fill in your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

4. **Set up the database**
   - Go to your Supabase project dashboard
   - Run the SQL commands from `supabase/schema.sql` in the SQL editor
   - Enable real-time on the `users` and `user_locations` tables

5. **Run the development server**
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## 🗄️ Database Schema

### Users Table
- `id` (UUID, Primary Key)
- `email` (Text, Unique)
- `name` (Text)
- `phone` (Text, Optional)
- `role` (Text: 'user' | 'admin')
- `created_at`, `updated_at` (Timestamps)

### User Locations Table
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key)
- `latitude`, `longitude` (Decimal)
- `accuracy` (Decimal, Optional)
- `timestamp` (Timestamp)
- `is_active` (Boolean)

## 🔒 Security Features

- **Row Level Security (RLS)**: Enabled on all tables
- **Role-based Policies**: Users can only access their own data
- **Admin Permissions**: Admins can view all user locations
- **Secure Authentication**: Supabase Auth with email verification
- **Admin-only Access**: Only users with admin role can access the dashboard

## 🎯 Usage

### For Administrators:
1. Access the admin login page at `/login`
2. Sign in with admin credentials (role must be set to 'admin' in database)
3. View the admin dashboard with:
   - Real-time user locations from mobile app
   - User management and statistics
   - Interactive map with location markers
4. Monitor user activity and location updates in real-time

### Setting up Admin Users:
1. Create a user account in Supabase Auth
2. Update the user's role to 'admin' in the `users` table:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
   ```

## 🚀 Deployment

### Deploy to Vercel

1. **Connect your repository to Vercel**
2. **Set environment variables** in Vercel dashboard
3. **Deploy**: Vercel will automatically build and deploy

### Configure Supabase

1. **Authentication Settings**:
   - Add your domain to allowed origins
   - Configure email templates if needed

2. **Real-time Settings**:
   - Ensure real-time is enabled for your tables
   - Check publication settings include your tables

## 📱 Mobile Integration

This dashboard is designed to work with a React Native mobile application that:
- Collects user location data using device GPS
- Sends location updates to the Supabase database
- Registers users and manages authentication
- Provides real-time location sharing capabilities

The admin dashboard receives and displays this mobile-collected data in real-time.

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Key Components

- `src/components/auth/` - Admin authentication forms
- `src/components/dashboard/` - Admin dashboard
- `src/components/map/` - Real-time map components
- `src/lib/supabase/` - Supabase client configuration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.
