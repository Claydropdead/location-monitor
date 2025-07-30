'use client'

import { Capacitor } from '@capacitor/core'

export class BatteryOptimizationService {
  
  /**
   * Request to disable battery optimizations for the app
   * This is critical for background location tracking
   */
  async requestDisableBatteryOptimizations(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      console.log('🌐 Web platform - battery optimizations not applicable')
      return true
    }

    try {
      // Use Capacitor's native bridge to request battery optimization exemption
      const { registerPlugin } = await import('@capacitor/core')
      
      interface BatteryOptimizationPlugin {
        requestDisableBatteryOptimizations(): Promise<{ granted: boolean }>
        isBatteryOptimizationIgnored(): Promise<{ ignored: boolean }>
      }
      
      const BatteryOptimization = registerPlugin<BatteryOptimizationPlugin>('BatteryOptimization')
      
      // Check if already ignored
      const { ignored } = await BatteryOptimization.isBatteryOptimizationIgnored()
      if (ignored) {
        console.log('✅ Battery optimizations already disabled')
        return true
      }
      
      // Request to disable
      const { granted } = await BatteryOptimization.requestDisableBatteryOptimizations()
      
      if (granted) {
        console.log('✅ Battery optimization exemption granted')
      } else {
        console.log('⚠️ Battery optimization exemption denied')
      }
      
      return granted
    } catch (error) {
      console.warn('⚠️ Battery optimization request failed:', error)
      return false
    }
  }

  /**
   * Show user instructions for manually disabling battery optimizations
   */
  showBatteryOptimizationInstructions(): string {
    return `
To ensure reliable background location tracking:

1. Go to Settings > Apps > Location Monitor
2. Tap on "Battery" or "Battery Usage"
3. Select "Don't optimize" or "Allow background activity"
4. Confirm the setting

This prevents Android from killing the app in the background.
    `.trim()
  }

  /**
   * Check if the device has aggressive power management
   */
  async hasAggressivePowerManagement(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false
    
    try {
      const { Device } = await import('@capacitor/device')
      const info = await Device.getInfo()
      
      // Known manufacturers with aggressive power management
      const aggressiveManufacturers = [
        'xiaomi', 'huawei', 'honor', 'oppo', 'vivo', 'oneplus', 
        'samsung', 'sony', 'asus', 'meizu', 'letv', 'nokia'
      ]
      
      const manufacturer = info.manufacturer?.toLowerCase() || ''
      return aggressiveManufacturers.some(brand => manufacturer.includes(brand))
    } catch (error) {
      console.warn('Could not detect device manufacturer:', error)
      return false
    }
  }
}

export const batteryOptimizationService = new BatteryOptimizationService()
