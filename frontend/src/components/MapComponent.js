import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import { useRouteStore } from '../store/routeStore';
import { t } from '../i18n';
import RouteControls from './RouteControls';
import ElevationProfile from './ElevationProfile';
import SavedRoutesPanel from './SavedRoutesPanel';
import GroupRidesPanel from './GroupRidesPanel';
import '../styles/Map.css';

const TILE_URL = process.env.REACT_APP_TILE_URL
  || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = process.env.REACT_APP_TILE_ATTRIBUTION
  || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const routeDragPreviewIcon = L.divIcon({
  className: 'route-drag-preview',
  html: '<span></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});
const routeSnapFeedbackIcon = L.divIcon({
  className: 'route-snap-feedback',
  html: '<span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

function MapInteractionHandler({ onMapClick, onMapMouseMove, onMapMouseUp }) {
  useMapEvents({
    click: onMapClick,
    mousemove: onMapMouseMove,
    mouseup: onMapMouseUp
  });

  return null;
}

function MapInstanceBinder({ mapRef }) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);

  return null;
}

function MapComponent({ isMapVisible = true }) {
  const {
    route, returnRoute, startPoint, endPoint, waypoints,
    setStartPoint, setEndPoint, addWaypoint, insertWaypoint, updateWaypoint,
    calculateRoute,
    loading
  } = useRouteStore();
  const [mapCenter] = useState([51.505, 10.09]); // Germany center
  const [snapFeedback, setSnapFeedback] = useState(null);
  const [routeDrag, setRouteDrag] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [gpsTracking, setGpsTracking] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState('plan');
  const mapRef = useRef();
  const mapWrapperRef = useRef(null);
  const fittedRouteKeyRef = useRef(null);
  const snapFeedbackTimeoutRef = useRef(null);
  const routeDragRef = useRef(null);
  const suppressNextMapClickRef = useRef(false);
  const gpsWatchIdRef = useRef(null);
  const gpsHasCenteredRef = useRef(false);
  const routePositions = route && route.geometry && Array.isArray(route.geometry.coordinates)
    ? route.geometry.coordinates
      .filter((coord) => Array.isArray(coord) && coord.length >= 2 && Number.isFinite(Number(coord[0])) && Number.isFinite(Number(coord[1])))
      .map((coord) => [Number(coord[1]), Number(coord[0])])
    : null;
  const returnRoutePositions = returnRoute && returnRoute.geometry && Array.isArray(returnRoute.geometry.coordinates)
    ? returnRoute.geometry.coordinates
      .filter((coord) => Array.isArray(coord) && coord.length >= 2 && Number.isFinite(Number(coord[0])) && Number.isFinite(Number(coord[1])))
      .map((coord) => [Number(coord[1]), Number(coord[0])])
    : null;
  const waypointAnchors = useMemo(
    () => getWaypointAnchorsOnRoute(waypoints, routePositions),
    [waypoints, routePositions]
  );
  const isFullscreen = isNativeFullscreen || isPseudoFullscreen;

  const handleMapClick = (e) => {
    if (suppressNextMapClickRef.current) {
      suppressNextMapClickRef.current = false;
      return;
    }

    const { lat, lng } = e.latlng;
    if (!startPoint) {
      setStartPoint([lat, lng]);
    } else if (!endPoint) {
      setEndPoint([lat, lng]);
    } else if (!routePositions) {
      addWaypoint([lat, lng]);
    }
  };

  const beginRouteDrag = (latlng) => {
    if (!Array.isArray(routePositions) || routePositions.length < 2) {
      return;
    }

    const grabbedPoint = [latlng.lat, latlng.lng];
    const guessedIndex = findNearestRoutePointIndex(routePositions, grabbedPoint);
    const snapped = snapPointToRoute(grabbedPoint, routePositions, guessedIndex);
    const snappedRouteIndex = Math.round(snapped.routeIndex);
    const waypointCandidate = findWaypointNearRouteIndex(waypointAnchors, snappedRouteIndex, 20);
    const draft = {
      point: snapped.point,
      routeIndex: snappedRouteIndex,
      waypointId: waypointCandidate ? waypointCandidate.id : null
    };

    routeDragRef.current = draft;
    setRouteDrag(draft);

    const map = mapRef.current;
    if (map && map.dragging) {
      map.dragging.disable();
    }
  };

  const handleMapMouseMove = (e) => {
    if (!routeDragRef.current || !Array.isArray(routePositions) || routePositions.length < 2) {
      return;
    }

    const movingPoint = [e.latlng.lat, e.latlng.lng];
    const snapped = snapPointToRoute(movingPoint, routePositions, routeDragRef.current.routeIndex);
    const nextDraft = {
      ...routeDragRef.current,
      point: snapped.point,
      routeIndex: Math.round(snapped.routeIndex)
    };

    routeDragRef.current = nextDraft;
    setRouteDrag(nextDraft);
  };

  const handleMapMouseUp = () => {
    const draft = routeDragRef.current;
    if (!draft || !Array.isArray(routePositions) || routePositions.length < 2) {
      return;
    }

    const snappedPoint = draft.point;
    const snappedRouteIndex = draft.routeIndex;
    showSnapFeedback(snappedPoint);

    if (draft.waypointId) {
      const existingIndex = waypoints.findIndex((waypoint) => waypoint.id === draft.waypointId);
      const label = existingIndex >= 0
        ? (waypoints[existingIndex].label || `${t('route.locations.waypoint')} ${existingIndex + 1}`)
        : `${t('route.locations.waypoint')} 1`;
      updateWaypoint(draft.waypointId, snappedPoint, label).then(() => {
        if (startPoint && endPoint) {
          calculateRoute();
        }
      });
    } else {
      const insertIndex = getInsertWaypointIndexForHandle(snappedRouteIndex, waypointAnchors, waypoints.length);
      insertWaypoint(snappedPoint, `${t('route.locations.waypoint')} ${insertIndex + 1}`, insertIndex).then(() => {
        if (startPoint && endPoint) {
          calculateRoute();
        }
      });
    }

    routeDragRef.current = null;
    setRouteDrag(null);
    suppressNextMapClickRef.current = true;

    const map = mapRef.current;
    if (map && map.dragging) {
      map.dragging.enable();
    }
  };

  useEffect(() => () => {
    if (snapFeedbackTimeoutRef.current) {
      clearTimeout(snapFeedbackTimeoutRef.current);
    }

    const map = mapRef.current;
    if (map && map.dragging) {
      map.dragging.enable();
    }

    if (gpsWatchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
  }, []);

  const stopGpsTracking = () => {
    if (gpsWatchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setGpsTracking(false);
  };

  const startGpsTracking = () => {
    if (!navigator.geolocation) {
      setGpsError(t('map.gpsUnavailable'));
      return;
    }

    setGpsError('');
    gpsHasCenteredRef.current = false;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = Number(position.coords.latitude);
        const lng = Number(position.coords.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }

        const nextPoint = [lat, lng];
        setCurrentLocation(nextPoint);
        setGpsTracking(true);
        setGpsError('');

        const map = mapRef.current;
        if (map && !gpsHasCenteredRef.current) {
          map.flyTo(nextPoint, Math.max(14, map.getZoom()), {
            animate: true,
            duration: 0.45
          });
          gpsHasCenteredRef.current = true;
        }
      },
      (error) => {
        if (error && error.code === error.PERMISSION_DENIED) {
          setGpsError(t('map.gpsPermissionDenied'));
        } else if (error && error.code === error.TIMEOUT) {
          setGpsError(t('map.gpsTimeout'));
        } else {
          setGpsError(t('map.gpsPositionUnavailable'));
        }
        stopGpsTracking();
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 8000
      }
    );

    gpsWatchIdRef.current = watchId;
    setGpsTracking(true);
  };

  const toggleGpsTracking = () => {
    if (gpsTracking) {
      stopGpsTracking();
      return;
    }
    startGpsTracking();
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasGroupRideLink = Boolean(String(params.get('groupRide') || '').trim() && String(params.get('owner') || '').trim());
    const hasSharedRouteLink = Boolean(String(params.get('sharedRoute') || '').trim() && String(params.get('owner') || '').trim());

    if (hasGroupRideLink) {
      setActiveTab('community');
      return;
    }

    if (hasSharedRouteLink) {
      setActiveTab('routes');
    }
  }, []);

  useEffect(() => {
    const onTabChanged = (event) => {
      const tab = String(event?.detail?.tab || '').trim() || 'plan';
      setActiveTab(tab);
    };

    window.addEventListener('routeshred:tab-changed', onTabChanged);
    return () => window.removeEventListener('routeshred:tab-changed', onTabChanged);
  }, []);

  useEffect(() => {
    if (!isMapVisible) {
      if (document.fullscreenElement === mapWrapperRef.current) {
        document.exitFullscreen().catch(() => {});
      }
      setIsPseudoFullscreen(false);
      stopGpsTracking();
      setGpsError('');
    }
  }, [isMapVisible]);

  useEffect(() => {
    const hasOutbound = Array.isArray(routePositions) && routePositions.length >= 2;
    const hasReturn = Array.isArray(returnRoutePositions) && returnRoutePositions.length >= 2;
    if (!route || !route.timestamp || (!hasOutbound && !hasReturn)) {
      return;
    }

    if (fittedRouteKeyRef.current === route.timestamp) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    const allPositions = [
      ...(hasOutbound ? routePositions : []),
      ...(hasReturn ? returnRoutePositions : [])
    ];
    const bounds = L.latLngBounds(allPositions);
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: 15,
        animate: true,
        duration: 0.45
      });
      fittedRouteKeyRef.current = route.timestamp;
    }
  }, [route, routePositions, returnRoutePositions]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === mapWrapperRef.current);
      const map = mapRef.current;
      if (map) {
        setTimeout(() => map.invalidateSize(), 0);
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    const mapWrapper = mapWrapperRef.current;
    if (!mapWrapper) {
      return;
    }

    const hasNativeFullscreen = Boolean(document.fullscreenEnabled && mapWrapper.requestFullscreen);

    if (!hasNativeFullscreen) {
      setIsPseudoFullscreen((prev) => !prev);
      return;
    }

    try {
      if (document.fullscreenElement === mapWrapper) {
        await document.exitFullscreen();
      } else {
        await mapWrapper.requestFullscreen();
      }
    } catch (_) {
      // Ignore fullscreen API errors (for example user gesture restrictions).
    }
  };

  useEffect(() => {
    if (isPseudoFullscreen) {
      document.body.classList.add('map-pseudo-fullscreen');
    } else {
      document.body.classList.remove('map-pseudo-fullscreen');
    }

    const map = mapRef.current;
    if (map) {
      setTimeout(() => map.invalidateSize(), 0);
    }

    return () => document.body.classList.remove('map-pseudo-fullscreen');
  }, [isPseudoFullscreen]);

  const showSnapFeedback = (point) => {
    if (snapFeedbackTimeoutRef.current) {
      clearTimeout(snapFeedbackTimeoutRef.current);
    }

    setSnapFeedback({ point, id: Date.now() });
    snapFeedbackTimeoutRef.current = setTimeout(() => {
      setSnapFeedback(null);
      snapFeedbackTimeoutRef.current = null;
    }, 650);
  };

  const showSocialSurface = isMapVisible && (activeTab === 'community' || activeTab === 'routes');
  const showRoutesSurface = isMapVisible && activeTab === 'routes';
  const showCommunitySurface = isMapVisible && activeTab === 'community';

  return (
    <div className={`map-container${isMapVisible ? '' : ' map-hidden'}${showSocialSurface ? ' social-mode' : ''}`}>
      {isMapVisible && (
        <div
          ref={mapWrapperRef}
          className={`map-wrapper${showSocialSurface && !isFullscreen ? ' map-compact' : ''}${isFullscreen ? ' is-fullscreen' : ''}`}
        >
        <MapContainer
          center={mapCenter}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
        >
          <MapInstanceBinder mapRef={mapRef} />
          <MapInteractionHandler
            onMapClick={handleMapClick}
            onMapMouseMove={handleMapMouseMove}
            onMapMouseUp={handleMapMouseUp}
          />

          {/* OpenCycleMap layer for bike routing */}
          <TileLayer
            url={TILE_URL}
            attribution={TILE_ATTRIBUTION}
            maxZoom={18}
          />

          {/* Start point marker */}
          {startPoint && (
            <Marker
              position={startPoint}
              draggable
              eventHandlers={{
                dragend: async (event) => {
                  const { lat, lng } = event.target.getLatLng();
                  await setStartPoint([lat, lng], t('route.locations.start'));
                  if (endPoint) {
                    await calculateRoute();
                  }
                }
              }}
            >
              <Popup>{t('map.startPopup')}</Popup>
            </Marker>
          )}

          {/* End point marker */}
          {endPoint && (
            <Marker
              position={endPoint}
              draggable
              eventHandlers={{
                dragend: async (event) => {
                  const { lat, lng } = event.target.getLatLng();
                  await setEndPoint([lat, lng], t('route.locations.end'));
                  if (startPoint) {
                    await calculateRoute();
                  }
                }
              }}
            >
              <Popup>{t('map.endPopup')}</Popup>
            </Marker>
          )}

          {waypoints.filter((waypoint) => waypoint.point).map((waypoint, index) => (
            <Marker
              key={waypoint.id}
              position={waypoint.point}
              draggable
              eventHandlers={{
                dragend: async (event) => {
                  const { lat, lng } = event.target.getLatLng();
                  await updateWaypoint(waypoint.id, [lat, lng], waypoint.label || `${t('route.locations.waypoint')} ${index + 1}`);
                  if (startPoint && endPoint) {
                    await calculateRoute();
                  }
                }
              }}
            >
              <Popup>{t('route.locations.waypoint')} {index + 1}</Popup>
            </Marker>
          ))}

          {currentLocation && (
            <Marker position={currentLocation} icon={currentLocationIcon}>
              <Popup>{t('map.currentLocationPopup')}</Popup>
            </Marker>
          )}

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
                className={`route-line-core${routeDrag ? ' route-line-dragging' : ''}`}
                eventHandlers={{
                  mousedown: (event) => beginRouteDrag(event.latlng)
                }}
              />
              <Polyline
                positions={routePositions}
                color="#ffe27a"
                weight={3}
                opacity={0.95}
                lineCap="round"
                lineJoin="round"
                className="route-line-highlight"
                eventHandlers={{
                  mousedown: (event) => beginRouteDrag(event.latlng)
                }}
              />
              {snapFeedback && (
                <Marker
                  key={`snap-${snapFeedback.id}`}
                  position={snapFeedback.point}
                  icon={routeSnapFeedbackIcon}
                  interactive={false}
                  keyboard={false}
                />
              )}
              {routeDrag && routeDrag.point && (
                <Marker
                  key={`drag-preview-${routeDrag.routeIndex}`}
                  position={routeDrag.point}
                  icon={routeDragPreviewIcon}
                  interactive={false}
                  keyboard={false}
                />
              )}
            </>
          )}

          {returnRoutePositions && (
            <>
              <Polyline
                positions={returnRoutePositions}
                color="#0f172a"
                weight={9}
                opacity={0.45}
                lineCap="round"
                lineJoin="round"
              />
              <Polyline
                positions={returnRoutePositions}
                color="#2f7dd1"
                weight={5}
                opacity={0.85}
                dashArray="10 8"
                lineCap="round"
                lineJoin="round"
              />
            </>
          )}
        </MapContainer>

        <div className="map-overlay-controls">
          <button
            type="button"
            className={`fullscreen-toggle${isFullscreen ? ' is-active' : ''}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? t('map.exitFullscreen') : t('map.enterFullscreen')}
          >
            {isFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
            <span>{isFullscreen ? t('map.exitFullscreen') : t('map.enterFullscreen')}</span>
          </button>
          <button
            type="button"
            className={`gps-toggle${gpsTracking ? ' is-active' : ''}`}
            onClick={toggleGpsTracking}
            title={gpsTracking ? t('map.gpsDisable') : t('map.gpsEnable')}
          >
            {gpsTracking ? t('map.gpsDisable') : t('map.gpsEnable')}
          </button>
          {gpsError && <p className="gps-status gps-status-error">{gpsError}</p>}
          {!gpsError && gpsTracking && <p className="gps-status">{t('map.gpsTrackingOn')}</p>}
        </div>
      </div>
      )}

      {showRoutesSurface && (
        <section className="community-surface">
          <SavedRoutesPanel context="mixed" />
        </section>
      )}

      {showCommunitySurface && (
        <section className="community-surface">
          <GroupRidesPanel />
        </section>
      )}

      <div className={`controls-panel${showSocialSurface ? ' controls-hidden' : ''}`}>
        <RouteControls socialSurfacesMoved={showSocialSurface} />
        {route && !showSocialSurface && activeTab !== 'setup' && <ElevationProfile route={route} />}
      </div>

      {loading && <div className="loading">{t('route.calculating')}</div>}
    </div>
  );
}

const currentLocationIcon = L.divIcon({
  className: 'current-location-marker',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

function getWaypointAnchorsOnRoute(waypoints, routePositions) {
  if (!Array.isArray(routePositions) || !routePositions.length) {
    return [];
  }

  const anchors = [];
  waypoints.forEach((waypoint, originalIndex) => {
    if (!Array.isArray(waypoint.point) || waypoint.point.length < 2) {
      return;
    }

    const routeIndex = findNearestRoutePointIndex(routePositions, waypoint.point);
    anchors.push({
      id: waypoint.id,
      originalIndex,
      routeIndex
    });
  });

  return anchors.sort((a, b) => a.routeIndex - b.routeIndex);
}

function getInsertWaypointIndexForHandle(handleRouteIndex, waypointAnchors, fallbackLength) {
  if (!Array.isArray(waypointAnchors) || !waypointAnchors.length) {
    return fallbackLength;
  }

  const nextAnchor = waypointAnchors.find((anchor) => anchor.routeIndex > handleRouteIndex);
  if (nextAnchor) {
    return nextAnchor.originalIndex;
  }

  return waypointAnchors[waypointAnchors.length - 1].originalIndex + 1;
}

function findWaypointNearRouteIndex(waypointAnchors, routeIndex, maxIndexDelta = 20) {
  if (!Array.isArray(waypointAnchors) || !waypointAnchors.length) {
    return null;
  }

  let best = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const anchor of waypointAnchors) {
    const delta = Math.abs(anchor.routeIndex - routeIndex);
    if (delta <= maxIndexDelta && delta < bestDelta) {
      best = anchor;
      bestDelta = delta;
    }
  }

  return best;
}

function findNearestRoutePointIndex(routePositions, point) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < routePositions.length; i++) {
    const distance = distanceKm(routePositions[i], point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function snapPointToRoute(point, routePositions, centerIndex = null) {
  if (!Array.isArray(routePositions) || routePositions.length < 2) {
    return { point, routeIndex: Number.isFinite(centerIndex) ? centerIndex : 0 };
  }

  const n = routePositions.length;
  const hasCenter = Number.isFinite(centerIndex);
  const windowSize = 120;
  const from = hasCenter ? Math.max(0, Math.floor(centerIndex) - windowSize) : 0;
  const to = hasCenter ? Math.min(n - 2, Math.floor(centerIndex) + windowSize) : n - 2;

  const snappedInWindow = projectToRouteSegments(point, routePositions, from, to);
  if (snappedInWindow) {
    return snappedInWindow;
  }

  const snappedGlobal = projectToRouteSegments(point, routePositions, 0, n - 2);
  return snappedGlobal || { point, routeIndex: Number.isFinite(centerIndex) ? centerIndex : 0 };
}

function projectToRouteSegments(point, routePositions, startSegment, endSegment) {
  let best = null;

  for (let i = startSegment; i <= endSegment; i++) {
    const a = routePositions[i];
    const b = routePositions[i + 1];
    if (!a || !b) {
      continue;
    }

    const projected = projectPointToSegment(point, a, b);
    if (!best || projected.distanceKm < best.distanceKm) {
      best = {
        point: projected.point,
        routeIndex: i + projected.t,
        distanceKm: projected.distanceKm
      };
    }
  }

  return best;
}

function projectPointToSegment(point, segA, segB) {
  const refLat = point[0];
  const kmPerLat = 111.32;
  const kmPerLon = Math.max(1e-6, 111.32 * Math.cos(refLat * Math.PI / 180));

  const px = point[1] * kmPerLon;
  const py = point[0] * kmPerLat;
  const ax = segA[1] * kmPerLon;
  const ay = segA[0] * kmPerLat;
  const bx = segB[1] * kmPerLon;
  const by = segB[0] * kmPerLat;

  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  const tRaw = ab2 > 1e-12 ? ((px - ax) * abx + (py - ay) * aby) / ab2 : 0;
  const t = Math.max(0, Math.min(1, tRaw));

  const projX = ax + t * abx;
  const projY = ay + t * aby;
  const dx = px - projX;
  const dy = py - projY;

  return {
    point: [projY / kmPerLat, projX / kmPerLon],
    distanceKm: Math.sqrt(dx * dx + dy * dy),
    t
  };
}

function distanceKm(a, b) {
  const radiusKm = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default MapComponent;
