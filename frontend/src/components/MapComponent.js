import React, { useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useRouteStore } from '../store/routeStore';
import { t } from '../i18n';
import RouteControls from './RouteControls';
import ElevationProfile from './ElevationProfile';
import '../styles/Map.css';

const TILE_URL = process.env.REACT_APP_TILE_URL
  || 'https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=007b5abe80db44699c19474ee8d9500b';
const TILE_ATTRIBUTION = process.env.REACT_APP_TILE_ATTRIBUTION
  || '&copy; <a href="https://www.opencyclemap.org">OpenCycleMap</a>';

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: onMapClick
  });

  return null;
}

function MapComponent() {
  const { route, startPoint, endPoint, waypoints, setStartPoint, setEndPoint, addWaypoint, loading } = useRouteStore();
  const [mapCenter] = useState([51.505, 10.09]); // Germany center
  const mapRef = useRef();
  const routePositions = route && route.geometry
    ? route.geometry.coordinates.map(coord => [coord[1], coord[0]])
    : null;

  const handleMapClick = (e) => {
    const { lat, lng } = e.latlng;
    if (!startPoint) {
      setStartPoint([lat, lng]);
    } else if (!endPoint) {
      setEndPoint([lat, lng]);
    } else {
      addWaypoint([lat, lng]);
    }
  };

  return (
    <div className="map-container">
      <div className="map-wrapper">
        <MapContainer
          center={mapCenter}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <MapClickHandler onMapClick={handleMapClick} />

          {/* OpenCycleMap layer for bike routing */}
          <TileLayer
            url={TILE_URL}
            attribution={TILE_ATTRIBUTION}
            maxZoom={18}
          />

          {/* Start point marker */}
          {startPoint && (
            <Marker position={startPoint}>
              <Popup>{t('map.startPopup')}: {startPoint[0].toFixed(4)}, {startPoint[1].toFixed(4)}</Popup>
            </Marker>
          )}

          {/* End point marker */}
          {endPoint && (
            <Marker position={endPoint}>
              <Popup>{t('map.endPopup')}: {endPoint[0].toFixed(4)}, {endPoint[1].toFixed(4)}</Popup>
            </Marker>
          )}

          {waypoints.filter((waypoint) => waypoint.point).map((waypoint, index) => (
            <Marker key={waypoint.id} position={waypoint.point}>
              <Popup>{t('route.locations.waypoint')} {index + 1}: {waypoint.point[0].toFixed(4)}, {waypoint.point[1].toFixed(4)}</Popup>
            </Marker>
          ))}

          {/* Route polyline with high-contrast casing for OpenCycleMap */}
          {routePositions && (
            <>
              <Polyline
                positions={routePositions}
                color="#111111"
                weight={12}
                opacity={0.72}
                lineCap="round"
                lineJoin="round"
                className="route-line-casing"
              />
              <Polyline
                positions={routePositions}
                color="#ff5a1f"
                weight={8}
                opacity={0.96}
                lineCap="round"
                lineJoin="round"
                className="route-line-core"
              />
              <Polyline
                positions={routePositions}
                color="#ffe27a"
                weight={3}
                opacity={0.95}
                lineCap="round"
                lineJoin="round"
                className="route-line-highlight"
              />
            </>
          )}
        </MapContainer>
      </div>

      <div className="controls-panel">
        <RouteControls />
        {route && <ElevationProfile route={route} />}
      </div>

      {loading && <div className="loading">{t('route.calculating')}</div>}
    </div>
  );
}

export default MapComponent;
