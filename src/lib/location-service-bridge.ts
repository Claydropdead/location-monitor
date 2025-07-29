import { registerPlugin } from '@capacitor/core'

export interface LocationServiceBridgePlugin {
  getLocationSharingState(): Promise<{ isSharing: boolean }>
  setLocationSharingState(options: { isSharing: boolean }): Promise<{ success: boolean }>
  startLocationService(): Promise<{ success: boolean; message: string }>
  stopLocationService(): Promise<{ success: boolean; message: string }>
  isLocationSharing(): Promise<{ isSharing: boolean; serviceRunning: boolean }>
}

const LocationServiceBridge = registerPlugin<LocationServiceBridgePlugin>('LocationServiceBridge')

export default LocationServiceBridge
