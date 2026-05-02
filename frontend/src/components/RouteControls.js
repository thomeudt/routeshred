import React, { useEffect, useState } from 'react';
import { useRouteStore } from '../store/routeStore';
import { t } from '../i18n';
import {
  FiAlertTriangle,
  FiArrowDown,
  FiArrowUp,
  FiCheckCircle,
  FiRepeat,
  FiDownload,
  FiMenu,
  FiNavigation,
  FiPlus,
  FiTrash2,
  FiZap,
  FiX
} from 'react-icons/fi';
import LocationInput from './LocationInput';
import RouteTypeStats from './RouteTypeStats';
import SavedRoutesPanel from './SavedRoutesPanel';
import { useAuth } from '../auth/AuthProvider';
import '../styles/RouteControls.css';

const RIDE_TYPES = [
  { id: 'z2' },
  { id: 'sst' },
  { id: 'tt' },
  { id: 'threshold' },
];

const PANEL_TABS = ['plan', 'library', 'setup'];

function formatSignedDuration(seconds = 0) {
  const totalSeconds = Math.round(Number(seconds || 0));
  const sign = totalSeconds > 0 ? '+' : totalSeconds < 0 ? '-' : '';
  const absSeconds = Math.abs(totalSeconds);
  const minutes = Math.floor(absSeconds / 60);
  const remainderSeconds = absSeconds % 60;

  if (absSeconds === 0) return '0 min';
  if (remainderSeconds === 0) return `${sign}${minutes} min`;
  if (minutes === 0) return `${sign}${remainderSeconds} s`;
  return `${sign}${minutes} min ${remainderSeconds} s`;
}

function getWindDirectionLabel(wind) {
  if (wind && wind.directionLabel) {
    return wind.directionLabel;
  }
  if (wind && Number.isFinite(Number(wind.directionDeg))) {
    return `${Math.round(Number(wind.directionDeg))} deg`;
  }
  return '-';
}

function getWeatherAlertItems(weatherAlerts) {
  if (!weatherAlerts || !weatherAlerts.alerts) {
    return [];
  }

  const items = [];
  const { alerts } = weatherAlerts;

  if (alerts.rain && alerts.rain.active) {
    items.push({
      id: 'rain',
      severity: alerts.rain.severity,
      text: t('route.weatherAlerts.rainWarning', {
        precipitation: Number(alerts.rain.precipitationMm || 0).toFixed(1)
      })
    });
  }

  if (alerts.storm && alerts.storm.active) {
    items.push({
      id: 'storm',
      severity: alerts.storm.severity,
      text: t('route.weatherAlerts.stormWarning', {
        wind: Math.round(Number(alerts.storm.windKmh) || 0),
        gust: Math.round(Number(alerts.storm.gustKmh) || 0)
      })
    });
  }

  if (alerts.heat && alerts.heat.active) {
    items.push({
      id: 'heat',
      severity: alerts.heat.severity,
      text: t('route.weatherAlerts.heatWarning', {
        temperature: Number(alerts.heat.temperatureC || 0).toFixed(1)
      })
    });
  }

  if (alerts.uv && alerts.uv.active) {
    items.push({
      id: 'uv',
      severity: alerts.uv.severity,
      text: t('route.weatherAlerts.uvWarning', {
        uv: Number(alerts.uv.uvIndex || 0).toFixed(1)
      })
    });
  }

  if (alerts.sidewind && alerts.sidewind.active) {
    items.push({
      id: 'sidewind',
      severity: alerts.sidewind.severity,
      text: t('route.weatherAlerts.sidewindWarning', {
        crosswind: Number(alerts.sidewind.crosswindKmh || 0).toFixed(1),
        direction: alerts.sidewind.windDirectionLabel || '-'
      })
    });
  }

  return items;
}

function getWeatherAgeLabel(weatherAlerts) {
  const measuredAt = weatherAlerts && weatherAlerts.measuredAt ? Date.parse(weatherAlerts.measuredAt) : NaN;
  if (!Number.isFinite(measuredAt)) {
    return '';
  }

  const ageMinutes = Math.max(0, Math.floor((Date.now() - measuredAt) / 60000));
  if (ageMinutes < 1) {
    return t('route.weatherAlerts.updatedNow');
  }
  return t('route.weatherAlerts.updatedMinutesAgo', { minutes: ageMinutes });
}

function RouteControls() {
  const { enabled: authEnabled, authenticated, token } = useAuth();
  const [engine, setEngine] = useState('unknown');
  const [activeTab, setActiveTab] = useState('plan');
  const [dragWaypointId, setDragWaypointId] = useState(null);
  const [dragGapIndex, setDragGapIndex] = useState(null);
  const {
    startPoint, endPoint,
    startLabel, endLabel, waypoints,
    bikeProfiles, bikeType, preference, rideType, riderProfile,
    loadBikeProfiles, setBikeType, setPreference, setRideType, setRiderProfile,
    includeReturnTrip, setIncludeReturnTrip,
    setStartPoint, setEndPoint, insertWaypoint, updateWaypoint, removeWaypoint, moveWaypoint,
    reverseRoute,
    calculateRoute, exportRoute, resetRoute,
    loadSavedRoutes,
    loading, route, returnRoute
  } = useRouteStore();

  useEffect(() => {
    let mounted = true;
    const loadEngine = async () => {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        const configured = data && data.routing ? data.routing.configuredEngine : null;
        if (mounted && configured) setEngine(String(configured).toUpperCase());
      } catch (_) {
        if (mounted) setEngine('UNKNOWN');
      }
    };
    loadEngine();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!bikeProfiles.length) {
      loadBikeProfiles();
    }
  }, [bikeProfiles.length, loadBikeProfiles]);

  useEffect(() => {
    if (authEnabled && authenticated && token) {
      loadSavedRoutes(token);
    }
  }, [authEnabled, authenticated, token, loadSavedRoutes]);

  useEffect(() => {
    if (activeTab === 'library' && (!authEnabled || !authenticated)) {
      setActiveTab('plan');
    }
  }, [activeTab, authEnabled, authenticated]);

  const handleCalculate = () => { if (startPoint && endPoint) calculateRoute(); };
  const handleExportTCX = () => { if (route) exportRoute('tcx'); };
  const handleExportGPX = () => { if (route) exportRoute('gpx'); };
  const handleResetRoute = () => { resetRoute(); };
  const handleRiderProfileChange = (field, value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return;
    }
    setRiderProfile({ [field]: numericValue });
  };

  const profileOptions = bikeProfiles.length
    ? bikeProfiles
    : [{ id: bikeType || 'road', label: t('common.loading'), source: 'fallback' }];
  const selectedProfile = profileOptions.find((profile) => profile.id === bikeType) || profileOptions[0];
  const pz = route && route.powerZone;
  const isDraggingWaypoint = Boolean(dragWaypointId);
  const visibleTabs = PANEL_TABS.filter((tab) => tab !== 'library' || (authEnabled && authenticated));
  const tempoFactors = route && route.tempoFactors ? route.tempoFactors : null;
  const tempoAdjustmentSeconds = tempoFactors
    ? Number(tempoFactors.adjustedDuration || 0) - Number(tempoFactors.baseDuration || 0)
    : 0;
  const frictionDelaySeconds = tempoFactors
    ? Number(tempoFactors.frictionDelaySeconds ?? tempoFactors.delaySeconds ?? 0)
    : 0;
  const windEffectSeconds = tempoFactors ? Number(tempoFactors.windEffectSeconds || 0) : 0;
  const windSummary = tempoFactors && tempoFactors.wind
    ? t('route.tempo.windDetails', {
      speed: Math.round(Number(tempoFactors.wind.speedKmh) || 0),
      direction: getWindDirectionLabel(tempoFactors.wind)
    })
    : '';
  const weatherAlerts = route && route.weatherAlerts ? route.weatherAlerts : null;
  const weatherAlertItems = getWeatherAlertItems(weatherAlerts);
  const hasWeatherWarnings = weatherAlertItems.length > 0;
  const weatherAgeLabel = getWeatherAgeLabel(weatherAlerts);

  const clearWaypointDrag = () => {
    setDragWaypointId(null);
    setDragGapIndex(null);
  };

  const handleWaypointDragStart = (event, waypointId) => {
    setDragWaypointId(waypointId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', waypointId);
  };

  const handleWaypointGapDragOver = (event, gapIndex) => {
    if (!dragWaypointId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragGapIndex(gapIndex);
  };

  const handleWaypointGapDrop = (event, gapIndex) => {
    event.preventDefault();
    if (!dragWaypointId) {
      return;
    }

    const fromIndex = waypoints.findIndex((waypoint) => waypoint.id === dragWaypointId);
    if (fromIndex === -1) {
      clearWaypointDrag();
      return;
    }

    const toIndex = gapIndex > fromIndex ? gapIndex - 1 : gapIndex;
    if (toIndex !== fromIndex) {
      moveWaypoint(fromIndex, toIndex);
    }
    clearWaypointDrag();
  };

  const getWaypointGapLabel = (gapIndex) => {
    if (isDraggingWaypoint) {
      return t('route.controls.dropHere');
    }

    if (!waypoints.length) {
      return t('route.controls.insertBetweenStartEnd');
    }

    if (gapIndex === 0) {
      return t('route.controls.insertAfterStart');
    }

    if (gapIndex === waypoints.length) {
      return t('route.controls.insertBeforeEnd');
    }

    return t('route.controls.insertBetweenWaypoints', {
      left: gapIndex,
      right: gapIndex + 1
    });
  };

  return (
    <div className="route-controls">
      <div className="route-controls-header">
        <h2>{t('route.planner')}</h2>
        <span className="engine-badge">{t('route.engine')}: {engine}</span>
      </div>

      <div
        className="route-panel-tabs"
        role="tablist"
        aria-label={t('route.tabs.label')}
        style={{ '--tab-count': visibleTabs.length }}
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {t(`route.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === 'library' && authEnabled && authenticated && <SavedRoutesPanel />}

      {activeTab === 'plan' && (
        <>
          <div className="control-group">
            <label>{t('route.locations.title')}</label>
            <div className="location-stack">
              <LocationInput
                label={t('route.locations.start')}
                value={startLabel}
                point={startPoint}
                onSelect={setStartPoint}
                onClear={() => setStartPoint(null, '')}
              />
              <button
                className={`waypoint-insert${dragGapIndex === 0 ? ' is-drop-target' : ''}${isDraggingWaypoint ? ' is-drag-mode' : ''}`}
                type="button"
                onClick={() => insertWaypoint(null, '', 0)}
                onDragOver={(event) => handleWaypointGapDragOver(event, 0)}
                onDrop={(event) => handleWaypointGapDrop(event, 0)}
              >
                {isDraggingWaypoint ? <FiMenu /> : <FiPlus />} {getWaypointGapLabel(0)}
              </button>
              {waypoints.map((waypoint, index) => (
                <React.Fragment key={waypoint.id}>
                  <div className="waypoint-row">
                    <LocationInput
                      label={`${t('route.locations.waypoint')} ${index + 1}`}
                      value={waypoint.label}
                      point={waypoint.point}
                      onSelect={(point, label) => updateWaypoint(waypoint.id, point, label)}
                      onClear={() => updateWaypoint(waypoint.id, null, '')}
                    />
                    <div className="waypoint-actions">
                      <button
                        className="waypoint-drag"
                        type="button"
                        draggable
                        onDragStart={(event) => handleWaypointDragStart(event, waypoint.id)}
                        onDragEnd={clearWaypointDrag}
                        aria-label={t('route.controls.waypointDragAria')}
                        title={t('route.controls.waypointDragTitle')}
                      >
                        <FiMenu />
                      </button>
                      <button
                        className="waypoint-move"
                        type="button"
                        onClick={() => moveWaypoint(index, index - 1)}
                        disabled={index === 0}
                        aria-label="Move waypoint up"
                      >
                        <FiArrowUp />
                      </button>
                      <button
                        className="waypoint-move"
                        type="button"
                        onClick={() => moveWaypoint(index, index + 1)}
                        disabled={index === waypoints.length - 1}
                        aria-label="Move waypoint down"
                      >
                        <FiArrowDown />
                      </button>
                      <button
                        className="waypoint-remove"
                        type="button"
                        onClick={() => removeWaypoint(waypoint.id)}
                        aria-label={t('route.delete')}
                      >
                        <FiX />
                      </button>
                    </div>
                  </div>
                  <button
                    className={`waypoint-insert${dragGapIndex === index + 1 ? ' is-drop-target' : ''}${isDraggingWaypoint ? ' is-drag-mode' : ''}`}
                    type="button"
                    onClick={() => insertWaypoint(null, '', index + 1)}
                    onDragOver={(event) => handleWaypointGapDragOver(event, index + 1)}
                    onDrop={(event) => handleWaypointGapDrop(event, index + 1)}
                  >
                    {isDraggingWaypoint ? <FiMenu /> : <FiPlus />} {getWaypointGapLabel(index + 1)}
                  </button>
                </React.Fragment>
              ))}
              {waypoints.length > 0 && (
                <small className="waypoint-hint">
                  {t('route.controls.waypointHint')}
                </small>
              )}
              <LocationInput
                label={t('route.locations.end')}
                value={endLabel}
                point={endPoint}
                onSelect={setEndPoint}
                onClear={() => setEndPoint(null, '')}
              />
              <div className="location-actions">
                <button
                  className="btn-secondary btn-compact"
                  type="button"
                  onClick={reverseRoute}
                  disabled={!startPoint || !endPoint || loading}
                >
                  <FiRepeat /> {t('route.controls.reverseRoute')}
                </button>
                <label className="return-toggle">
                  <input
                    type="checkbox"
                    checked={includeReturnTrip}
                    onChange={(event) => setIncludeReturnTrip(event.target.checked)}
                    disabled={!startPoint || !endPoint || loading}
                  />
                  <span>{t('route.controls.calculateReturnTrip')}</span>
                </label>
              </div>
            </div>
          </div>

          <div className="plan-action-bar">
            <button
              className="btn-primary"
              onClick={handleCalculate}
              disabled={!startPoint || !endPoint || loading}
            >
              <FiNavigation /> {t('route.calculate')}
            </button>

            {(startPoint || endPoint || route) && (
              <button
                className="btn-secondary btn-danger"
                onClick={handleResetRoute}
                disabled={loading}
              >
                <FiTrash2 /> {t('route.delete')}
              </button>
            )}
          </div>

          {route && (
            <div className="route-stats">
              <h3>{t('route.stats')}</h3>
              <div className="stat-item">
                <span>{t('route.distance')}</span>
                <strong>{(route.distance / 1000).toFixed(1)} km</strong>
              </div>
              <div className="stat-item">
                <span>{t('route.duration')}</span>
                <strong>{Math.round(route.duration / 60)} min</strong>
              </div>
              <div className="stat-item">
                <span>{t('route.avgSpeed')}</span>
                <strong>{((route.distance / route.duration) * 3.6).toFixed(1)} km/h</strong>
              </div>
              {route.ascent > 0 && (
                <div className="stat-item">
                  <span>{t('route.elevation')}</span>
                  <strong>{route.ascent} m</strong>
                </div>
              )}
              {tempoFactors && (
                <>
                  <div className="stat-item">
                    <span>{t('route.tempo.adjusted')}</span>
                    <strong>{formatSignedDuration(tempoAdjustmentSeconds)}</strong>
                  </div>
                  <div className="stat-item">
                    <span>{t('route.tempo.friction')}</span>
                    <strong>{formatSignedDuration(frictionDelaySeconds)}</strong>
                  </div>
                  {tempoFactors.wind && (
                    <div className="stat-item">
                      <span>{t('route.tempo.wind')}</span>
                      <strong title={windSummary}>{formatSignedDuration(windEffectSeconds)} | {windSummary}</strong>
                    </div>
                  )}
                </>
              )}
              <div className="stat-item">
                <span>{t('route.engine')}</span>
                <strong>{route.engineUsed || engine}</strong>
              </div>
              {route.fallbackUsed && (
                <div className="stat-item">
                  <span>{t('route.fallback')}</span>
                  <strong>{route.fallbackFrom} → {route.engineUsed}</strong>
                </div>
              )}
              {returnRoute && (
                <>
                  <div className="stat-item stat-item-return">
                    <span>{t('route.controls.returnDistance')}</span>
                    <strong>{(returnRoute.distance / 1000).toFixed(1)} km</strong>
                  </div>
                  <div className="stat-item stat-item-return">
                    <span>{t('route.controls.returnDuration')}</span>
                    <strong>{Math.round(returnRoute.duration / 60)} min</strong>
                  </div>
                  <div className="stat-item stat-item-return">
                    <span>{t('route.controls.outAndBack')}</span>
                    <strong>{((route.distance + returnRoute.distance) / 1000).toFixed(1)} km</strong>
                  </div>
                </>
              )}

              {pz && (
                <div className="power-zone-card" style={{ '--pz-color': pz.color }}>
                  <div className="pz-header">
                    <span className="pz-label">{pz.label}</span>
                  </div>
                  <div className="pz-watts">
                    <span className="pz-range">{pz.minWatts}–{pz.maxWatts} W</span>
                    <span className="pz-target">{pz.targetWatts} W {t('power.target')}</span>
                  </div>
                  <div className="pz-load">
                    <div className="pz-load-item">
                      <span>{pz.estimatedKj} kJ</span>
                      <small>{t('power.energy')}</small>
                    </div>
                    <div className="pz-load-divider" />
                    <div className="pz-load-item">
                      <span>{pz.estimatedTss}</span>
                      <small>TSS</small>
                    </div>
                  </div>
                </div>
              )}
              <RouteTypeStats routeStats={route.routeStats} />
            </div>
          )}

          {route && (
            <div className={`weather-alerts${hasWeatherWarnings ? ' has-warnings' : ' is-all-clear'}`}>
              <h3>
                {hasWeatherWarnings ? <FiAlertTriangle /> : <FiCheckCircle />}
                <span>{t('route.weatherAlerts.title')}</span>
              </h3>
              {weatherAgeLabel && <p className="weather-alerts-meta">{weatherAgeLabel}</p>}
              {hasWeatherWarnings ? (
                <ul>
                  {weatherAlertItems.map((alert) => (
                    <li key={alert.id} className={`severity-${alert.severity || 'moderate'}`}>
                      {alert.text}
                    </li>
                  ))}
                </ul>
              ) : weatherAlerts ? (
                <p className="weather-alerts-perfect">{t('route.weatherAlerts.allClear')}</p>
              ) : (
                <p className="weather-alerts-missing">{t('route.weatherAlerts.unavailable')}</p>
              )}
            </div>
          )}

          {route && (
            <div className="export-buttons">
              <button className="btn-secondary" onClick={handleExportTCX}>
                <FiDownload /> {t('route.exportTcx')}
              </button>
              <button className="btn-secondary" onClick={handleExportGPX}>
                <FiDownload /> {t('route.exportGpx')}
              </button>
            </div>
          )}
        </>
      )}

      {activeTab === 'setup' && (
        <>
          <div className="control-group">
            <label>{t('route.bike')}</label>
            <div className="bike-profile-select">
              <select
                value={bikeType || selectedProfile.id}
                onChange={(event) => setBikeType(event.target.value)}
                disabled={!bikeProfiles.length}
              >
                {profileOptions.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="bike-model-tag">
              {selectedProfile.source === 'brouter'
                ? t('route.brouterProfile')
                : t('route.routingProfile')}
            </div>
          </div>

          <div className="control-group">
            <label>{t('route.rideType')}</label>
            <div className="ride-type-buttons">
              {RIDE_TYPES.map(({ id }) => (
                <button
                  key={id}
                  className={`ride-type-btn${rideType === id ? ' active' : ''}`}
                  onClick={() => setRideType(id)}
                >
                  <span className="rt-label">{t(`rideTypes.${id}.label`)}</span>
                  <span className="rt-sub">{t(`rideTypes.${id}.subtitle`)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>{t('route.riderProfile.title')}</label>
            <div className="rider-profile-inputs">
              <label>
                <span><FiZap size={12} /> {t('route.riderProfile.ftp')}</span>
                <div className="rider-input">
                  <input
                    type="number"
                    min="50"
                    max="600"
                    step="1"
                    value={riderProfile.ftp}
                    onChange={(event) => handleRiderProfileChange('ftp', event.target.value)}
                  />
                  <small>W</small>
                </div>
              </label>
              <label>
                <span>{t('route.riderProfile.weight')}</span>
                <div className="rider-input">
                  <input
                    type="number"
                    min="30"
                    max="180"
                    step="0.5"
                    value={riderProfile.weight}
                    onChange={(event) => handleRiderProfileChange('weight', event.target.value)}
                  />
                  <small>kg</small>
                </div>
              </label>
            </div>
          </div>

          <div className="control-group">
            <label>{t('route.style')}</label>
            <div className="preference-buttons">
              {['fastest', 'scenic', 'offroad'].map((id) => (
                <button
                  key={id}
                  className={preference === id ? 'active' : ''}
                  onClick={() => setPreference(id)}
                >
                  {t(`preferences.${id}`)}
                </button>
              ))}
            </div>
          </div>

          {rideType && riderProfile.ftp && !route && (
            <PowerZonePreview rideType={rideType} ftp={riderProfile.ftp} />
          )}
        </>
      )}
    </div>
  );
}

/** Shows the power zone target before a route is calculated */
function PowerZonePreview({ rideType, ftp }) {
  const ZONES = {
    z2:        { label: t('rideTypes.z2.zone'),        minP: 0.56, tgtP: 0.66, maxP: 0.75, color: '#3b82f6' },
    sst:       { label: t('rideTypes.sst.zone'),       minP: 0.88, tgtP: 0.91, maxP: 0.93, color: '#f59e0b' },
    tt:        { label: t('rideTypes.tt.zone'),        minP: 0.91, tgtP: 1.00, maxP: 1.05, color: '#ef4444' },
    threshold: { label: t('rideTypes.threshold.zone'), minP: 0.95, tgtP: 1.02, maxP: 1.05, color: '#dc2626' },
  };
  const z = ZONES[rideType] || ZONES.z2;
  return (
    <div className="power-zone-preview" style={{ '--pz-color': z.color }}>
      <div className="pz-preview-label">{z.label}</div>
      <div className="pz-preview-watts">
        {Math.round(ftp * z.minP)}–{Math.round(ftp * z.maxP)} W
        &nbsp;<span>({Math.round(ftp * z.tgtP)} W {t('power.target')})</span>
      </div>
    </div>
  );
}

export default RouteControls;
