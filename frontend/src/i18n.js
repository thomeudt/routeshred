const translations = {
  de: {
    app: {
      tagline: 'Road- and Gravel-Route Studio'
    },
    common: {
      unknown: 'Unbekannt',
      loading: 'Laden...'
    },
    route: {
      planner: 'Routenplaner',
      engine: 'Engine',
      bike: 'Rad',
      rideType: 'Training',
      riderProfile: {
        title: 'Fahrerprofil',
        ftp: 'FTP',
        weight: 'Gewicht'
      },
      locations: {
        title: 'Orte',
        start: 'Start',
        end: 'Ziel',
        waypoint: 'Wegpunkt',
        addWaypoint: 'Wegpunkt hinzufügen',
        searchPlaceholder: 'Adresse oder POI suchen',
        searching: 'Suche...',
        noResults: 'Keine Treffer'
      },
      style: 'Routenstil',
      start: 'Start',
      end: 'Ziel',
      calculate: 'Route berechnen',
      delete: 'Route löschen',
      stats: 'Routendaten',
      distance: 'Distanz',
      duration: 'Dauer',
      avgSpeed: 'Ø Tempo',
      elevation: 'Höhenmeter ↑',
      fallback: 'Fallback',
      exportTcx: 'TCX exportieren (Wahoo/Garmin)',
      exportGpx: 'GPX exportieren',
      brouterProfile: 'BRouter Custom Profile',
      routingProfile: 'Routing-Profil',
      calculating: 'Route wird berechnet...',
      details: 'Routendetails',
      detailsComingSoon: 'Routendetailansicht folgt...',
      errors: {
        missingPoints: 'Start und Ziel erforderlich',
        calculateFailed: 'Route konnte nicht berechnet werden',
        noRouteToExport: 'Keine Route zum Exportieren vorhanden',
        exportFailed: 'Export als {{format}} fehlgeschlagen'
      }
    },
    bikes: {
      road: 'Road',
      gravel: 'Gravel',
      mtb: 'MTB'
    },
    preferences: {
      fastest: 'Schnell',
      scenic: 'Schön',
      offroad: 'Offroad'
    },
    rideTypes: {
      z2: {
        label: 'Z2',
        subtitle: 'Grundlage',
        zone: 'Zone 2 — Grundlage'
      },
      sst: {
        label: 'SST',
        subtitle: 'Sweet Spot',
        zone: 'Sweet Spot'
      },
      tt: {
        label: 'TT',
        subtitle: 'Zeitfahren',
        zone: 'Zeitfahren — FTP'
      },
      threshold: {
        label: 'THR',
        subtitle: 'Intervalle',
        zone: 'Schwellenintervalle'
      }
    },
    power: {
      target: 'Ziel',
      energy: 'Energie'
    },
    elevation: {
      loading: 'Höhendaten werden geladen...',
      title: 'Höhenprofil',
      units: 'Distanz km · Höhe m',
      altitude: 'Höhe',
      error: 'Fehler beim Laden der Höhendaten'
    },
    map: {
      startPopup: 'Start',
      endPopup: 'Ziel'
    }
  },
  en: {
    app: {
      tagline: 'Road and gravel route studio'
    },
    common: {
      unknown: 'Unknown',
      loading: 'Loading...'
    },
    route: {
      planner: 'Route Planner',
      engine: 'Engine',
      bike: 'Bike',
      rideType: 'Ride Type',
      riderProfile: {
        title: 'Rider Profile',
        ftp: 'FTP',
        weight: 'Weight'
      },
      locations: {
        title: 'Places',
        start: 'Start',
        end: 'End',
        waypoint: 'Waypoint',
        addWaypoint: 'Add waypoint',
        searchPlaceholder: 'Search address or POI',
        searching: 'Searching...',
        noResults: 'No results'
      },
      style: 'Route Style',
      start: 'Start',
      end: 'End',
      calculate: 'Calculate Route',
      delete: 'Delete Route',
      stats: 'Route Statistics',
      distance: 'Distance',
      duration: 'Duration',
      avgSpeed: 'Avg Speed',
      elevation: 'Elevation ↑',
      fallback: 'Fallback',
      exportTcx: 'Export TCX (Wahoo/Garmin)',
      exportGpx: 'Export GPX',
      brouterProfile: 'BRouter Custom Profile',
      routingProfile: 'Routing Profile',
      calculating: 'Calculating route...',
      details: 'Route Details',
      detailsComingSoon: 'Route detail view coming soon...',
      errors: {
        missingPoints: 'Start and end points required',
        calculateFailed: 'Failed to calculate route',
        noRouteToExport: 'No route to export',
        exportFailed: 'Failed to export to {{format}}'
      }
    },
    bikes: {
      road: 'Road',
      gravel: 'Gravel',
      mtb: 'MTB'
    },
    preferences: {
      fastest: 'Fastest',
      scenic: 'Scenic',
      offroad: 'Offroad'
    },
    rideTypes: {
      z2: {
        label: 'Z2',
        subtitle: 'Endurance',
        zone: 'Zone 2 — Endurance'
      },
      sst: {
        label: 'SST',
        subtitle: 'Sweet Spot',
        zone: 'Sweet Spot'
      },
      tt: {
        label: 'TT',
        subtitle: 'Time Trial',
        zone: 'Time Trial — FTP'
      },
      threshold: {
        label: 'THR',
        subtitle: 'Intervals',
        zone: 'Threshold Intervals'
      }
    },
    power: {
      target: 'target',
      energy: 'energy'
    },
    elevation: {
      loading: 'Loading elevation data...',
      title: 'Elevation Profile',
      units: 'Distance km · Altitude m',
      altitude: 'Altitude',
      error: 'Error fetching elevation data'
    },
    map: {
      startPopup: 'Start',
      endPopup: 'End'
    }
  }
};

const configuredLanguage = (process.env.REACT_APP_LANGUAGE || '').toLowerCase();
const browserLanguage = typeof navigator !== 'undefined'
  ? (navigator.language || '').toLowerCase()
  : '';
const activeLanguage = configuredLanguage.startsWith('de') || (!configuredLanguage && browserLanguage.startsWith('de'))
  ? 'de'
  : 'en';

function t(path, replacements = {}) {
  const value = path.split('.').reduce((current, key) => (
    current && current[key] !== undefined ? current[key] : undefined
  ), translations[activeLanguage]) ?? path;

  if (typeof value !== 'string') {
    return path;
  }

  return Object.entries(replacements).reduce((text, [key, replacement]) => (
    text.replaceAll(`{{${key}}}`, replacement)
  ), value);
}

export { activeLanguage, t };
