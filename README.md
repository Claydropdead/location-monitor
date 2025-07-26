# Real-time Location Monitoring System

A comprehensive real-time user location monitoring system built with Next.js, TypeScript, and Supabase. This application allows users to share their location and enables administrators to monitor all users on a live map with detailed user information.

## 🚀 Features

- **Real-time Location Tracking**: GPS-based location sharing with automatic updates
- **Interactive Map**: Leaflet-powered map with user markers and hover information
- **User Authentication**: Secure authentication with Supabase Auth
- **Role-based Access**: Separate dashboards for users and administrators
- **Live Updates**: Real-time subscriptions for instant location updates
- **User Profiles**: Detailed user information including name and contact details
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
- **HTTPS Only**: All communications encrypted

## 🎯 Usage

### For Users:
1. Sign up with email and password
2. Complete your profile with name and phone (optional)
3. Enable location sharing from the dashboard
4. Your location will be visible to administrators

### For Administrators:
1. Sign up and have your role changed to 'admin' in the database
2. Access the admin dashboard to see all users
3. View real-time locations on the interactive map
4. Hover over markers to see user details

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

## 📱 Mobile Support

The application is fully responsive and supports:
- Mobile geolocation APIs
- Touch-friendly interface
- Progressive Web App features
- Offline capabilities (when implemented)

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Key Components

- `src/components/auth/` - Authentication forms
- `src/components/dashboard/` - User and admin dashboards
- `src/components/map/` - Map components
- `src/hooks/useLocation.ts` - Location tracking hook
- `src/lib/supabase/` - Supabase client configuration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, email [your-email] or create an issue in the repository.

## 🔄 Roadmap

- [ ] Push notifications for location updates
- [ ] Geofencing capabilities
- [ ] Location history and analytics
- [ ] Export functionality
- [ ] Advanced user management
- [ ] Mobile app versions

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
