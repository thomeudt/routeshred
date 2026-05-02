import React, { useEffect, useState } from 'react';
import { useRouteStore } from '../store/routeStore';
import { t } from '../i18n';
import { FiDownload, FiMapPin, FiNavigation, FiPlus, FiTrash2, FiZap, FiX } from 'react-icons/fi';
import LocationInput from './LocationInput';
import '../styles/RouteControls.css';

const RIDE_TYPES = [
  { id: 'z2' },
  { id: 'sst' },
  { id: 'tt' },
  { id: 'threshold' },
];

function RouteControls() {
  const [engine, setEngine] = useState('unknown');
  const {
    startPoint, endPoint,
    startLabel, endLabel, waypoints,
    bikeProfiles, bikeType, preference, rideType, riderProfile,
    loadBikeProfiles, setBikeType, setPreference, setRideType, setRiderProfile,
    setStartPoint, setEndPoint, addWaypoint, updateWaypoint, removeWaypoint,
    calculateRoute, exportRoute, resetRoute,
    loading, route
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

  return (
    <div className="route-controls">
      <div className="route-controls-header">
        <h2>{t('route.planner')}</h2>
        <span className="engine-badge">{t('route.engine')}: {engine}</span>
      </div>

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
          {waypoints.map((waypoint, index) => (
            <div className="waypoint-row" key={waypoint.id}>
              <LocationInput
                label={`${t('route.locations.waypoint')} ${index + 1}`}
                value={waypoint.label}
                point={waypoint.point}
                onSelect={(point, label) => updateWaypoint(waypoint.id, point, label)}
                onClear={() => updateWaypoint(waypoint.id, null, '')}
              />
              <button
                className="waypoint-remove"
                type="button"
                onClick={() => removeWaypoint(waypoint.id)}
                aria-label={t('route.delete')}
              >
                <FiX />
              </button>
            </div>
          ))}
          <button
            className="btn-secondary btn-compact"
            type="button"
            onClick={() => addWaypoint()}
          >
            <FiPlus /> {t('route.locations.addWaypoint')}
          </button>
          <LocationInput
            label={t('route.locations.end')}
            value={endLabel}
            point={endPoint}
            onSelect={setEndPoint}
            onClear={() => setEndPoint(null, '')}
          />
        </div>
      </div>

      {/* Bike selection */}
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

      {/* Ride type selection */}
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

      {/* Rider profile */}
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

      {/* Route preference (still useful for MTB / scenic override) */}
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

      {/* Waypoints */}
      {startPoint && endPoint && (
        <div className="route-info">
          <p><FiMapPin /> {t('route.start')}: {startPoint[0].toFixed(4)}, {startPoint[1].toFixed(4)}</p>
          {waypoints.filter((waypoint) => waypoint.point).map((waypoint, index) => (
            <p key={waypoint.id}><FiMapPin /> {t('route.locations.waypoint')} {index + 1}: {waypoint.point[0].toFixed(4)}, {waypoint.point[1].toFixed(4)}</p>
          ))}
          <p><FiMapPin /> {t('route.end')}: {endPoint[0].toFixed(4)}, {endPoint[1].toFixed(4)}</p>
        </div>
      )}

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

      {/* Power zone target (pre-ride) */}
      {rideType && riderProfile.ftp && !route && (
        <PowerZonePreview rideType={rideType} ftp={riderProfile.ftp} />
      )}

      {/* Route stats + power zone (post-route) */}
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
