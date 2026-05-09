import React, { useEffect, useRef, useState } from 'react';
import { useRouteStore } from '../store/routeStore';
import { t } from '../i18n';
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowDown,
  FiArrowUp,
  FiCheckCircle,
  FiCoffee,
  FiCompass,
  FiEdit2,
  FiFolder,
  FiRepeat,
  FiDownload,
  FiShare2,
  FiMenu,
  FiNavigation,
  FiPlus,
  FiSave,
  FiUsers,
  FiTrash2,
  FiUpload,
  FiZap,
  FiX
} from 'react-icons/fi';
import LocationInput from './LocationInput';
import RouteTypeStats from './RouteTypeStats';
import SavedRoutesPanel from './SavedRoutesPanel';
import GroupRidesPanel from './GroupRidesPanel';
import { useAuth } from '../auth/AuthProvider';
import '../styles/RouteControls.css';

const RIDE_TYPES = [
  { id: 'z2' },
  { id: 'sst' },
  { id: 'tt' },
  { id: 'threshold' },
];

const PANEL_TABS = ['plan', 'routes', 'community', 'setup'];

const RIDE_PERSONAS = [
  { id: 'coffee', rideType: 'z2', preference: 'scenic' },
  { id: 'bunch', rideType: 'tt', preference: 'fastest' },
  { id: 'endurance', rideType: 'sst', preference: 'scenic' },
  { id: 'gravel', rideType: 'z2', preference: 'offroad' }
];

const PERSONA_ICONS = {
  coffee: FiCoffee,
  bunch: FiUsers,
  endurance: FiActivity,
  gravel: FiCompass
};

const RIDE_TYPE_ICONS = {
  z2: FiNavigation,
  sst: FiActivity,
  tt: FiZap,
  threshold: FiAlertTriangle
};

function getBikeVisualKind(profile, fallbackText = '') {
  const text = [
    profile?.id,
    profile?.label,
    profile?.name,
    fallbackText
  ].filter(Boolean).join(' ').toLowerCase();

  if (/(gravel|allroad|all-road|cx|cross|exploro|grail|crux|diverge|aspero)/.test(text)) return 'gravel';
  if (/(mtb|mountain|trail|enduro|downcountry|xc)/.test(text)) return 'mtb';
  if (/(aero|ostro|one|factor|dogma|pinarello|madone|propel|foil|s5|venge|reacto|noah)/.test(text)) return 'aero';
  if (/(endurance|roubaix|defy|domane|synapse|caledonia)/.test(text)) return 'endurance';
  return 'road';
}

function getBikeTeamStyle(profile, fallbackText = '') {
  const text = [
    profile?.id,
    profile?.label,
    profile?.name,
    fallbackText
  ].filter(Boolean).join(' ').toLowerCase();

  if (/(pinarello|dogma|bolide|grevil)/.test(text)) return 'ineos';
  if (/(cervelo|cervélo|soloist|caledonia|aspero|áspero|r5|s5|p5)/.test(text)) return 'visma';
  if (/(cannondale|supersix|synapse|topstone|scalpel)/.test(text)) return 'ef';
  if (/(trek|madone|emonda|émonda|domane|checkpoint|supercaliber)/.test(text)) return 'lidl';
  if (/(colnago|v4rs|c68|g4-x)/.test(text)) return 'uae';
  if (/(specialized|tarmac|venge|roubaix|crux|diverge|epic)/.test(text)) return 'quickstep';
  if (/(canyon|aeroad|ultimate|grail|grizl|lux)/.test(text)) return 'alpecin';
  if (/(factor|ostro|o2|one|hanzo)/.test(text)) return 'israel';
  if (/(bmc|teammachine|roadmachine|kaius|fourstroke)/.test(text)) return 'decathlon';
  if (/(orbea|orca|orcu|terra|alma|oiz|rise)/.test(text)) return 'lotto-intermarche';
  if (/(3t|strada|racemax|extrema|primo)/.test(text)) return 'tricolore';
  return getBikeVisualKind(profile, fallbackText);
}

function BikeProfileVisual({ kind = 'road', label = '' }) {
  return (
    <div className={`bike-profile-visual bike-visual-${kind}`} aria-hidden="true">
      <div className="bike-visual-frame">
        <span className="bike-pattern pattern-main" />
        <span className="bike-pattern pattern-cut" />
        <span className="bike-pattern pattern-flash" />
        <span className="wheel wheel-front" />
        <span className="wheel wheel-rear" />
        <span className="tube tube-top" />
        <span className="tube tube-down" />
        <span className="tube tube-seat" />
        <span className="tube tube-fork" />
        <span className="tube tube-chainstay" />
        <span className="tube tube-seatstay" />
        <span className="saddle" />
        <span className="crank" />
        <span className="bar" />
      </div>
      {label && <span className="bike-visual-label">{label}</span>}
    </div>
  );
}

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

function parseGpxCoordinates(gpxContent) {
  const xmlText = String(gpxContent || '').trim();
  if (!xmlText || !xmlText.includes('<')) {
    throw new Error('Invalid GPX XML');
  }

  const extractPoints = (tagName) => {
    const points = [];
    const tagRegex = new RegExp(`<${tagName}\\b([^>]*)\\/?\\s*>`, 'gi');
    let match;

    while ((match = tagRegex.exec(xmlText)) !== null) {
      const attrs = String(match[1] || '');
      const latMatch = attrs.match(/\blat\s*=\s*(['"])([^'"]+)\1/i);
      const lonMatch = attrs.match(/\blon\s*=\s*(['"])([^'"]+)\1/i);
      if (!latMatch || !lonMatch) {
        continue;
      }

      const lat = Number(latMatch[2]);
      const lon = Number(lonMatch[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        continue;
      }

      points.push([lat, lon]);
    }

    return points;
  };

  const trkptCoordinates = extractPoints('trkpt');
  const rteptCoordinates = extractPoints('rtept');
  const coordinates = trkptCoordinates.length >= 2 ? trkptCoordinates : rteptCoordinates;

  if (coordinates.length < 2) {
    throw new Error('GPX needs at least start and end coordinates');
  }

  return coordinates;
}

async function parseFitCoordinates(file) {
  const { default: FitParser } = await import('fit-file-parser');
  const fitParser = new FitParser({
    force: true,
    mode: 'both'
  });

  const buffer = new Uint8Array(await file.arrayBuffer());
  const parsed = await fitParser.parseAsync(buffer);

  const records = Array.isArray(parsed && parsed.records) ? parsed.records : [];
  const coursePoints = Array.isArray(parsed && parsed.course_points) ? parsed.course_points : [];
  const source = records.length ? records : coursePoints;

  const coordinates = source
    .map((point) => {
      const lat = Number(point && point.position_lat);
      const lon = Number(point && point.position_long);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return null;
      }
      return [lat, lon];
    })
    .filter(Boolean);

  if (coordinates.length < 2) {
    throw new Error('FIT needs at least start and end coordinates');
  }

  return coordinates;
}

function sampleGpxWaypoints(coordinates, maxWaypoints = 6) {
  if (!Array.isArray(coordinates) || coordinates.length <= 2 || maxWaypoints <= 0) {
    return [];
  }

  const steps = Math.min(maxWaypoints, coordinates.length - 2);
  const used = new Set();
  const waypoints = [];

  for (let i = 1; i <= steps; i += 1) {
    const idx = Math.round((i * (coordinates.length - 1)) / (steps + 1));
    if (idx <= 0 || idx >= coordinates.length - 1 || used.has(idx)) {
      continue;
    }
    used.add(idx);
    waypoints.push(coordinates[idx]);
  }

  return waypoints;
}

function getBrowserPosition(highAccuracy = true) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: highAccuracy,
      timeout: 12000,
      maximumAge: 8000
    });
  });
}

function RouteControls({ socialSurfacesMoved = false }) {
  const { enabled: authEnabled, authenticated, token, user } = useAuth();
  const [engine, setEngine] = useState('unknown');
  const [activeTab, setActiveTab] = useState('plan');
  const [dragWaypointId, setDragWaypointId] = useState(null);
  const [dragGapIndex, setDragGapIndex] = useState(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileBaseId, setNewProfileBaseId] = useState('');
  const [profileCreateState, setProfileCreateState] = useState('idle');
  const [profileCreateError, setProfileCreateError] = useState('');
  const [profileManageError, setProfileManageError] = useState('');
  const [renameProfileName, setRenameProfileName] = useState('');
  const [profileRenameState, setProfileRenameState] = useState('idle');
  const [profileDeleteState, setProfileDeleteState] = useState('idle');
  const [profileEditContent, setProfileEditContent] = useState('');
  const [profileEditState, setProfileEditState] = useState('idle');
  const [profileEditError, setProfileEditError] = useState('');
  const [profileSaveState, setProfileSaveState] = useState('idle');
  const [gpxImportError, setGpxImportError] = useState('');
  const [gpxImportSuccess, setGpxImportSuccess] = useState('');
  const [locationsOpen, setLocationsOpen] = useState(true);
  const [trainingOpen, setTrainingOpen] = useState(true);
  const [aiRoundtripOpen, setAiRoundtripOpen] = useState(false);
  const [nameEditMode, setNameEditMode] = useState(false);
  const prevRouteRef = useRef(null);
  const nameInputRef = useRef(null);
  const [roundtripTarget, setRoundtripTarget] = useState('');
  const [roundtripTime, setRoundtripTime] = useState(120);
  const [roundtripPersona, setRoundtripPersona] = useState('endurance');
  const [locationPickState, setLocationPickState] = useState({ target: '', error: '' });
  const gpxInputRef = useRef(null);
  const {
    startPoint, endPoint,
    startLabel, endLabel, waypoints,
    bikeProfiles, bikeType, preference, rideType, riderProfile,
    loadBikeProfiles, setBikeType, setPreference, setRideType, setRiderProfile,
    includeReturnTrip, setIncludeReturnTrip,
    setStartPoint, setEndPoint, insertWaypoint, updateWaypoint, removeWaypoint, moveWaypoint,
    reverseRoute,
    calculateRoute, exportRoute, resetRoute, planAiRoundtrip,
    loadSavedRoutes, saveCurrentRoute, routeSaveState,
    routeName, setRouteName,
    aiRoundtripLoading, aiRoundtripPhase, aiRoundtripError, aiRoundtripCandidates, aiRoundtripSelected,
    loading, route, returnRoute
  } = useRouteStore();

  useEffect(() => {
    let mounted = true;
    const loadEngine = async () => {
      if (authEnabled && (!authenticated || !token)) {
        return;
      }

      try {
        const response = await fetch('/api/health', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const data = await response.json();
        const configured = data && data.routing ? data.routing.configuredEngine : null;
        if (mounted && configured) setEngine(String(configured).toUpperCase());
      } catch (_) {
        if (mounted) setEngine('UNKNOWN');
      }
    };
    loadEngine();
    return () => { mounted = false; };
  }, [authEnabled, authenticated, token]);

  useEffect(() => {
    if (!bikeProfiles.length && (!authEnabled || (authenticated && token))) {
      loadBikeProfiles(token);
    }
  }, [authEnabled, authenticated, bikeProfiles.length, loadBikeProfiles, token]);

  useEffect(() => {
    if (authEnabled && authenticated && token) {
      loadBikeProfiles(token);
    }
  }, [authEnabled, authenticated, token, loadBikeProfiles]);

  useEffect(() => {
    if (authEnabled && authenticated && token) {
      loadSavedRoutes(token);
    }
  }, [authEnabled, authenticated, token, loadSavedRoutes]);

  useEffect(() => {
    if ((activeTab === 'routes' || activeTab === 'community') && (!authEnabled || !authenticated)) {
      setActiveTab('plan');
    }
  }, [activeTab, authEnabled, authenticated]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const groupRide = String(params.get('groupRide') || '').trim();
    if (groupRide && authEnabled && authenticated) {
      setActiveTab('community');
    }
  }, [authEnabled, authenticated]);

  useEffect(() => {
    const openGroupRides = () => {
      if (!authEnabled || !authenticated) {
        return;
      }

      setActiveTab('community');
      window.setTimeout(() => {
        const el = document.querySelector('.group-rides-panel');
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 40);
    };

    window.addEventListener('routeshred:open-group-rides', openGroupRides);
    return () => window.removeEventListener('routeshred:open-group-rides', openGroupRides);
  }, [authEnabled, authenticated]);

  useEffect(() => {
    const onSetTab = (event) => {
      const requested = String(event?.detail?.tab || '').trim();
      if (!requested) {
        return;
      }

      const allowed = PANEL_TABS.filter((tab) => {
        if (tab === 'routes' || tab === 'community') {
          return authEnabled && authenticated;
        }
        return true;
      });

      if (allowed.includes(requested)) {
        setActiveTab(requested);
      }
    };

    window.addEventListener('routeshred:set-tab', onSetTab);
    return () => window.removeEventListener('routeshred:set-tab', onSetTab);
  }, [authEnabled, authenticated]);

  const pickCurrentLocationFor = async (target, applyLocation) => {
    if (!navigator.geolocation) {
      setLocationPickState({ target: '', error: t('map.gpsUnavailable') });
      return;
    }

    if (window.isSecureContext === false) {
      setLocationPickState({ target: '', error: t('map.gpsRequiresHttps') });
      return;
    }

    setLocationPickState({ target, error: '' });
    try {
      let position;
      try {
        position = await getBrowserPosition(true);
      } catch (error) {
        if (error && error.code === 1) {
          position = await getBrowserPosition(false);
        } else {
          throw error;
        }
      }

      const lat = Number(position?.coords?.latitude);
      const lng = Number(position?.coords?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('Invalid geolocation response');
      }

      await applyLocation([lat, lng], t('route.locations.currentLocation'));
      setLocationPickState({ target: '', error: '' });
    } catch (error) {
      if (error && error.code === 1) {
        setLocationPickState({ target: '', error: t('map.gpsPermissionDenied') });
      } else if (error && error.code === 3) {
        setLocationPickState({ target: '', error: t('map.gpsTimeout') });
      } else {
        setLocationPickState({ target: '', error: t('map.gpsPositionUnavailable') });
      }
    }
  };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('routeshred:tab-changed', { detail: { tab: activeTab } }));
  }, [activeTab]);

  useEffect(() => {
    if (route && !prevRouteRef.current) setLocationsOpen(false);
    prevRouteRef.current = route;
  }, [route]);

  useEffect(() => {
    if (aiRoundtripLoading) setAiRoundtripOpen(true);
  }, [aiRoundtripLoading]);

  const handleCalculate = () => { if (startPoint && endPoint) calculateRoute(); };
  const handlePlanRoundtrip = () => {
    planAiRoundtrip({
      target: roundtripTarget,
      timeBudgetMinutes: roundtripTime,
      persona: roundtripPersona
    });
  };
  const aiRoundtripStatus = aiRoundtripPhase
    ? t(`route.aiRoundtrip.phases.${aiRoundtripPhase}`)
    : t('route.aiRoundtrip.planning');
  const handleExportTCX = () => { if (route) exportRoute('tcx'); };
  const handleExportGPX = () => { if (route) exportRoute('gpx'); };
  const handleShareWahoo = async () => {
    if (!route) return;
    try {
      const response = await fetch('/api/export/gpx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route, name: `Route_${Date.now()}`, description: '' })
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const file = new File([blob], 'route.gpx', { type: 'application/gpx+xml' });
      await navigator.share({ files: [file], title: 'RouteShred Route' });
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Share failed', err);
    }
  };
  const handleResetRoute = () => { resetRoute(); };
  const handleOpenGpxPicker = () => {
    if (gpxInputRef.current) {
      gpxInputRef.current.click();
    }
  };
  const handleImportRouteFile = async (event) => {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) {
      return;
    }

    setGpxImportError('');
    setGpxImportSuccess('');

    try {
      const lowerName = String(file.name || '').toLowerCase();
      const isFit = lowerName.endsWith('.fit');
      const coordinates = isFit
        ? await parseFitCoordinates(file)
        : parseGpxCoordinates(await file.text());
      const waypointsFromGpx = sampleGpxWaypoints(coordinates, 6);
      const start = coordinates[0];
      const end = coordinates[coordinates.length - 1];

      resetRoute();
      await setStartPoint(start, 'GPX Start');
      await setEndPoint(end, 'GPX End');

      for (let index = 0; index < waypointsFromGpx.length; index += 1) {
        await insertWaypoint(waypointsFromGpx[index], `GPX W${index + 1}`, index);
      }

      setGpxImportSuccess(t(isFit ? 'route.fitImport.success' : 'route.gpxImport.success', { count: waypointsFromGpx.length }));
      const baseName = file.name.replace(/\.[^.]+$/, '');
      if (baseName) setRouteName(baseName);
    } catch (error) {
      const message = String(error && error.message ? error.message : '');
      if (message.includes('at least start and end')) {
        setGpxImportError(t('route.errors.gpxTooShort'));
      } else if (message.includes('Invalid GPX XML')) {
        setGpxImportError(t('route.errors.invalidGpx'));
      } else if (message.includes('FIT')) {
        setGpxImportError(t('route.errors.fitReadFailed'));
      } else {
        setGpxImportError(t('route.errors.gpxReadFailed'));
      }
    } finally {
      if (event && event.target) {
        event.target.value = '';
      }
    }
  };
  const handleRiderProfileChange = (field, value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return;
    }
    setRiderProfile({ [field]: numericValue });
  };

  const handleSaveProfile = async () => {
    if (!authEnabled || !authenticated || !token) {
      return;
    }

    setProfileSaveState('saving');
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          riderProfile,
          bikeType,
          rideType,
          displayName: user?.name || user?.preferred_username || 'Rider'
        })
      });
      setProfileSaveState('saved');
      window.setTimeout(() => setProfileSaveState('idle'), 1200);
    } catch (_) {
      setProfileSaveState('error');
      window.setTimeout(() => setProfileSaveState('idle'), 1800);
    }
  };

  const profileOptions = bikeProfiles.length
    ? bikeProfiles
    : [{ id: bikeType || 'road', label: t('common.loading'), source: 'fallback' }];
  const selectedProfile = profileOptions.find((profile) => profile.id === bikeType) || profileOptions[0];
  const selectedBikeVisualKind = getBikeVisualKind(selectedProfile);
  const selectedBikeTeamStyle = getBikeTeamStyle(selectedProfile);
  const wattsPerKg = Number(riderProfile.weight) > 0
    ? (Number(riderProfile.ftp || 0) / Number(riderProfile.weight)).toFixed(1)
    : '0.0';
  const pz = route && route.powerZone;
  const isDraggingWaypoint = Boolean(dragWaypointId);
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
  const canManageProfiles = authEnabled && authenticated;
  const selectedProfileId = selectedProfile ? selectedProfile.id : '';
  const selectedProfileLabel = selectedProfile ? selectedProfile.label : '';
  const selectedProfileOwned = Boolean(selectedProfile && selectedProfile.owned);
  const isOwnedSelectedProfile = Boolean(canManageProfiles && selectedProfile && selectedProfile.owned);
  const activePersona = RIDE_PERSONAS.find((p) => p.rideType === rideType && p.preference === preference) || null;
  const activePersonaId = activePersona ? activePersona.id : null;
  const activePersonaLabel = activePersona ? t(`route.personas.${activePersona.id}.label`) : '';

  useEffect(() => {
    if (!newProfileBaseId && selectedProfileId) {
      setNewProfileBaseId(selectedProfileId);
    }
  }, [newProfileBaseId, selectedProfileId]);

  useEffect(() => {
    if (selectedProfileOwned) {
      setRenameProfileName(selectedProfileLabel || selectedProfileId || '');
    }
    setProfileManageError('');
    setProfileEditContent('');
    setProfileEditError('');
    setProfileEditState('idle');
  }, [selectedProfileId, selectedProfileLabel, selectedProfileOwned]);

  const loadProfiles = async () => {
    return loadBikeProfiles(token);
  };

  const handleCreateBikeProfile = async () => {
    const name = String(newProfileName || '').trim();
    if (!name || !token) {
      return;
    }

    setProfileCreateState('saving');
    setProfileCreateError('');
    try {
      const response = await fetch('/api/routing/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          baseProfileId: newProfileBaseId || (selectedProfile && selectedProfile.id) || undefined
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data && data.message ? data.message : t('route.profileCreator.errors.createFailed'));
      }

      const profiles = await loadProfiles();
      if (data && data.profile && data.profile.id) {
        await setBikeType(data.profile.id);
        setNewProfileBaseId(data.profile.id);
      } else if (profiles && profiles[0]) {
        await setBikeType(profiles[0].id);
      }
      setNewProfileName('');
      setProfileCreateState('saved');
      setTimeout(() => setProfileCreateState('idle'), 1600);
    } catch (error) {
      setProfileCreateState('error');
      setProfileCreateError(error.message || t('route.profileCreator.errors.createFailed'));
    }
  };

  const handleRenameBikeProfile = async () => {
    if (!token || !selectedProfile || !selectedProfile.owned) {
      return;
    }

    const nextName = String(renameProfileName || '').trim();
    if (!nextName) {
      return;
    }

    setProfileRenameState('saving');
    setProfileManageError('');
    try {
      const response = await fetch(`/api/routing/profiles/${encodeURIComponent(selectedProfile.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: nextName })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data && data.message ? data.message : t('route.profileCreator.errors.renameFailed'));
      }

      const profiles = await loadProfiles();
      if (data && data.profile && data.profile.id) {
        await setBikeType(data.profile.id);
      } else if (profiles && profiles[0]) {
        await setBikeType(profiles[0].id);
      }
      setProfileRenameState('saved');
      setTimeout(() => setProfileRenameState('idle'), 1500);
    } catch (error) {
      setProfileRenameState('error');
      setProfileManageError(error.message || t('route.profileCreator.errors.renameFailed'));
    }
  };

  const handleDeleteBikeProfile = async () => {
    if (!token || !selectedProfile || !selectedProfile.owned) {
      return;
    }

    const confirmed = window.confirm(t('route.profileCreator.confirmDelete', { name: selectedProfile.label || selectedProfile.id }));
    if (!confirmed) {
      return;
    }

    setProfileDeleteState('saving');
    setProfileManageError('');
    try {
      const response = await fetch(`/api/routing/profiles/${encodeURIComponent(selectedProfile.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data && data.message ? data.message : t('route.profileCreator.errors.deleteFailed'));
      }

      const profiles = await loadProfiles();
      const next = (profiles && profiles[0]) ? profiles[0].id : 'road';
      await setBikeType(next);
      setProfileDeleteState('saved');
      setProfileEditContent('');
      setTimeout(() => setProfileDeleteState('idle'), 1500);
    } catch (error) {
      setProfileDeleteState('error');
      setProfileManageError(error.message || t('route.profileCreator.errors.deleteFailed'));
    }
  };

  const handleLoadProfileContent = async () => {
    if (!token || !selectedProfile || !selectedProfile.owned) {
      return;
    }

    setProfileEditState('saving');
    setProfileEditError('');
    try {
      const response = await fetch(`/api/routing/profiles/${encodeURIComponent(selectedProfile.id)}/content`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data && data.message ? data.message : t('route.profileCreator.errors.loadContentFailed'));
      }
      setProfileEditContent(String(data && data.profile && data.profile.content ? data.profile.content : ''));
      setProfileEditState('idle');
    } catch (error) {
      setProfileEditState('error');
      setProfileEditError(error.message || t('route.profileCreator.errors.loadContentFailed'));
    }
  };

  const handleSaveProfileContent = async () => {
    if (!token || !selectedProfile || !selectedProfile.owned) {
      return;
    }

    setProfileEditState('saving');
    setProfileEditError('');
    try {
      const response = await fetch(`/api/routing/profiles/${encodeURIComponent(selectedProfile.id)}/content`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: profileEditContent })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data && data.message ? data.message : t('route.profileCreator.errors.saveContentFailed'));
      }
      setProfileEditState('saved');
      setTimeout(() => setProfileEditState('idle'), 1500);
    } catch (error) {
      setProfileEditState('error');
      setProfileEditError(error.message || t('route.profileCreator.errors.saveContentFailed'));
    }
  };

  const formatProfileOptionLabel = (profile) => {
    if (!profile) {
      return t('common.unknown');
    }
    return profile.owned
      ? `${profile.label} • ${t('route.profileCreator.ownBadge')}`
      : profile.label;
  };

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
        <div className="planner-heading">
          <p>{t('route.planner')}</p>
          {activeTab === 'setup' ? (
            <span className="setup-header-title">{t('route.tabs.setup')}</span>
          ) : nameEditMode ? (
            <input
              ref={nameInputRef}
              className="route-name-input"
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              onBlur={() => setNameEditMode(false)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setNameEditMode(false); }}
              placeholder={t('route.saved.namePlaceholder')}
              maxLength="120"
              autoFocus
            />
          ) : (
            <button
              className="route-name-display"
              type="button"
              onClick={() => setNameEditMode(true)}
              title={t('route.saved.editName')}
            >
              <span className="route-name-text">{routeName || t('route.saved.newRoute')}</span>
              <FiEdit2 className="route-name-edit-icon" size={11} />
            </button>
          )}
        </div>
      </div>

      {(activeTab === 'routes' || activeTab === 'community') && authEnabled && authenticated && socialSurfacesMoved && (
        <div className="panel-moved-note">
          <strong>{t(`route.tabs.${activeTab}`)}</strong>
          <span>{t('route.socialSurfaceHint')}</span>
        </div>
      )}

      {activeTab === 'routes' && authEnabled && authenticated && !socialSurfacesMoved && (
        <SavedRoutesPanel context="mixed" />
      )}

      {activeTab === 'community' && authEnabled && authenticated && !socialSurfacesMoved && (
        <GroupRidesPanel />
      )}

      {activeTab === 'plan' && (
        <>
          <details
            className="panel-collapsible locations-collapsible"
            open={locationsOpen}
            onToggle={(e) => setLocationsOpen(e.currentTarget.open)}
          >
            <summary>
              <span>{t('route.setupSections.locations')}</span>
              <small>
                {startLabel && endLabel
                  ? `${startLabel.split(',')[0]} → ${endLabel.split(',')[0]}${waypoints.length ? ` · ${waypoints.length} ${t('route.controls.waypointsShort')}` : ''}`
                  : t('route.hints.setPoints')}
              </small>
            </summary>
          <div className="locations-collapsible-body">
            <div className="location-stack">
              <LocationInput
                label={t('route.locations.start')}
                value={startLabel}
                point={startPoint}
                onSelect={setStartPoint}
                onClear={() => setStartPoint(null, '')}
                onUseCurrentLocation={() => pickCurrentLocationFor('start', setStartPoint)}
                currentLocationLoading={locationPickState.target === 'start'}
                currentLocationDisabled={Boolean(locationPickState.target)}
              />
              <button
                className={`waypoint-insert${dragGapIndex === 0 ? ' is-drop-target' : ''}${isDraggingWaypoint ? ' is-drag-mode' : ''}`}
                type="button"
                title={getWaypointGapLabel(0)}
                aria-label={getWaypointGapLabel(0)}
                onClick={() => insertWaypoint(null, '', 0)}
                onDragOver={(event) => handleWaypointGapDragOver(event, 0)}
                onDrop={(event) => handleWaypointGapDrop(event, 0)}
              >
                {isDraggingWaypoint ? <FiMenu /> : <FiPlus />}
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
                      onUseCurrentLocation={() => pickCurrentLocationFor(`waypoint-${waypoint.id}`, (point, label) => updateWaypoint(waypoint.id, point, label))}
                      currentLocationLoading={locationPickState.target === `waypoint-${waypoint.id}`}
                      currentLocationDisabled={Boolean(locationPickState.target)}
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
                    title={getWaypointGapLabel(index + 1)}
                    aria-label={getWaypointGapLabel(index + 1)}
                    onClick={() => insertWaypoint(null, '', index + 1)}
                    onDragOver={(event) => handleWaypointGapDragOver(event, index + 1)}
                    onDrop={(event) => handleWaypointGapDrop(event, index + 1)}
                  >
                    {isDraggingWaypoint ? <FiMenu /> : <FiPlus />}
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
                onUseCurrentLocation={() => pickCurrentLocationFor('end', setEndPoint)}
                currentLocationLoading={locationPickState.target === 'end'}
                currentLocationDisabled={Boolean(locationPickState.target)}
              />
              {locationPickState.error && (
                <div className="current-location-error">{locationPickState.error}</div>
              )}
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
          </details>

          <details
            className="panel-collapsible training-collapsible"
            open={trainingOpen}
            onToggle={(e) => setTrainingOpen(e.currentTarget.open)}
          >
            <summary>
              <span>{t('route.setupSections.training')}</span>
              <small>
                {activePersonaLabel
                  ? `${activePersonaLabel} · ${t(`rideTypes.${rideType}.label`)} · ${t(`preferences.${preference}`)}`
                  : `${t(`rideTypes.${rideType}.label`)} · ${t(`preferences.${preference}`)}`}
              </small>
            </summary>
            <div className="training-collapsible-body">
              <div className={`control-group plan-bike-card setup-bike-${selectedBikeVisualKind} setup-team-${selectedBikeTeamStyle}`}>
                <div className="plan-bike-card-backdrop" aria-hidden="true">
                  <BikeProfileVisual kind={selectedBikeVisualKind} />
                </div>
                <div className="plan-bike-card-content">
                  <div className="plan-bike-card-header">
                    <label>{t('route.setupSections.bike')}</label>
                    <span>{t('route.setupSections.bikePlanHint')}</span>
                  </div>
                  <div className="plan-bike-card-title">
                    <strong>{selectedProfileLabel || selectedProfileId}</strong>
                    <small>{wattsPerKg} W/kg</small>
                  </div>
                  <div className="bike-profile-select plan-bike-select">
                    <select
                      value={bikeType || selectedProfile.id}
                      onChange={(event) => setBikeType(event.target.value)}
                      disabled={!bikeProfiles.length}
                    >
                      {profileOptions.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {formatProfileOptionLabel(profile)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="control-group">
                <label>{t('route.personas.title')}</label>
                <div className="persona-buttons">
                  {RIDE_PERSONAS.map((persona) => {
                    const PersonaIcon = PERSONA_ICONS[persona.id] || FiCompass;
                    return (
                      <button
                        key={persona.id}
                        type="button"
                        className={`persona-btn persona-${persona.id}${activePersonaId === persona.id ? ' active' : ''}`}
                        onClick={() => { setRideType(persona.rideType); setPreference(persona.preference); }}
                        title={t(`route.personas.${persona.id}.sub`)}
                      >
                        <PersonaIcon className="persona-icon" size={16} />
                        <span className="persona-label">{t(`route.personas.${persona.id}.label`)}</span>
                        <span className="persona-visual" aria-hidden="true">
                          <span /><span /><span />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="control-group">
                <label>{t('route.rideType')}</label>
                <div className="ride-type-buttons">
                  {RIDE_TYPES.map(({ id }) => {
                    const RideTypeIcon = RIDE_TYPE_ICONS[id] || FiZap;
                    return (
                      <button
                        key={id}
                        className={`ride-type-btn${rideType === id ? ' active' : ''}`}
                        onClick={() => setRideType(id)}
                        title={t(`rideTypes.${id}.subtitle`)}
                      >
                        <RideTypeIcon className="rt-icon" size={14} />
                        <span className="rt-label">{t(`rideTypes.${id}.label`)}</span>
                      </button>
                    );
                  })}
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

              {rideType && riderProfile.ftp && (
                <PowerZonePreview rideType={rideType} ftp={riderProfile.ftp} />
              )}
            </div>
          </details>

          <details
            className="panel-collapsible ai-roundtrip-collapsible"
            open={aiRoundtripOpen}
            onToggle={(e) => setAiRoundtripOpen(e.currentTarget.open)}
          >
              <summary>
                <span className="ai-roundtrip-summary-title">
                  <FiCompass size={13} />
                  {t('route.aiRoundtrip.title')}
                </span>
                <small>
                  {aiRoundtripLoading
                    ? t('route.aiRoundtrip.planning')
                    : aiRoundtripSelected
                      ? aiRoundtripSelected.title
                      : t('route.aiRoundtrip.hint')}
                </small>
              </summary>
              <div className="ai-roundtrip-body">
                <div className="ai-roundtrip-fields">
                  <label>
                    <span>{t('route.aiRoundtrip.target')}</span>
                    <input
                      type="text"
                      value={roundtripTarget}
                      onChange={(event) => setRoundtripTarget(event.target.value)}
                      placeholder={t('route.aiRoundtrip.targetPlaceholder')}
                      maxLength="160"
                    />
                  </label>
                  <label>
                    <span>{t('route.aiRoundtrip.timeBudget')}</span>
                    <input
                      type="number"
                      min="30"
                      max="600"
                      step="15"
                      value={roundtripTime}
                      onChange={(event) => setRoundtripTime(Number(event.target.value) || 120)}
                    />
                  </label>
                  <label>
                    <span>{t('route.aiRoundtrip.persona')}</span>
                    <select
                      value={roundtripPersona}
                      onChange={(event) => setRoundtripPersona(event.target.value)}
                    >
                      {RIDE_PERSONAS.map((persona) => (
                        <option key={persona.id} value={persona.id}>
                          {t(`route.personas.${persona.id}.label`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  className="btn-secondary ai-roundtrip-action"
                  type="button"
                  onClick={handlePlanRoundtrip}
                  disabled={!startPoint || !roundtripTarget.trim() || loading || aiRoundtripLoading}
                >
                  <FiZap />
                  {aiRoundtripLoading ? t('route.aiRoundtrip.planning') : t('route.aiRoundtrip.action')}
                </button>
                {aiRoundtripLoading && (
                  <div className="ai-roundtrip-progress">
                    <span className="ai-roundtrip-spinner" />
                    <span>{aiRoundtripStatus}</span>
                  </div>
                )}
                {aiRoundtripSelected && (
                  <div className="ai-roundtrip-result">
                    <strong>{aiRoundtripSelected.title}</strong>
                    <span>{aiRoundtripSelected.description}</span>
                  </div>
                )}
                {aiRoundtripCandidates.length > 1 && (
                  <div className="ai-roundtrip-candidates">
                    {aiRoundtripCandidates.slice(0, 3).map((candidate) => (
                      <span key={candidate.id || candidate.title}>
                        {candidate.title}
                        {candidate.distance ? ` · ${Math.round(candidate.distance / 1000)} km` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {aiRoundtripError && <small className="ai-roundtrip-error">{aiRoundtripError}</small>}
              </div>
            </details>

          <details className="panel-collapsible export-collapsible">
            <summary>
              <span>{t('route.integrations')}</span>
              <small>{t('route.integrationsHint')}</small>
            </summary>
            <div className="export-buttons">
              <button className="btn-secondary" onClick={handleOpenGpxPicker} type="button">
                <FiUpload /> {t('route.importRouteFile')}
              </button>
              {route && (
                <>
                  <button className="btn-secondary" onClick={handleExportTCX}>
                    <FiDownload /> {t('route.exportTcx')}
                  </button>
                  <button className="btn-secondary" onClick={handleExportGPX}>
                    <FiDownload /> {t('route.exportGpx')}
                  </button>
                  {typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [new File([], 'x.tcx')] }) && (
                    <button className="btn-secondary btn-wahoo" onClick={handleShareWahoo}>
                      <FiShare2 /> {t('route.shareToWahoo')}
                    </button>
                  )}
                </>
              )}
            </div>
          </details>

          <div className="plan-action-bar">
            <input
              ref={gpxInputRef}
              className="gpx-file-input"
              type="file"
              accept=".gpx,.fit,application/gpx+xml,application/xml,text/xml"
              onChange={handleImportRouteFile}
            />
            <div className="plan-primary-actions">
              <button
                className={`btn-primary${startPoint && endPoint && !route && !loading ? ' calculate-ready' : ''}`}
                onClick={handleCalculate}
                disabled={!startPoint || !endPoint || loading}
              >
                <FiNavigation /> {t('route.calculate')}
              </button>
              <div className="plan-secondary-actions">
                {route && authEnabled && authenticated && (
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={async () => {
                      if (!routeName.trim()) {
                        setNameEditMode(true);
                        setTimeout(() => nameInputRef.current?.focus(), 50);
                        return;
                      }
                      await saveCurrentRoute(token, routeName.trim());
                    }}
                    disabled={routeSaveState === 'saving'}
                  >
                    {routeSaveState === 'saving' ? <FiFolder /> : <FiSave />}
                    {routeSaveState === 'saved'
                      ? t('route.saved.saved')
                      : routeName.trim()
                        ? t('route.saved.save')
                        : t('route.saved.saveName')}
                  </button>
                )}
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
            </div>

            {gpxImportSuccess && <small className="gpx-import-success">{gpxImportSuccess}</small>}
            {gpxImportError && <small className="gpx-import-error">{gpxImportError}</small>}
          </div>

          {!route && !loading && (
            <div className="route-plan-status">
              <FiNavigation size={12} />
              {startPoint && endPoint
                ? t('route.hints.readyToCalculate')
                : t('route.hints.setPoints')}
            </div>
          )}

          {route && (
            <div className={`route-hero${hasWeatherWarnings ? ' route-hero-warn' : ' route-hero-clear'}`}>
              <div className="route-hero-main">
                <div className="route-hero-chip">
                  <FiNavigation size={14} />
                  <strong>{(route.distance / 1000).toFixed(1)} km</strong>
                </div>
                <div className="route-hero-chip">
                  <FiActivity size={14} />
                  <strong>{Math.round(route.duration / 60)} min</strong>
                </div>
                <div className="route-hero-chip">
                  <FiZap size={14} />
                  <strong>{((route.distance / route.duration) * 3.6).toFixed(1)} km/h</strong>
                </div>
                {route.ascent > 0 && (
                  <div className="route-hero-chip">
                    <FiArrowUp size={14} />
                    <strong>{route.ascent} m</strong>
                  </div>
                )}
              </div>
              <div className="route-hero-tags">
                {activePersonaLabel && <span>{activePersonaLabel}</span>}
                <span>{t(`rideTypes.${rideType}.label`)}</span>
                <span>{t(`preferences.${preference}`)}</span>
                <span>{route.engineUsed || engine}</span>
              </div>
            </div>
          )}

          {route && (
            <details className="panel-collapsible route-stats-collapsible">
              <summary>
                <span>{t('route.stats')}</span>
                <small>{(route.distance / 1000).toFixed(1)} km • {Math.round(route.duration / 60)} min</small>
              </summary>
              <div className="route-stats">
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
            </details>
          )}

          {route && (
            <details className="panel-collapsible weather-collapsible">
              <summary>
                <span>{t('route.weatherAlerts.title')}</span>
                <small>{hasWeatherWarnings ? `${weatherAlertItems.length}` : '0'}</small>
              </summary>
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
            </details>
          )}

        </>
      )}

      {activeTab === 'setup' && (
        <>
          <section className="setup-hero setup-garage-hero">
            <div className="setup-garage-pattern" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="setup-hero-metrics">
              <span>{t('route.setupSections.heroTitle')}</span>
              <strong>{wattsPerKg} W/kg</strong>
            </div>
          </section>

          <section className="setup-section">
            <div className="setup-section-heading">
              <h3 className="setup-section-title">{t('route.setupSections.bike')}</h3>
              <p>{t('route.setupSections.bikeHint')}</p>
            </div>

            <details className="profile-tools">
              <summary>{t('route.profileCreator.toolsTitle')}</summary>
              <div className="profile-tools-body">
                <div className="control-group profile-flow-card profile-creator">
                  <label>{t('route.profileCreator.stepCreate')}</label>
                  {!canManageProfiles ? (
                    <small className="profile-creator-hint">{t('route.profileCreator.authRequired')}</small>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={newProfileName}
                        placeholder={t('route.profileCreator.namePlaceholder')}
                        onChange={(event) => setNewProfileName(event.target.value)}
                        maxLength={64}
                      />
                      <label className="profile-sub-label">{t('route.profileCreator.baseProfileLabel')}</label>
                      <div className="bike-profile-select">
                        <select
                          value={newProfileBaseId || (selectedProfile && selectedProfile.id) || ''}
                          onChange={(event) => setNewProfileBaseId(event.target.value)}
                        >
                          {profileOptions.map((profile) => (
                            <option key={`base-${profile.id}`} value={profile.id}>
                              {formatProfileOptionLabel(profile)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={handleCreateBikeProfile}
                        disabled={!newProfileName.trim() || profileCreateState === 'saving'}
                      >
                        {profileCreateState === 'saving'
                          ? t('route.profileCreator.creating')
                          : t('route.profileCreator.create')}
                      </button>
                      {profileCreateState === 'saved' && (
                        <small className="profile-creator-success">{t('route.profileCreator.created')}</small>
                      )}
                      {profileCreateError && (
                        <small className="profile-creator-error">{profileCreateError}</small>
                      )}
                    </>
                  )}
                </div>

                <div className="control-group profile-flow-card profile-manager">
                  <label>{t('route.profileCreator.stepManage')}</label>

                  {!isOwnedSelectedProfile ? (
                    <small className="profile-creator-hint">{t('route.profileCreator.selectOwnFirst')}</small>
                  ) : (
                    <>
                    <input
                      type="text"
                      value={renameProfileName}
                      onChange={(event) => setRenameProfileName(event.target.value)}
                      maxLength={64}
                    />
                    <div className="profile-manager-actions">
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={handleRenameBikeProfile}
                        disabled={!renameProfileName.trim() || profileRenameState === 'saving'}
                      >
                        {profileRenameState === 'saving'
                          ? t('route.profileCreator.renaming')
                          : t('route.profileCreator.rename')}
                      </button>
                      <button
                        className="btn-secondary btn-danger"
                        type="button"
                        onClick={handleDeleteBikeProfile}
                        disabled={profileDeleteState === 'saving'}
                      >
                        {profileDeleteState === 'saving'
                          ? t('route.profileCreator.deleting')
                          : t('route.profileCreator.delete')}
                      </button>
                    </div>

                    <details className="profile-editor-panel">
                      <summary>{t('route.profileCreator.editorTitle')}</summary>
                      <div className="profile-editor-panel-body">
                        <div className="profile-manager-actions">
                          <button className="btn-secondary" type="button" onClick={handleLoadProfileContent}>
                            {t('route.profileCreator.loadContent')}
                          </button>
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={handleSaveProfileContent}
                            disabled={!profileEditContent.trim() || profileEditState === 'saving'}
                          >
                            {profileEditState === 'saving'
                              ? t('route.profileCreator.savingContent')
                              : t('route.profileCreator.saveContent')}
                          </button>
                        </div>
                        <textarea
                          className="profile-editor"
                          value={profileEditContent}
                          onChange={(event) => setProfileEditContent(event.target.value)}
                          placeholder={t('route.profileCreator.editorPlaceholder')}
                        />
                        {profileEditError && (
                          <small className="profile-creator-error">{profileEditError}</small>
                        )}
                      </div>
                    </details>

                    {profileManageError && (
                      <small className="profile-creator-error">{profileManageError}</small>
                    )}
                    </>
                  )}
                </div>
              </div>
            </details>
          </section>

          <section className="setup-section">
            <div className="setup-section-heading">
              <h3 className="setup-section-title">{t('route.setupSections.user')}</h3>
              <p>{t('route.setupSections.userHint')}</p>
            </div>

            <div className="control-group setup-rider-card">
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
                  <span><FiActivity size={12} /> {t('route.riderProfile.weight')}</span>
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

              <button
                className="btn-secondary"
                type="button"
                onClick={handleSaveProfile}
                disabled={!canManageProfiles || profileSaveState === 'saving'}
              >
                {profileSaveState === 'saving'
                  ? t('auth.saveProfileSaving')
                  : profileSaveState === 'saved'
                    ? t('auth.saveProfileSaved')
                    : profileSaveState === 'error'
                      ? t('auth.saveProfileError')
                      : t('auth.saveProfile')}
              </button>
            </div>
          </section>

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
