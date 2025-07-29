'use client'

import { Capacitor } from '@capacitor/core'
import type { GeolocationPosition } from '@/types'
import { backgroundGeolocation } from './background-geolocation'

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
      console.log('📱 Using Capacitor Background Geolocation for permissions')
      try {
        // Initialize background geolocation which handles permissions
        await backgroundGeolocation.initialize()
        return { granted: true }
      } catch (error) {
        console.error('❌ Failed to request permissions:', error)
        return { granted: false }
      }
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
      console.log('🚀 Starting background geolocation tracking...')
      try {
        await backgroundGeolocation.startTracking()
        
        // Return a watch ID for compatibility
        return 'background-geolocation-active'
      } catch (error) {
        console.error('❌ Failed to start background tracking:', error)
        throw error
      }
    } else {
      // Web fallback - existing implementation
      console.log('🌐 Starting web geolocation tracking...')
      return this.startWebGeolocation(callback)
    }
  }

  async stopWatching() {
    if (Capacitor.isNativePlatform()) {
      console.log('🛑 Stopping background geolocation tracking...')
      try {
        await backgroundGeolocation.stopTracking()
      } catch (error) {
        console.error('❌ Failed to stop background tracking:', error)
      }
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
          timeout: 10000,
          maximumAge: 5000
        }
      )
      return 'web-geolocation-active'
    }
    throw new Error('Geolocation not supported')
  }

  async getCurrentPosition(): Promise<GeolocationPosition> {
    if (Capacitor.isNativePlatform()) {
      // Use background geolocation for current position
      try {
        return await backgroundGeolocation.getCurrentPosition()
      } catch (error) {
        console.error('❌ Background geolocation getCurrentPosition failed:', error)
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
          { enableHighAccuracy: true, timeout: 10000 }
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
