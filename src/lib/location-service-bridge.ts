import { registerPlugin } from '@capacitor/core'

export interface LocationServiceBridgePlugin {
  getLocationSharingState(): Promise<{ isSharing: boolean }>
  setLocationSharingState(options: { isSharing: boolean }): Promise<{ success: boolean }>
}

const LocationServiceBridge = registerPlugin<LocationServiceBridgePlugin>('LocationServiceBridge')

export default LocationServiceBridge
