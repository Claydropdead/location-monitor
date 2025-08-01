'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import { Icon, LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default markers in react-leaflet
delete (Icon.Default.prototype as any)._getIconUrl
Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

interface LocationData {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: string
}

interface LocationHistory {
  id: string
  latitude: number
  longitude: number
  accuracy: number
  location_timestamp: string
  is_active: boolean
}

interface UserLocationMapProps {
  currentLocation: LocationData | null
  locationHistory: LocationHistory[]
  isTracking: boolean
}

// Component to handle map centering
function MapController({ center, zoom }: { center: LatLngTuple, zoom: number }) {
  const map = useMap()
  
  useEffect(() => {
    if (center) {
      map.setView(center, zoom)
    }
  }, [map, center, zoom])
  
  return null
}

export default function UserLocationMap({ 
  currentLocation, 
  locationHistory, 
  isTracking 
}: UserLocationMapProps) {
  const [mapCenter, setMapCenter] = useState<LatLngTuple>([14.5995, 120.9842]) // Default to Philippines
  const [mapZoom, setMapZoom] = useState(10)
  const mapRef = useRef<any>(null)

  // Update map center when current location changes
  useEffect(() => {
    if (currentLocation) {
      const newCenter: LatLngTuple = [currentLocation.latitude, currentLocation.longitude]
      setMapCenter(newCenter)
      setMapZoom(15)
    } else if (locationHistory.length > 0) {
      // Center on the most recent location
      const latest = locationHistory[0]
      const newCenter: LatLngTuple = [latest.latitude, latest.longitude]
      setMapCenter(newCenter)
      setMapZoom(13)
    }
  }, [currentLocation, locationHistory])

  // Create polyline path from location history
  const pathCoordinates: LatLngTuple[] = locationHistory
    .slice(0, 50) // Limit to last 50 points for performance
    .reverse() // Show path from oldest to newest
    .map(location => [location.latitude, location.longitude])

  // Create custom icons
  const currentLocationIcon = new Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  })

  const historyLocationIcon = new Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [20, 33],
    iconAnchor: [10, 33],
    popupAnchor: [1, -27],
    shadowSize: [33, 33]
  })

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatAccuracy = (accuracy: number) => {
    return `±${Math.round(accuracy)}m`
  }

  return (
    <div className="h-96 w-full rounded-lg overflow-hidden">
      <MapContainer
        ref={mapRef}
        center={mapCenter}
        zoom={mapZoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapController center={mapCenter} zoom={mapZoom} />

        {/* Current Location Marker */}
        {currentLocation && (
          <Marker
            position={[currentLocation.latitude, currentLocation.longitude]}
            icon={currentLocationIcon}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold text-red-600 mb-2">Current Location</div>
                <div><strong>Coordinates:</strong> {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}</div>
                <div><strong>Accuracy:</strong> {formatAccuracy(currentLocation.accuracy)}</div>
                <div><strong>Time:</strong> {formatTime(currentLocation.timestamp)}</div>
                {isTracking && (
                  <div className="mt-2 flex items-center text-green-600">
                    <div className="h-2 w-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                    Live tracking
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Location History Markers (show last 10 for performance) */}
        {locationHistory.slice(0, 10).map((location, index) => (
          <Marker
            key={location.id}
            position={[location.latitude, location.longitude]}
            icon={historyLocationIcon}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold text-blue-600 mb-2">
                  Location #{locationHistory.length - index}
                </div>
                <div><strong>Coordinates:</strong> {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</div>
                <div><strong>Accuracy:</strong> {formatAccuracy(location.accuracy)}</div>
                <div><strong>Time:</strong> {formatTime(location.location_timestamp)}</div>
                <div><strong>Status:</strong> {location.is_active ? 'Active' : 'Inactive'}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Path Line */}
        {pathCoordinates.length > 1 && (
          <Polyline
            positions={pathCoordinates}
            color="blue"
            weight={3}
            opacity={0.7}
          />
        )}
      </MapContainer>

      {/* Map Legend */}
      <div className="mt-4 flex items-center justify-center space-x-6 text-xs text-gray-600">
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span>Current Location</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <span>Location History</span>
        </div>
        {pathCoordinates.length > 1 && (
          <div className="flex items-center space-x-1">
            <div className="w-6 h-0.5 bg-blue-500"></div>
            <span>Path</span>
          </div>
        )}
      </div>

      {/* Location Stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="text-center">
          <div className="font-semibold text-gray-900">{locationHistory.length}</div>
          <div className="text-gray-600">Total Locations</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-gray-900">
            {currentLocation ? formatAccuracy(currentLocation.accuracy) : 'N/A'}
          </div>
          <div className="text-gray-600">Current Accuracy</div>
        </div>
      </div>
    </div>
  )
}
