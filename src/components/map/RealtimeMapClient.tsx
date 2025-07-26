'use client'

import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, LayersControl, ScaleControl } from 'react-leaflet'
import L from 'leaflet'
import { useEffect, useState } from 'react'
import { MapMarker } from '@/types'

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css'

// Map controller component to handle centering and zoom tracking
function MapController({ markers }: { markers: TrackedMarker[] }) {
  const map = useMap()
  const [hasInitialized, setHasInitialized] = useState(false)
  
  useEffect(() => {
    // Only set initial position once, then let user navigate freely
    if (!hasInitialized && markers.length > 0) {
      console.log('🎯 Initial map setup with first marker:', markers[0].position)
      map.setView(markers[0].position, 12)
      setHasInitialized(true)
    } else if (!hasInitialized && markers.length === 0) {
      // If no markers, center on Mindoro only once
      console.log('🎯 Initial map setup - centering on Mindoro')
      map.setView([13.0, 121.2], 10)
      setHasInitialized(true)
    }
    // After initialization, do NOT move the map automatically
    // This allows users to freely navigate and zoom
  }, [map, markers.length, hasInitialized])
  
  return null
}

// Component to track zoom level changes
function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap()
  
  useEffect(() => {
    const handleZoom = () => {
      const zoom = map.getZoom()
      onZoomChange(zoom)
    }
    
    // Set initial zoom
    handleZoom()
    
    // Listen for zoom changes
    map.on('zoomend', handleZoom)
    
    return () => {
      map.off('zoomend', handleZoom)
    }
  }, [map, onZoomChange])
  
  return null
}

// Custom map controls component
function MapControls({ markers }: { markers: TrackedMarker[] }) {
  const map = useMap()
  
  const goToLiveLocations = () => {
    if (markers.length === 0) return
    
    if (markers.length === 1) {
      // If only one marker, center on it
      map.setView(markers[0].position, 14)
    } else {
      // If multiple markers, fit all in view
      const group = L.featureGroup(markers.map(marker => L.marker(marker.position)))
      map.fitBounds(group.getBounds().pad(0.1))
    }
  }
  
  useEffect(() => {
    // Add scale control
    const scaleControl = L.control.scale({
      position: 'bottomleft',
      metric: true,
      imperial: false
    }).addTo(map)
    
    // Add custom "Go to Live" button using L.Control.extend
    const GoToLiveControl = L.Control.extend({
      onAdd: function() {
        const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom')
        div.innerHTML = `
          <button id="go-to-live" style="
            background: white;
            border: none;
            width: 40px;
            height: 40px;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 1px 5px rgba(0,0,0,0.65);
          " title="Go to Live Locations">
            🎯
          </button>
        `
        div.onclick = goToLiveLocations
        return div
      }
    })
    
    const goToLiveControl = new GoToLiveControl({ position: 'topright' })
    goToLiveControl.addTo(map)
    
    return () => {
      // Cleanup controls
      map.removeControl(scaleControl)
      map.removeControl(goToLiveControl)
    }
  }, [map, markers])
  
  return null
}

// Fix for default markers in react-leaflet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Custom police icon with dynamic sizing based on zoom
const createUserIcon = (isOnline: boolean = true, isRecentlyMoved: boolean = false, zoomLevel: number = 12) => {
  const iconColor = isOnline ? '#10B981' : '#6B7280' // Green for online, gray for offline
  const bgColor = isOnline ? '#DCFCE7' : '#F3F4F6'
  const badgeColor = isOnline ? '#059669' : '#9CA3AF'
  const pulseColor = isRecentlyMoved ? '#EF4444' : badgeColor // Red pulse for recent movement
  
  // Dynamic sizing based on zoom level
  // At zoom 8-10: smaller icons (24px)
  // At zoom 11-13: medium icons (32px) 
  // At zoom 14-16: normal icons (40px)
  // At zoom 17+: larger icons (48px)
  const getIconSize = (zoom: number) => {
    if (zoom <= 10) return { size: 24, fontSize: 14, badge: 6, ripple: 8 }
    if (zoom <= 13) return { size: 32, fontSize: 16, badge: 7, ripple: 10 }
    if (zoom <= 16) return { size: 40, fontSize: 20, badge: 8, ripple: 12 }
    return { size: 48, fontSize: 24, badge: 10, ripple: 14 }
  }
  
  const iconSizes = getIconSize(zoomLevel)
  const borderWidth = Math.max(2, Math.floor(iconSizes.size / 12)) // Dynamic border width
  
  return L.divIcon({
    html: `
      <div style="
        width: ${iconSizes.size}px;
        height: ${iconSizes.size}px;
        background-color: ${bgColor};
        border: ${borderWidth}px solid ${iconColor};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${iconSizes.fontSize}px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        position: relative;
        transition: all 0.2s ease-in-out;
        ${isRecentlyMoved ? 'animation: bounce 1s ease-in-out 3;' : ''}
      ">
        👮‍♂️
        <div style="
          position: absolute;
          top: -2px;
          right: -2px;
          width: ${iconSizes.badge}px;
          height: ${iconSizes.badge}px;
          background-color: ${pulseColor};
          border-radius: 50%;
          border: 1px solid white;
          ${isOnline || isRecentlyMoved ? 'animation: pulse 2s infinite;' : ''}
        "></div>
        ${isRecentlyMoved ? `
          <div style="
            position: absolute;
            top: -4px;
            right: -4px;
            width: ${iconSizes.ripple}px;
            height: ${iconSizes.ripple}px;
            background-color: rgba(239, 68, 68, 0.3);
            border-radius: 50%;
            animation: ripple 2s infinite;
          "></div>
        ` : ''}
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes bounce {
          0%, 20%, 53%, 80%, 100% { transform: translate3d(0,0,0); }
          40%, 43% { transform: translate3d(0,-8px,0); }
          70% { transform: translate3d(0,-4px,0); }
          90% { transform: translate3d(0,-2px,0); }
        }
        @keyframes ripple {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      </style>
    `,
    className: 'police-marker',
    iconSize: [iconSizes.size, iconSizes.size],
    iconAnchor: [iconSizes.size / 2, iconSizes.size / 2],
    popupAnchor: [0, -iconSizes.size / 2],
  })
}

interface RealtimeMapClientProps {
  markers: MapMarker[]
}

// Custom marker tracking for smooth movement
interface TrackedMarker extends MapMarker {
  previousPosition?: [number, number]
  isMoving?: boolean
  lastMoveTime?: number
}

export default function RealtimeMapClient({ markers }: RealtimeMapClientProps) {
  const [trackedMarkers, setTrackedMarkers] = useState<TrackedMarker[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting')
  const [currentZoom, setCurrentZoom] = useState<number>(12)

  // Update connection status based on marker updates
  useEffect(() => {
    if (markers.length > 0) {
      setConnectionStatus('connected')
      
      // Reset to connecting after 30 seconds of no updates to show we're still monitoring
      const timeout = setTimeout(() => {
        setConnectionStatus('connecting')
      }, 30000)
      
      return () => clearTimeout(timeout)
    }
  }, [markers])

  useEffect(() => {
    console.log('🗺️ RealtimeMapClient received markers:', markers.length)
    
    // Update tracked markers with movement detection
    setTrackedMarkers(prevTracked => {
      const now = Date.now()
      
      return markers.map(marker => {
        const existingMarker = prevTracked.find(t => t.id === marker.id)
        const previousPosition = existingMarker?.position
        const hasPositionChanged = previousPosition && 
          (previousPosition[0] !== marker.position[0] || previousPosition[1] !== marker.position[1])
        
        return {
          ...marker,
          previousPosition: existingMarker?.position,
          isMoving: hasPositionChanged,
          lastMoveTime: hasPositionChanged ? now : existingMarker?.lastMoveTime
        }
      })
    })
  }, [markers])

  // Default center - Mindoro, Philippines
  const defaultCenter: [number, number] = [13.0, 121.2] // Center of Mindoro
  const defaultZoom = 10 // Closer zoom for Mindoro focus

  // Calculate bounds to fit all markers, but keep Mindoro bounds
  const getMapBounds = () => {
    if (markers.length === 0) {
      console.log('No markers, using Mindoro bounds')
      // Mindoro bounds
      return L.latLngBounds(
        [12.2, 120.8], // Southwest corner
        [13.8, 121.6]  // Northeast corner
      )
    }
    
    console.log('Calculating bounds for', markers.length, 'markers')
    const markerBounds = L.latLngBounds(markers.map(marker => {
      console.log('Marker position:', marker.position)
      return marker.position
    }))
    
    // Ensure bounds include Mindoro area
    const mindoroBounds = L.latLngBounds(
      [12.2, 120.8], // Southwest corner
      [13.8, 121.6]  // Northeast corner
    )
    
    // Extend to include both marker bounds and Mindoro
    const combinedBounds = markerBounds.extend(mindoroBounds)
    console.log('Combined bounds with Mindoro:', combinedBounds)
    return combinedBounds
  }

  const mapCenter = markers.length > 0 ? markers[0].position : defaultCenter
  const mapBounds = getMapBounds()
  
  console.log('Map center:', mapCenter)
  console.log('Map bounds:', mapBounds)

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  return (
    <MapContainer
      center={mapCenter}
      zoom={defaultZoom}
      maxZoom={20} // Increased max zoom for much more detailed view
      minZoom={8}  // Set reasonable minimum zoom for Mindoro area
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      doubleClickZoom={true}
      scrollWheelZoom={true}
      dragging={true}
    >
      <MapController markers={trackedMarkers} />
      <ZoomTracker onZoomChange={setCurrentZoom} />
      <MapControls markers={trackedMarkers} />
      
      {/* Real-time status indicator with movement tracking */}
      <div className="absolute top-4 right-16 z-50 bg-white bg-opacity-95 px-3 py-2 rounded-lg shadow-md border">
        <div className="flex items-center space-x-2 text-sm">
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' :
            connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`}></div>
          <span className={`font-medium ${
            connectionStatus === 'connected' ? 'text-green-700' :
            connectionStatus === 'connecting' ? 'text-yellow-700' :
            'text-red-700'
          }`}>
            {connectionStatus === 'connected' ? 'Live' :
             connectionStatus === 'connecting' ? 'Monitoring' :
             'Disconnected'}
          </span>
          {trackedMarkers.length > 0 && (
            <>
              <span className="text-gray-600">
                • {trackedMarkers.length} user{trackedMarkers.length !== 1 ? 's' : ''}
              </span>
              {(() => {
                const movingCount = trackedMarkers.filter(marker => 
                  marker.isMoving || (marker.lastMoveTime && (Date.now() - marker.lastMoveTime) < 10000)
                ).length;
                return movingCount > 0 ? (
                  <span className="text-red-600 font-semibold animate-pulse">
                    • {movingCount} moving
                  </span>
                ) : null;
              })()}
            </>
          )}
        </div>
      </div>
      
      {/* Movement Activity Panel */}
      {(() => {
        const movingUsers = trackedMarkers.filter(marker => 
          marker.isMoving || (marker.lastMoveTime && (Date.now() - marker.lastMoveTime) < 30000) // Show for 30 seconds
        );
        
        return movingUsers.length > 0 ? (
          <div className="absolute top-20 right-4 z-50 bg-white bg-opacity-95 px-3 py-2 rounded-lg shadow-md border max-w-xs">
            <div className="text-sm font-semibold text-red-700 mb-2 flex items-center">
              🚨 Movement Activity
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {movingUsers.map(marker => {
                const secondsAgo = marker.lastMoveTime ? Math.floor((Date.now() - marker.lastMoveTime) / 1000) : 0;
                const isCurrentlyMoving = marker.isMoving || secondsAgo < 10;
                
                return (
                  <div key={marker.id} className={`text-xs flex items-center space-x-2 p-1 rounded ${
                    isCurrentlyMoving ? 'bg-red-100' : 'bg-yellow-100'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      isCurrentlyMoving ? 'bg-red-500 animate-pulse' : 'bg-yellow-500'
                    }`}></span>
                    <span className="font-medium">{marker.user.name}</span>
                    <span className="text-gray-600">
                      {isCurrentlyMoving ? 'moving now' : `${secondsAgo}s ago`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null;
      })()}
      
      {/* Zoom level indicator */}
      <div className="absolute bottom-4 right-4 z-50 bg-white bg-opacity-95 px-2 py-1 rounded shadow-md border">
        <div className="text-xs text-gray-600">
          Zoom: {currentZoom}
        </div>
      </div>
      
      {/* Layer control with multiple map types including high-resolution options */}
      <LayersControl position="topleft">
        <LayersControl.BaseLayer checked name="OpenStreetMap">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        
        <LayersControl.BaseLayer name="Satellite (Esri)">
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        
        <LayersControl.BaseLayer name="High-Res Satellite">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />
        </LayersControl.BaseLayer>
        
        <LayersControl.BaseLayer name="Terrain">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            maxZoom={17}
          />
        </LayersControl.BaseLayer>
        
        <LayersControl.BaseLayer name="Dark Mode">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />
        </LayersControl.BaseLayer>
      </LayersControl>
      
      {trackedMarkers.map((marker) => {
        console.log('🎯 Rendering marker:', marker.id, 'at position:', marker.position, 'is_active:', marker.location.is_active)
        
        // Check both time-based and database-based status
        const isRecentTime = new Date(marker.location.timestamp).getTime() > Date.now() - 5 * 60 * 1000 // 5 minutes
        const isActiveInDB = marker.location.is_active // Check database is_active status
        const isOnline = isRecentTime && isActiveInDB // User is online if both conditions are true
        
        const isRecentlyMoved = Boolean(marker.isMoving || (marker.lastMoveTime && (Date.now() - marker.lastMoveTime) < 10000)) // 10 seconds
        
        return (
          <Marker
            key={`${marker.id}-${marker.location.timestamp}`} // Include timestamp to force re-render on location update
            position={marker.position}
            icon={createUserIcon(isOnline, isRecentlyMoved, currentZoom)}
          >
            {/* Hover Tooltip with enhanced movement info */}
            <Tooltip permanent={false} direction="top" offset={[0, -20]}>
              <div className="text-center">
                <div className="font-semibold">{marker.user.name}</div>
                <div className="text-xs">
                  {isRecentlyMoved ? (
                    <span className="text-red-600 font-bold animate-pulse">
                      🔴 MOVING NOW!
                    </span>
                  ) : isOnline ? (
                    '🟢 Online'
                  ) : (
                    '⚪ Offline'
                  )}
                </div>
                {isRecentlyMoved && marker.previousPosition && (
                  <div className="text-xs text-red-500 mt-1">
                    {(() => {
                      const [prevLat, prevLng] = marker.previousPosition!;
                      const [currLat, currLng] = marker.position;
                      const distance = Math.sqrt(
                        Math.pow((currLat - prevLat) * 111000, 2) + 
                        Math.pow((currLng - prevLng) * 111000 * Math.cos(currLat * Math.PI / 180), 2)
                      );
                      return distance > 1 ? `${Math.round(distance)}m moved` : 'Position updated';
                    })()}
                  </div>
                )}
              </div>
            </Tooltip>
            
            {/* Click Popup */}
            <Popup className="custom-popup" closeButton={true} maxWidth={250}>
              <div className="p-2 min-w-[200px]">
                <div className="border-b pb-2 mb-2">
                  <h3 className="font-semibold text-lg text-gray-800">
                    {marker.user.name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {marker.user.email}
                  </p>
                </div>
                
                {marker.user.phone && (
                  <div className="mb-2">
                    <p className="text-sm font-medium text-gray-700">Phone:</p>
                    <p className="text-sm text-gray-600">{marker.user.phone}</p>
                  </div>
                )}
                
                <div className="mb-2">
                  <p className="text-sm font-medium text-gray-700">Location:</p>
                  <p className="text-xs text-gray-500">
                    Lat: {marker.position[0].toFixed(6)}, Lng: {marker.position[1].toFixed(6)}
                  </p>
                </div>
                
                <div className="mb-2">
                  <p className="text-sm font-medium text-gray-700">Accuracy:</p>
                  <p className="text-xs text-gray-500">
                    ±{marker.location.accuracy?.toFixed(0) || 'Unknown'} meters
                  </p>
                </div>
                
                <div className="mb-2">
                  <p className="text-sm font-medium text-gray-700">Last Update:</p>
                  <p className="text-xs text-gray-500">
                    {formatTimestamp(marker.location.timestamp)}
                  </p>
                </div>
                
                {marker.isMoving && (
                  <div className="mb-2 p-2 bg-red-50 rounded border border-red-200">
                    <p className="text-sm font-medium text-red-700 flex items-center">
                      🚨 Movement Detected
                    </p>
                    <p className="text-xs text-red-600">User is currently moving</p>
                    {marker.previousPosition && (() => {
                      const [prevLat, prevLng] = marker.previousPosition;
                      const [currLat, currLng] = marker.position;
                      
                      // Calculate distance moved
                      const distance = Math.sqrt(
                        Math.pow((currLat - prevLat) * 111000, 2) + 
                        Math.pow((currLng - prevLng) * 111000 * Math.cos(currLat * Math.PI / 180), 2)
                      );
                      
                      // Calculate direction
                      const bearing = Math.atan2(
                        currLng - prevLng,
                        currLat - prevLat
                      ) * 180 / Math.PI;
                      
                      const direction = bearing >= -22.5 && bearing < 22.5 ? 'North' :
                                      bearing >= 22.5 && bearing < 67.5 ? 'Northeast' :
                                      bearing >= 67.5 && bearing < 112.5 ? 'East' :
                                      bearing >= 112.5 && bearing < 157.5 ? 'Southeast' :
                                      bearing >= 157.5 || bearing < -157.5 ? 'South' :
                                      bearing >= -157.5 && bearing < -112.5 ? 'Southwest' :
                                      bearing >= -112.5 && bearing < -67.5 ? 'West' : 'Northwest';
                      
                      return (
                        <div className="mt-1 space-y-1">
                          {distance > 1 && (
                            <p className="text-xs text-red-600">
                              Distance: {Math.round(distance)}m
                            </p>
                          )}
                          {distance > 5 && (
                            <p className="text-xs text-red-600">
                              Direction: {direction}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
                
                <div className="mt-3 pt-2 border-t">
                  <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    isRecentlyMoved 
                      ? 'bg-red-100 text-red-800' 
                      : isOnline 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                  }`}>
                    <div className={`w-2 h-2 rounded-full mr-1 ${
                      isRecentlyMoved 
                        ? 'bg-red-400' 
                        : isOnline 
                          ? 'bg-green-400' 
                          : 'bg-gray-400'
                    }`}></div>
                    {isRecentlyMoved ? 'Moving Now!' : isOnline ? 'Online' : 'Last seen'}
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
