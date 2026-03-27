import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { Location, HistoryItem } from '../types';

// Custom marker icons
const currentIcon = L.divIcon({
  html: `<div style="
    width: 20px; height: 20px;
    background: #4B2E06;
    border: 3px solid #F5C40A;
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(75,46,6,0.2);
  "></div>`,
  className: '',
  iconAnchor: [10, 10],
});

const historyIcon = L.divIcon({
  html: `<div style="
    width: 10px; height: 10px;
    background: #F5C40A;
    border: 2px solid #4B2E06;
    border-radius: 50%;
  "></div>`,
  className: '',
  iconAnchor: [5, 5],
});

interface MapProps {
  currentLocation: Location;
  history: HistoryItem[];
}

const ChangeView = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 6, { animate: true });
  }, [center[0], center[1]]);
  return null;
};

// Extract lat/lng from history items that have coordinates embedded
const extractCoordsFromHistory = (history: HistoryItem[], currentLocation: Location): [number, number][] => {
  const points: [number, number][] = [];
  // Add history points that have coordinates
  for (const item of [...history].reverse()) {
    if ((item as any).lat && (item as any).lng) {
      points.push([(item as any).lat, (item as any).lng]);
    }
  }
  // Always end with current location
  points.push([currentLocation.lat, currentLocation.lng]);
  return points;
};

export const Map: React.FC<MapProps> = ({ currentLocation, history }) => {
  const position: [number, number] = [currentLocation.lat, currentLocation.lng];
  const routePoints = extractCoordsFromHistory(history, currentLocation);

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={position}
        zoom={6}
        scrollWheelZoom={true}
        className="h-full w-full"
        style={{ zIndex: 1 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ChangeView center={position} />

        {/* Route polyline if we have multiple points */}
        {routePoints.length > 1 && (
          <Polyline
            positions={routePoints}
            pathOptions={{ color: '#4B2E06', weight: 3, dashArray: '8 4', opacity: 0.7 }}
          />
        )}

        {/* History stop markers */}
        {history.map((item, index) => {
          if (!(item as any).lat || !(item as any).lng) return null;
          return (
            <Marker
              key={index}
              position={[(item as any).lat, (item as any).lng]}
              icon={historyIcon}
            >
              <Popup>
                <div className="p-1 text-xs">
                  <p className="font-bold">{item.status}</p>
                  <p className="text-gray-500">{item.location}</p>
                  <p className="text-gray-400">{new Date(item.timestamp).toLocaleDateString()}</p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Current location marker with pulse */}
        <Circle
          center={position}
          radius={30000}
          pathOptions={{ color: '#4B2E06', fillColor: '#F5C40A', fillOpacity: 0.15, weight: 1 }}
        />
        <Marker position={position} icon={currentIcon}>
          <Popup>
            <div className="p-2 text-sm">
              <p className="font-bold text-ups-brown">📦 Current Location</p>
              <p className="text-gray-600 text-xs mt-1">{currentLocation.address}</p>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};
