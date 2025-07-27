'use client'

import { Geolocation } from '@capacitor/geolocation'
import { Capacitor } from '@capacitor/core'
import { GeolocationPosition } from '@/types'

export class NativeGeolocationService {
  private watchId: string | null = null
  private onLocationUpdate: ((position: GeolocationPosition) => void) | null = null

  async requestPermissions() {
    if (!Capacitor.isNativePlatform()) {
      // For web, we use the existing permission system
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
      console.log('Starting native geolocation watch...')
      
      try {
        this.watchId = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 3000
          },
          (position, err) => {
            if (err) {
              console.error('Native geolocation error:', err)
              return
            }
            
            if (position && this.onLocationUpdate) {
              // Convert Capacitor position to our GeolocationPosition type
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
              
              console.log('Native location update:', convertedPosition.coords.latitude, convertedPosition.coords.longitude)
              this.onLocationUpdate(convertedPosition)
            }
          }
        )
        
        console.log('Native geolocation watch started with ID:', this.watchId)
        return this.watchId
      } catch (error) {
        console.error('Error starting native geolocation watch:', error)
        return null
      }
    } else {
      // Fallback to web geolocation
      console.log('Starting web geolocation watch...')
      
      if (!navigator.geolocation) {
        console.error('Geolocation not supported')
        return null
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
          timeout: 15000,
          maximumAge: 3000
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
          await Geolocation.clearWatch({ id: this.watchId })
          console.log('Native geolocation watch stopped')
        } catch (error) {
          console.error('Error stopping native geolocation watch:', error)
        }
      } else {
        navigator.geolocation.clearWatch(parseInt(this.watchId))
        console.log('Web geolocation watch stopped')
      }
      this.watchId = null
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
            (error) => {
              console.error('Error getting current position:', error)
              reject(error)
            },
            {
              enableHighAccuracy: true,
              timeout: 15000
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

export const nativeGeolocation = new NativeGeolocationService()
