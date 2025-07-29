'use client'

import { Capacitor } from '@capacitor/core'
import type { GeolocationPosition } from '@/types'

export class NativeGeolocationService {
  private onLocationUpdate: ((position: GeolocationPosition) => void) | null = null

  constructor() {
    // Add visibility change handler for mobile apps
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange)
    }
  }

  private handleVisibilityChange = () => {
    if (document.hidden) {
      console.log('🌙 App backgrounded - Background Geolocation continues tracking')
    } else {
      console.log('☀️ App foregrounded - Background Geolocation still active')
    }
  }

  async requestPermissions() {
    if (Capacitor.isNativePlatform()) {
      console.log('📱 Native platform - MediaStyle service will handle permissions')
      return { granted: true }
    } else {
      // Web fallback
      if ('geolocation' in navigator) {
        return { granted: true }
      }
      return { granted: false }
    }
  }

  async startWatching(callback: (position: GeolocationPosition) => void) {
    this.onLocationUpdate = callback
    
    if (Capacitor.isNativePlatform()) {
      console.log('� Native platform - MediaStyle service will handle background tracking')
      // Return a watch ID for compatibility
      return 'media-style-service-active'
    } else {
      // Web fallback - existing implementation
      console.log('🌐 Starting web geolocation tracking...')
      return this.startWebGeolocation(callback)
    }
  }

  async stopWatching() {
    if (Capacitor.isNativePlatform()) {
      console.log('� Native platform - MediaStyle service will handle stopping')
      // Nothing to do here, MediaStyle service handles it
    } else {
      // Web fallback
      if (this.watchId) {
        navigator.geolocation.clearWatch(Number(this.watchId))
        this.watchId = null
      }
    }
    this.onLocationUpdate = null
  }

  private watchId: number | null = null

  private startWebGeolocation(callback: (position: GeolocationPosition) => void) {
    if ('geolocation' in navigator) {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          const geoPosition: GeolocationPosition = {
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            },
            timestamp: Date.now()
          }
          callback(geoPosition)
        },
        (error) => console.error('❌ Web geolocation error:', error),
        {
          enableHighAccuracy: true,
          timeout: 15000,      // Increased timeout for more accurate reading
          maximumAge: 0        // Don't use cached location, get fresh GPS reading
        }
      )
      return 'web-geolocation-active'
    }
    throw new Error('Geolocation not supported')
  }

  async getCurrentPosition(): Promise<GeolocationPosition> {
    if (Capacitor.isNativePlatform()) {
      // Use Capacitor Geolocation plugin for current position with high accuracy
      try {
        const { Geolocation } = await import('@capacitor/geolocation')
        const coordinates = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,  // Increased timeout for more accurate reading
          maximumAge: 0    // Don't use cached location, get fresh GPS reading
        })
        
        return {
          coords: {
            latitude: coordinates.coords.latitude,
            longitude: coordinates.coords.longitude,
            accuracy: coordinates.coords.accuracy,
            altitude: coordinates.coords.altitude ?? undefined,
            altitudeAccuracy: coordinates.coords.altitudeAccuracy ?? undefined,
            heading: coordinates.coords.heading ?? undefined,
            speed: coordinates.coords.speed ?? undefined
          },
          timestamp: coordinates.timestamp || Date.now()
        }
      } catch (error) {
        console.error('❌ Capacitor geolocation getCurrentPosition failed:', error)
        throw error
      }
    } else {
      // Web fallback
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            },
            timestamp: Date.now()
          }),
          reject,
          { 
            enableHighAccuracy: true, 
            timeout: 15000,     // Increased timeout for more accurate reading
            maximumAge: 0       // Don't use cached location, get fresh GPS reading
          }
        )
      })
    }
  }

  isNativePlatform(): boolean {
    return Capacitor.isNativePlatform()
  }
}

const nativeGeolocationService = new NativeGeolocationService()
export default nativeGeolocationService
