export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface UserLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
  is_active: boolean;
}

export interface LocationWithUser {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
  is_active: boolean;
  users: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
  };
}

export interface LocationUpdatePayload {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
  is_active: boolean;
}

export interface UserWithLocation extends User {
  user_locations?: UserLocation[];
  latest_location?: UserLocation;
}

export interface MapMarker {
  id: string;
  position: [number, number];
  user: User;
  location: UserLocation;
}

export interface LocationPermissionState {
  granted: boolean;
  denied: boolean;
  prompt: boolean;
}

export interface GeolocationPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude?: number;
    altitudeAccuracy?: number;
    heading?: number;
    speed?: number;
  };
  timestamp: number;
}
