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
      tabs: {
        label: 'Routenpanel',
        plan: 'Planen',
        library: 'Bibliothek',
        setup: 'Setup'
      },
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
      saved: {
        title: 'Gespeicherte Routen',
        select: 'Route laden',
        loading: 'Routen werden geladen...',
        empty: 'Noch keine Routen gespeichert',
        noSearchResults: 'Keine passende Route',
        save: 'Speichern',
        saved: 'Gespeichert',
        delete: 'Gespeicherte Route löschen',
        rename: 'Umbenennen',
        renameSave: 'Namen speichern',
        renameCancel: 'Umbenennen abbrechen',
        share: 'Teilen',
        shareSave: 'Teilen',
        shareCancel: 'Teilen abbrechen',
        unshareUser: 'Freigabe für User entfernen',
        sharePlaceholder: 'User, E-Mail oder Sub, kommagetrennt',
        searchingUsers: 'User werden gesucht...',
        makePublic: 'Öffentlich machen',
        makePrivate: 'Privat machen',
        own: 'Eigene',
        sharedBy: 'Geteilt von {{owner}}',
        publicBy: 'Öffentlich von {{owner}}',
        access: {
          own: 'Eigene',
          shared: 'Geteilt',
          public: 'Öffentlich'
        },
        namePlaceholder: 'Name der Route',
        searchPlaceholder: 'Routen suchen',
        errors: {
          loadFailed: 'Gespeicherte Routen konnten nicht geladen werden',
          saveFailed: 'Route konnte nicht gespeichert werden',
          deleteFailed: 'Route konnte nicht gelöscht werden',
          renameFailed: 'Route konnte nicht umbenannt werden',
          shareFailed: 'Freigabe konnte nicht gespeichert werden',
          noRoute: 'Keine berechnete Route zum Speichern'
        }
      },
      stats: 'Routendaten',
      distance: 'Distanz',
      duration: 'Dauer',
      avgSpeed: 'Ø Tempo',
      elevation: 'Höhenmeter ↑',
      tempo: {
        adjusted: 'Tempo-Korrektur',
        wind: 'Wind-Effekt',
        windDetails: '{{speed}} km/h aus {{direction}}',
        friction: 'Kreuzungen'
      },
      weatherAlerts: {
        title: 'Wetterwarnungen',
        updatedNow: 'Wetterstand: gerade eben aktualisiert',
        updatedMinutesAgo: 'Wetterstand: vor {{minutes}} min',
        allClear: 'Keine Warnungen: Bedingungen sind aktuell sehr gut für die geplante Route.',
        unavailable: 'Wetterdaten sind aktuell nicht verfügbar.',
        rainWarning: 'Regen auf der Strecke möglich ({{precipitation}} mm/h).',
        stormWarning: 'Stürmischer Wind erwartet ({{wind}} km/h, öen bis {{gust}} km/h).',
        heatWarning: 'Hitze-Belastung hoch ({{temperature}} C).',
        uvWarning: 'UV-Wert erhoeht (Index {{uv}}).',
        sidewindWarning: 'Starker Seitenwind wahrscheinlich ({{crosswind}} km/h, Wind aus {{direction}}).'
      },
      fallback: 'Fallback',
      exportTcx: 'TCX exportieren (Wahoo/Garmin)',
      exportGpx: 'GPX exportieren',
      brouterProfile: 'BRouter Custom Profile',
      routingProfile: 'Routing-Profil',
      calculating: 'Route wird berechnet...',
      details: 'Routendetails',
      detailsComingSoon: 'Routendetailansicht folgt...',
      controls: {
        dropHere: 'Hier ablegen',
        insertBetweenStartEnd: 'Zwischen Start und Ziel einfügen',
        insertAfterStart: 'Nach Start einfügen',
        insertBeforeEnd: 'Vor Ziel einfügen',
        insertBetweenWaypoints: 'Zwischen W{{left}} und W{{right}} einfügen',
        waypointDragAria: 'Wegpunkt ziehen',
        waypointDragTitle: 'Wegpunkt ziehen zum Umsortieren',
        waypointHint: 'Am Griff ziehen, dann in einer markierten Lücke ablegen.',
        reverseRoute: 'Route umkehren',
        calculateReturnTrip: 'Rückfahrt berechnen',
        returnDistance: 'Rückfahrt Distanz',
        returnDuration: 'Rückfahrt Dauer',
        outAndBack: 'Hin + Zurück'
      },
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
      climbCode: 'Climb-Code',
      toughnessCode: 'Toughness-Code',
      gradientCode: 'Gradient-Code',
      error: 'Fehler beim Laden der Höhendaten'
    },
    map: {
      startPopup: 'Start',
      endPopup: 'Ziel',
      currentLocationPopup: 'Aktuelle Position',
      gpsEnable: 'GPS an',
      gpsDisable: 'GPS aus',
      gpsTrackingOn: 'GPS-Tracking aktiv',
      gpsUnavailable: 'GPS wird von diesem Geraet/Browser nicht unterstuetzt.',
      gpsPermissionDenied: 'GPS-Zugriff wurde blockiert.',
      gpsPositionUnavailable: 'Aktuelle Position konnte nicht bestimmt werden.',
      gpsTimeout: 'GPS-Antwort dauert zu lange. Bitte erneut versuchen.',
      hideMap: 'Karte ausblenden',
      showMap: 'Karte einblenden'
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
      tabs: {
        label: 'Route panel',
        plan: 'Plan',
        library: 'Library',
        setup: 'Setup'
      },
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
      saved: {
        title: 'Saved Routes',
        select: 'Load route',
        loading: 'Loading routes...',
        empty: 'No saved routes yet',
        noSearchResults: 'No matching route',
        save: 'Save',
        saved: 'Saved',
        delete: 'Delete saved route',
        rename: 'Rename',
        renameSave: 'Save name',
        renameCancel: 'Cancel rename',
        share: 'Share',
        shareSave: 'Share',
        shareCancel: 'Cancel sharing',
        unshareUser: 'Remove user share',
        sharePlaceholder: 'User, email, or sub, comma-separated',
        searchingUsers: 'Searching users...',
        makePublic: 'Make public',
        makePrivate: 'Make private',
        own: 'Own',
        sharedBy: 'Shared by {{owner}}',
        publicBy: 'Public by {{owner}}',
        access: {
          own: 'Own',
          shared: 'Shared',
          public: 'Public'
        },
        namePlaceholder: 'Route name',
        searchPlaceholder: 'Search routes',
        errors: {
          loadFailed: 'Could not load saved routes',
          saveFailed: 'Could not save route',
          deleteFailed: 'Could not delete route',
          renameFailed: 'Could not rename route',
          shareFailed: 'Could not save sharing settings',
          noRoute: 'No calculated route to save'
        }
      },
      stats: 'Route Statistics',
      distance: 'Distance',
      duration: 'Duration',
      avgSpeed: 'Avg Speed',
      elevation: 'Elevation ↑',
      tempo: {
        adjusted: 'Tempo adjustment',
        wind: 'Wind effect',
        windDetails: '{{speed}} km/h from {{direction}}',
        friction: 'Intersections'
      },
      weatherAlerts: {
        title: 'Weather alerts',
        updatedNow: 'Weather updated just now',
        updatedMinutesAgo: 'Weather updated {{minutes}} min ago',
        allClear: 'No warnings: conditions currently look excellent for this route.',
        unavailable: 'Weather data is currently unavailable.',
        rainWarning: 'Rain is possible on route ({{precipitation}} mm/h).',
        stormWarning: 'Stormy wind expected ({{wind}} km/h, gusts up to {{gust}} km/h).',
        heatWarning: 'Heat stress is elevated ({{temperature}} C).',
        uvWarning: 'UV index is high ({{uv}}).',
        sidewindWarning: 'Strong crosswind likely ({{crosswind}} km/h, wind from {{direction}}).'
      },
      fallback: 'Fallback',
      exportTcx: 'Export TCX (Wahoo/Garmin)',
      exportGpx: 'Export GPX',
      brouterProfile: 'BRouter Custom Profile',
      routingProfile: 'Routing Profile',
      calculating: 'Calculating route...',
      details: 'Route Details',
      detailsComingSoon: 'Route detail view coming soon...',
      controls: {
        dropHere: 'Drop here',
        insertBetweenStartEnd: 'Insert between start and end',
        insertAfterStart: 'Insert after start',
        insertBeforeEnd: 'Insert before end',
        insertBetweenWaypoints: 'Insert between W{{left}} and W{{right}}',
        waypointDragAria: 'Drag waypoint',
        waypointDragTitle: 'Drag waypoint to reorder',
        waypointHint: 'Drag from the handle, then drop into a highlighted gap.',
        reverseRoute: 'Reverse route',
        calculateReturnTrip: 'Calculate return trip',
        returnDistance: 'Return distance',
        returnDuration: 'Return duration',
        outAndBack: 'Out + back'
      },
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
      climbCode: 'Climb code',
      toughnessCode: 'Toughness code',
      gradientCode: 'Gradient code',
      error: 'Error fetching elevation data'
    },
    map: {
      startPopup: 'Start',
      endPopup: 'End',
      currentLocationPopup: 'Current location',
      gpsEnable: 'GPS on',
      gpsDisable: 'GPS off',
      gpsTrackingOn: 'GPS tracking active',
      gpsUnavailable: 'GPS is not supported by this device/browser.',
      gpsPermissionDenied: 'GPS access was denied.',
      gpsPositionUnavailable: 'Current position is unavailable.',
      gpsTimeout: 'GPS lookup timed out. Please try again.',
      hideMap: 'Hide map',
      showMap: 'Show map'
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
