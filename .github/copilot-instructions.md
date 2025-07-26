# Copilot Instructions

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## Project Overview
This is a real-time user location monitoring system built with Next.js, TypeScript, and Supabase. The system allows users to login and share their location, while admins can monitor all users on a map in real-time.

## Tech Stack
- **Frontend**: Next.js 15 with TypeScript and Tailwind CSS
- **Database**: Supabase (PostgreSQL with real-time subscriptions)
- **Authentication**: Supabase Auth with SSR
- **Maps**: Leaflet with React-Leaflet
- **UI Components**: Lucide React icons
- **Styling**: Tailwind CSS

## Key Features
- User authentication and role management
- Real-time location sharing from users
- Admin dashboard with live map view
- User information display on hover (name, contact)
- Multiple concurrent users support
- Responsive design

## File Structure Guidelines
- Use `src/app` directory for Next.js App Router
- Place components in `src/components`
- Database utilities in `src/lib`
- Type definitions in `src/types`
- Use TypeScript for all files
- Follow Next.js App Router conventions

## Database Schema
- `users` table with id, email, name, phone, role, location data
- `user_locations` table for real-time location tracking
- RLS (Row Level Security) policies for data protection

## Development Guidelines
- Use Supabase SSR for authentication
- Implement real-time subscriptions for location updates
- Follow React best practices for state management
- Use TypeScript interfaces for type safety
- Implement proper error handling and loading states
