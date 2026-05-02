const translations = {
  de: {
    app: {
      tagline: 'Fast roads, group rides, coffee stops'
    },
    auth: {
      loginRequiredTitle: 'Anmeldung erforderlich',
      loginRequiredBody: 'Melde dich mit deinem RouteShred-Konto an, um Profile zu laden und zu speichern.',
      loginButton: 'Jetzt anmelden',
      loginButtonShort: 'Login',
      logoutButton: 'Logout',
      saveProfile: 'Profil speichern',
      saveProfileSaving: 'Wird gespeichert...',
      saveProfileSaved: 'Gespeichert',
      saveProfileError: 'Speichern fehlgeschlagen',
      sessionExpired: 'Session abgelaufen. Bitte erneut anmelden.'
    },
    common: {
      unknown: 'Unbekannt',
      loading: 'Laden...'
    },
    route: {
      planner: 'Ride Studio',
      plannerTagline: 'Build the next fast group loop',
      engine: 'Engine',
      tabs: {
        label: 'Routenpanel',
        plan: 'Planen',
        routes: 'Meine Routen',
        community: 'Community',
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
      personas: {
        title: 'Ride Persona',
        hint: 'Wenn Persona aktiv ist, setzt sie Trainingszone und Routenstil automatisch.',
        coffee: {
          label: 'Coffee Spin',
          sub: 'locker, smooth, social'
        },
        bunch: {
          label: 'Group Smash',
          sub: 'schnell, direkt, race vibe'
        },
        endurance: {
          label: 'Endurance Loop',
          sub: 'steady pace, long flow'
        },
        gravel: {
          label: 'Allroad Adventure',
          sub: 'mix surfaces, weniger Verkehr'
        }
      },
      trainingControl: {
        title: 'Steuerungsmodus',
        persona: 'Persona',
        trainingType: 'Trainingstyp'
      },
      start: 'Start',
      end: 'Ziel',
      calculate: 'Route berechnen',
      delete: 'Route löschen',
      hints: {
        setPoints: 'Start und Ziel setzen um eine Route zu berechnen',
        readyToCalculate: 'Route noch nicht berechnet'
      },
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
        copyLink: 'Öffentlichen Link kopieren',
        copyLinkCopied: 'Link kopiert',
        copyFirstPublic: 'Public Link kopieren',
        socialHint: '{{publicCount}} public · {{sharedCount}} geteilt',
        filterLabel: 'Routenfilter',
        filters: {
          all: 'Alle',
          own: 'Eigene',
          shared: 'Geteilt',
          public: 'Öffentlich'
        },
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
      groupRides: {
        title: 'Group Rides',
        openNav: 'Group Rides',
        create: 'Group Ride erstellen',
        creating: 'Wird erstellt...',
        edit: 'Bearbeiten',
        editSave: 'Speichern',
        editing: 'Wird gespeichert...',
        editCancel: 'Abbrechen',
        loading: 'Group Rides werden geladen...',
        empty: 'Noch keine Group Rides',
        delete: 'Löschen',
        join: 'Beitreten',
        leave: 'Verlassen',
        participants: '{{count}} Teilnehmende',
        commentPlaceholder: 'Kommentar schreiben...',
        commentAction: 'Senden',
        noDescription: 'Keine Beschreibung',
        instagramOpen: 'Auf Instagram öffnen',
        fields: {
          title: 'Titel',
          description: 'Beschreibung, Route-Idee, Pace, Hinweise',
          instagramUrl: 'Instagram-Link',
          meetingPoint: 'Treffpunkt',
          noLinkedRoute: 'Keine Route verknüpft',
          linkedRoute: 'Route verknüpfen'
        },
        loadRoute: 'Route laden',
        visibility: {
          public: 'Öffentlich',
          private: 'Privat'
        },
        challenges: {
          social: 'Social',
          tempo: 'Tempo',
          climbing: 'Climbing',
          sprint: 'Sprint',
          endurance: 'Endurance'
        },
        share: {
          copy: 'Link kopieren',
          copied: 'Link kopiert',
          copyFailed: 'Link konnte nicht kopiert werden',
          instagramCopied: 'Text für Instagram kopiert'
        },
        errors: {
          loadFailed: 'Group Rides konnten nicht geladen werden',
          createFailed: 'Group Ride konnte nicht erstellt werden',
          deleteFailed: 'Group Ride konnte nicht gelöscht werden',
          updateFailed: 'Group Ride konnte nicht gespeichert werden',
          joinFailed: 'Group Ride Beitritt fehlgeschlagen',
          commentFailed: 'Kommentar konnte nicht gespeichert werden'
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
        uvWarning: 'UV-Wert erhöht (Index {{uv}}).',
        sidewindWarning: 'Starker Seitenwind wahrscheinlich ({{crosswind}} km/h, Wind aus {{direction}}).'
      },
      fallback: 'Fallback',
      importGpx: 'GPX importieren',
      importRouteFile: 'GPX/FIT importieren',
      exportTcx: 'TCX exportieren (Wahoo/Garmin)',
      exportGpx: 'GPX exportieren',
      gpxImport: {
        success: 'GPX importiert: Start, Ziel und {{count}} Wegpunkte übernommen.'
      },
      fitImport: {
        success: 'FIT importiert: Start, Ziel und {{count}} Wegpunkte übernommen.'
      },
      brouterProfile: 'Bike Profil',
      routingProfile: 'Routing-Profil',
      profileCreator: {
        title: 'Eigenes Profil',
        toolsTitle: 'Eigene Bike-Profile verwalten',
        stepCreate: '1. Neues Profil anlegen',
        stepCreateHint: 'Auf Basis eines vorhandenen Profils ein neues eigenes Profil erzeugen.',
        stepManage: '2. Ausgewähltes eigenes Profil verwalten',
        stepManageHint: 'Name ändern, löschen oder optional den BRF-Inhalt bearbeiten.',
        selectOwnFirst: 'Wähle oben ein eigenes Profil (markiert mit "mein Profil"), um es zu verwalten.',
        editorTitle: '3. BRF-Editor (optional)',
        authRequired: 'Zum Anlegen eigener Profile bitte einloggen.',
        namePlaceholder: 'Name für neues Profil',
        baseProfileLabel: 'Basisprofil',
        baseProfileHint: 'Dieses Profil dient als Ausgangspunkt. Dessen Basiswerte werden für das neue Profil übernommen.',
        create: 'Profil anlegen',
        creating: 'Wird angelegt...',
        created: 'Profil angelegt und ausgewählt.',
        ownBadge: 'mein Profil',
        manageTitle: 'Profil verwalten',
        rename: 'Umbenennen',
        renaming: 'Wird umbenannt...',
        delete: 'Löschen',
        deleting: 'Wird gelöscht...',
        loadContent: 'BRF laden',
        saveContent: 'BRF speichern',
        savingContent: 'Wird gespeichert...',
        editorPlaceholder: 'BRF-Inhalt für dieses Profil',
        confirmDelete: 'Profil "{{name}}" wirklich löschen?',
        errors: {
          createFailed: 'Profil konnte nicht angelegt werden',
          renameFailed: 'Profil konnte nicht umbenannt werden',
          deleteFailed: 'Profil konnte nicht gelöscht werden',
          loadContentFailed: 'Profilinhalt konnte nicht geladen werden',
          saveContentFailed: 'Profilinhalt konnte nicht gespeichert werden'
        }
      },
      setupSections: {
        bike: 'Bike-Profil',
        bikeHint: 'Fahrrad-spezifisches Routingprofil auswählen oder eigene Profile verwalten.',
        user: 'Fahrerprofil',
        userHint: 'Persönliche Leistungsdaten für die Trainings- und Leistungsberechnung.',
        training: 'Training & Route',
        trainingHint: 'Trainingsziel und Routenstil für die Berechnung festlegen.'
      },
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
        exportFailed: 'Export als {{format}} fehlgeschlagen',
        invalidGpx: 'GPX-Datei ist ungueltig.',
        gpxTooShort: 'GPX-Datei braucht mindestens Start und Ziel.',
        gpxReadFailed: 'GPX-Datei konnte nicht importiert werden',
        fitReadFailed: 'FIT-Datei konnte nicht importiert werden'
      },
      socialSurfaceHint: 'In der grossen Hauptflaeche: kachelige Navigation fuer Group Rides und oeffentliche Routen.'
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
      socialHub: {
        title: 'Community Hub',
        groupRidesHint: 'Treffpunkte, Kommentare und Teilnahme auf einen Blick.',
        publicRoutesTitle: 'Oeffentliche Routen',
        publicRoutesHint: 'Geteilte und oeffentliche Routen grossflaechig verwalten.'
      },
      hideMap: 'Karte ausblenden',
      showMap: 'Karte einblenden'
    }
  },
  en: {
    app: {
      tagline: 'Fast roads, group rides, coffee stops'
    },
    auth: {
      loginRequiredTitle: 'Login required',
      loginRequiredBody: 'Sign in with your RouteShred account to load and save your profiles.',
      loginButton: 'Sign in',
      loginButtonShort: 'Login',
      logoutButton: 'Logout',
      saveProfile: 'Save profile',
      saveProfileSaving: 'Saving...',
      saveProfileSaved: 'Saved',
      saveProfileError: 'Save failed',
      sessionExpired: 'Session expired. Please sign in again.'
    },
    common: {
      unknown: 'Unknown',
      loading: 'Loading...'
    },
    route: {
      planner: 'Ride Studio',
      plannerTagline: 'Build the next fast group loop',
      engine: 'Engine',
      tabs: {
        label: 'Route panel',
        plan: 'Plan',
        routes: 'My routes',
        community: 'Community',
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
      personas: {
        title: 'Ride persona',
        hint: 'When persona mode is active, it automatically sets training zone and route style.',
        coffee: {
          label: 'Coffee Spin',
          sub: 'easy, smooth, social'
        },
        bunch: {
          label: 'Group Smash',
          sub: 'fast, direct, race vibe'
        },
        endurance: {
          label: 'Endurance Loop',
          sub: 'steady pace, long flow'
        },
        gravel: {
          label: 'Allroad Adventure',
          sub: 'mixed surface, less traffic'
        }
      },
      trainingControl: {
        title: 'Control mode',
        persona: 'Persona',
        trainingType: 'Training type'
      },
      start: 'Start',
      end: 'End',
      calculate: 'Calculate Route',
      delete: 'Delete Route',
      hints: {
        setPoints: 'Set start and end to calculate a route',
        readyToCalculate: 'Route not yet calculated'
      },
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
        copyLink: 'Copy public link',
        copyLinkCopied: 'Link copied',
        copyFirstPublic: 'Copy public link',
        socialHint: '{{publicCount}} public · {{sharedCount}} shared',
        filterLabel: 'Route filter',
        filters: {
          all: 'All',
          own: 'Own',
          shared: 'Shared',
          public: 'Public'
        },
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
      groupRides: {
        title: 'Group Rides',
        openNav: 'Group rides',
        create: 'Create group ride',
        creating: 'Creating...',
        edit: 'Edit',
        editSave: 'Save',
        editing: 'Saving...',
        editCancel: 'Cancel',
        loading: 'Loading group rides...',
        empty: 'No group rides yet',
        delete: 'Delete',
        join: 'Join',
        leave: 'Leave',
        participants: '{{count}} riders',
        commentPlaceholder: 'Add a comment...',
        commentAction: 'Post',
        noDescription: 'No description',
        instagramOpen: 'Open on Instagram',
        fields: {
          title: 'Title',
          description: 'Description, route idea, pace, notes',
          instagramUrl: 'Instagram link',
          meetingPoint: 'Meeting point',
          noLinkedRoute: 'No linked route',
          linkedRoute: 'Link a route'
        },
        loadRoute: 'Load route',
        visibility: {
          public: 'Public',
          private: 'Private'
        },
        challenges: {
          social: 'Social',
          tempo: 'Tempo',
          climbing: 'Climbing',
          sprint: 'Sprint',
          endurance: 'Endurance'
        },
        share: {
          copy: 'Copy link',
          copied: 'Link copied',
          copyFailed: 'Could not copy link',
          instagramCopied: 'Copied text for Instagram'
        },
        errors: {
          loadFailed: 'Could not load group rides',
          createFailed: 'Could not create group ride',
          deleteFailed: 'Could not delete group ride',
          updateFailed: 'Could not save group ride',
          joinFailed: 'Could not update ride participation',
          commentFailed: 'Could not post comment'
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
      importGpx: 'Import GPX',
      importRouteFile: 'Import GPX/FIT',
      exportTcx: 'Export TCX (Wahoo/Garmin)',
      exportGpx: 'Export GPX',
      gpxImport: {
        success: 'GPX imported: start, end and {{count}} waypoints applied.'
      },
      fitImport: {
        success: 'FIT imported: start, end and {{count}} waypoints applied.'
      },
      brouterProfile: 'BRouter Custom Profile',
      routingProfile: 'Routing Profile',
      profileCreator: {
        title: 'Custom profile',
        toolsTitle: 'Manage custom bike profiles',
        stepCreate: '1. Create new profile',
        stepCreateHint: 'Build a new custom profile using an existing base profile.',
        stepManage: '2. Manage selected custom profile',
        stepManageHint: 'Rename, delete, or optionally edit the BRF content.',
        selectOwnFirst: 'Select one of your own profiles above (marked with "my profile") to manage it.',
        editorTitle: '3. BRF editor (optional)',
        authRequired: 'Please log in to create custom profiles.',
        namePlaceholder: 'Name for new profile',
        baseProfileLabel: 'Base profile',
        baseProfileHint: 'This profile is used as the starting point. Its base values are copied into the new profile.',
        create: 'Create profile',
        creating: 'Creating...',
        created: 'Profile created and selected.',
        ownBadge: 'my profile',
        manageTitle: 'Manage profile',
        rename: 'Rename',
        renaming: 'Renaming...',
        delete: 'Delete',
        deleting: 'Deleting...',
        loadContent: 'Load BRF',
        saveContent: 'Save BRF',
        savingContent: 'Saving...',
        editorPlaceholder: 'BRF content for this profile',
        confirmDelete: 'Delete profile "{{name}}"?',
        errors: {
          createFailed: 'Could not create profile',
          renameFailed: 'Could not rename profile',
          deleteFailed: 'Could not delete profile',
          loadContentFailed: 'Could not load profile content',
          saveContentFailed: 'Could not save profile content'
        }
      },
      setupSections: {
        bike: 'Bike profile',
        bikeHint: 'Choose bike-specific routing profile or manage custom profiles.',
        user: 'Rider profile',
        userHint: 'Personal performance values for training and power estimates.',
        training: 'Training & route',
        trainingHint: 'Set training target and route style for route calculation.'
      },
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
        exportFailed: 'Failed to export to {{format}}',
        invalidGpx: 'GPX file is invalid.',
        gpxTooShort: 'GPX file must contain at least start and end points.',
        gpxReadFailed: 'Could not import GPX file',
        fitReadFailed: 'Could not import FIT file'
      },
      socialSurfaceHint: 'Use the large main area with tile navigation for group rides and public routes.'
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
      socialHub: {
        title: 'Community hub',
        groupRidesHint: 'Meetups, comments, and participation in one place.',
        publicRoutesTitle: 'Public routes',
        publicRoutesHint: 'Manage shared and public routes in a large surface.'
      },
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
