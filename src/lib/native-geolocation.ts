'use client'

import { Geolocation } from '@capacitor/geolocation'
import { Capacitor } from '@capacitor/core'
import type { GeolocationPosition } from '@/types'

export class NativeGeolocationService {
  private watchId: string | null = null
  private onLocationUpdate: ((position: GeolocationPosition) => void) | null = null

  constructor() {
    // Add visibility change handler for mobile apps
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange)
    }
  }

  private handleVisibilityChange = () => {
    if (document.hidden) {
      console.log('🌙 App backgrounded - Android service continues tracking')
    } else {
      console.log('☀️ App foregrounded - syncing with Android service')
    }
  }

  async requestPermissions() {
    if (!Capacitor.isNativePlatform()) {
      return { granted: true }
    }

    try {
      const permissions = await Geolocation.requestPermissions()
      console.log('Native permissions:', permissions)
      return { granted: permissions.location === 'granted' }
    } catch (error) {
      console.error('Error requesting permissions:', error)
      return { granted: false }
    }
  }

  async startWatching(callback: (position: GeolocationPosition) => void) {
    this.onLocationUpdate = callback

    if (Capacitor.isNativePlatform()) {
      console.log('🚀 Starting location tracking with Android foreground service...')
      
      try {
        // Request location permissions FIRST
        const permissions = await Geolocation.requestPermissions()
        
        if (permissions.location !== 'granted') {
          throw new Error('Location permission denied')
        }

        // For Android, we start the foreground service with MediaStyle notification
        // This is handled by the Android LocationTrackingService which runs independently
        console.log('✅ Location permissions granted - Android service will start automatically')
        
        // Use standard Capacitor geolocation for web app updates
        // The Android service handles its own location tracking and database updates
        this.watchId = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5000
          },
          (position, err) => {
            if (err) {
              console.error('Native geolocation error:', err)
              return
            }
            
            if (position && this.onLocationUpdate) {
              const convertedPosition: GeolocationPosition = {
                coords: {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                  altitude: position.coords.altitude || undefined,
                  altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
                  heading: position.coords.heading || undefined,
                  speed: position.coords.speed || undefined
                },
                timestamp: position.timestamp
              }
              
              console.log('📍 Location update:', convertedPosition.coords.latitude, convertedPosition.coords.longitude)
              this.onLocationUpdate(convertedPosition)
            }
          }
        )
        
        console.log('✅ Web app location tracking started (Android service handles background)')
        return this.watchId
      } catch (error) {
        console.error('❌ Error starting location tracking:', error)
        throw error
      }
    } else {
      // Fallback to web geolocation
      console.log('Starting web geolocation watch...')
      
      if (!navigator.geolocation) {
        throw new Error('Geolocation not supported')
      }

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const convertedPosition: GeolocationPosition = {
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude || undefined,
              altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
              heading: position.coords.heading || undefined,
              speed: position.coords.speed || undefined
            },
            timestamp: position.timestamp
          }
          
          console.log('Web location update:', convertedPosition.coords.latitude, convertedPosition.coords.longitude)
          if (this.onLocationUpdate) {
            this.onLocationUpdate(convertedPosition)
          }
        },
        (error) => {
          console.error('Web geolocation error:', error)
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 10000
        }
      )

      this.watchId = watchId.toString()
      console.log('Web geolocation watch started with ID:', this.watchId)
      return this.watchId
    }
  }

  async stopWatching() {
    if (this.watchId) {
      if (Capacitor.isNativePlatform()) {
        try {
          // Stop standard geolocation (Android service continues independently)
          await Geolocation.clearWatch({ id: this.watchId })
          console.log('✅ Web app location tracking stopped (Android service continues)')
        } catch (error) {
          console.error('❌ Error stopping location tracking:', error)
        }
      } else {
        navigator.geolocation.clearWatch(parseInt(this.watchId))
        console.log('Web geolocation watch stopped')
      }
      this.watchId = null
      this.onLocationUpdate = null
    }
  }

  async getCurrentPosition(): Promise<GeolocationPosition | null> {
    try {
      if (Capacitor.isNativePlatform()) {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000
        })
        
        return {
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude || undefined,
            altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
            heading: position.coords.heading || undefined,
            speed: position.coords.speed || undefined
          },
          timestamp: position.timestamp
        }
      } else {
        return new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              resolve({
                coords: {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                  altitude: position.coords.altitude || undefined,
                  altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
                  heading: position.coords.heading || undefined,
                  speed: position.coords.speed || undefined
                },
                timestamp: position.timestamp
              })
            },
            (error) => reject(error),
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 3000
            }
          )
        })
      }
    } catch (error) {
      console.error('Error getting current position:', error)
      return null
    }
  }

  isNativePlatform(): boolean {
    return Capacitor.isNativePlatform()
  }
}

const nativeGeolocationService = new NativeGeolocationService()
export default nativeGeolocationService
