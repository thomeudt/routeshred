# RouteShred — Benutzerhandbuch

## Inhalt

1. [Überblick](#1-überblick)
2. [Die Oberfläche auf einen Blick](#2-die-oberfläche-auf-einen-blick)
3. [Erste Route planen](#3-erste-route-planen)
4. [Ride Personas & Routenparameter](#4-ride-personas--routenparameter)
5. [Wegpunkte hinzufügen](#5-wegpunkte-hinzufügen)
6. [GPX / FIT importieren](#6-gpx--fit-importieren)
7. [Höhenprofil & Analyse](#7-höhenprofil--analyse)
8. [Wetterwarnungen](#8-wetterwarnungen)
9. [Export & Übertragung auf das Gerät](#9-export--übertragung-auf-das-gerät)
10. [Routen speichern & verwalten](#10-routen-speichern--verwalten)
11. [Routen teilen](#11-routen-teilen)
12. [Gruppenfahrten](#12-gruppenfahrten)
13. [Profil einrichten](#13-profil-einrichten)
14. [Anmeldung & Konto](#14-anmeldung--konto)
15. [Tipps & Tricks](#15-tipps--tricks)
16. [Fehlerbehebung](#16-fehlerbehebung)

---

## 1. Überblick

RouteShred ist ein selbst gehosteter Fahrradroutenplaner für Rennrad- und Gravel-Fahrer. Er kombiniert BRouter-basiertes Routing, Höhenprofile, Wetterwarnungen und Leistungszonenkalkulation in einer einzigen Webanwendung.

**Was funktioniert ohne Konto:**
- Routen planen und berechnen lassen
- Höhenprofil und Geländeanalyse ansehen
- Wetterwarnungen prüfen
- Route als GPX oder TCX herunterladen
- Route direkt an die Wahoo Companion App senden (mobil)

**Was ein Konto zusätzlich ermöglicht:**
- Routen dauerhaft speichern
- Gespeicherte Routen laden und teilen
- Gruppenfahrten erstellen, beitreten und kommentieren
- Fahrerprofil (FTP, Gewicht, Fahrradtyp) speichern

---

## 2. Die Oberfläche auf einen Blick

![RouteShred Übersicht](./screenshots/01-overview.png)

*Abbildung: Hauptansicht mit Seitenleiste und Karte.*

Die App besteht aus zwei Bereichen:

```
┌─────────────────────────────────────────────────────────────┐
│  [Plan]  [Meine Routen]  [Community]  [Setup]               │  ← Tabs
├──────────────────────┬──────────────────────────────────────┤
│                      │                                       │
│  Seitenleiste        │            Karte                      │
│  (aktiver Tab)       │         (Leaflet)                     │
│                      │                                       │
└──────────────────────┴──────────────────────────────────────┘
```

- **Plan** — Route planen, Höhenprofil, Export. Immer sichtbar.
- **Meine Routen** — Gespeicherte Routen. Nur mit Konto sichtbar.
- **Community** — Gruppenfahrten. Nur mit Konto sichtbar.
- **Setup** — Fahrradprofil, FTP, Gewicht. Immer sichtbar.

Auf der Karte kannst du jederzeit klicken, um Start oder Ziel zu setzen. Ein Rechtsklick auf einen Marker ermöglicht weiteres Bearbeiten.

---

## 3. Erste Route planen

![Start- und Zieleingabe](./screenshots/02-location-input.png)

*Abbildung: Eingabe von Start/Ziel mit Vorschlägen.*

### Schritt 1 — Start und Ziel eingeben

Im **Plan**-Tab gibt es zwei Adressfelder: Start und Ziel.

**Per Texteingabe:**
Tippe eine Adresse, einen Ortsnamen oder einen POI-Begriff (z. B. „Café", „Bikeshop") ein. Die Vorschlagsliste kombiniert Nominatim-Adressen mit Overpass-POIs.

**Per Klick auf die Karte:**
Klicke direkt auf die Karte. Ist noch kein Start gesetzt, wird der erste Klick zum Start, der zweite zum Ziel.

**Per GPS:**
Klicke das GPS-Symbol neben dem Startfeld, um den aktuellen Standort zu verwenden (erfordert Standortfreigabe im Browser).

### Schritt 2 — Ride Persona oder Parameter wählen

Wähle eine der vier Ride Personas (Coffee, Bunch, Endurance, Gravel) oder stelle Fahrradtyp, Routenpräferenz und Ridetyp manuell ein. Details → [Abschnitt 4](#4-ride-personas--routenparameter).

### Schritt 3 — Berechnen

Klicke **Berechnen**. RouteShred sendet die Anfrage an BRouter, holt das Höhenprofil bei Open-Meteo ab und berechnet Wetterwarnungen. Die Route erscheint als blaue Linie auf der Karte, das Höhenprofil darunter.

![Berechnete Route auf der Karte](./screenshots/04-route-calculated.png)

*Abbildung: Ergebnis nach der Routenberechnung.*

### Schritt 4 — Rückroute (optional)

Aktiviere **Rückroute einbeziehen**, um automatisch die Rückfahrt auf demselben oder einem alternativen Weg zu berechnen. Die Gesamtdistanz verdoppelt sich entsprechend.

---

## 4. Ride Personas & Routenparameter

![Ride Personas](./screenshots/03-personas.png)

*Abbildung: Persona-Auswahl und Routenparameter im Plan-Tab.*

### Ride Personas

Personas sind Ein-Klick-Voreinstellungen, die `Ridetyp` und `Präferenz` gleichzeitig setzen:

| Persona | Ridetyp | Präferenz | Typischer Einsatz |
|---------|---------|-----------|-------------------|
| ☕ Coffee Ride | Z2 | Landschaftlich | Ruhige Ausfahrt, niedrige Intensität |
| 👥 Bunch Ride | TT | Schnellste | Gruppentraining, ebene Strecke |
| ⚡ Endurance | SST | Landschaftlich | Ausdauereinheit, mittlere Intensität |
| 🪨 Gravel | Z2 | Offroad | Schotterstraßen, Forstwege |

### Manuelle Parameter

**Fahrradtyp** — Wähle aus den verfügbaren BRouter-Profilen (Rennrad, Gravel, MTB, …) oder eigenen Custom Profiles. Das Profil bestimmt, welche Straßentypen BRouter bevorzugt.

**Routenpräferenz:**
- **Schnellste** — kürzeste Zeit, bevorzugt Hauptstraßen
- **Landschaftlich** — bevorzugt Radwege, Nebenstraßen, Panoramastrecken
- **Offroad** — bevorzugt Schotter und unbefestigte Wege

**Ridetyp** (Z2 / SST / TT / Schwelle) — bestimmt ausschließlich die Leistungszonenvorschau, nicht die Routenführung. Die angezeigten Wattzahlen basieren auf deiner FTP (einstellbar im Setup-Tab).

### Leistungszonenvorschau

Unterhalb der Persona-Auswahl wird der Ziel-Wattbereich für die aktuelle Zone angezeigt:

| Zone | % FTP | Typisch bei 250 W FTP |
|------|-------|-----------------------|
| Z2 | 56–75 % | 140–188 W |
| SST | 84–97 % | 210–243 W |
| TT | 105 % | ~263 W |
| Schwelle | 98–102 % | 245–255 W |

---

## 5. Wegpunkte hinzufügen

Füge Zwischenstopps hinzu, um die Routenführung zu steuern.

**Per Klick auf die Karte:** Halte während des Klickens keine Spezial-Taste gedrückt — nach Start und Ziel wird jeder weitere Klick als Wegpunkt hinzugefügt.

**Per Adresseingabe:** Klicke das **+**-Symbol in der Wegpunkt-Leiste und tippe eine Adresse.

**Reihenfolge ändern:** Ziehe die Wegpunkte per Drag & Drop in der Seitenleiste in die gewünschte Reihenfolge.

**Wegpunkt entfernen:** Klicke das **×** neben dem Wegpunkt oder ziehe den Marker von der Karte.

> Nach jeder Änderung an Wegpunkten musst du **Berechnen** erneut klicken.

---

## 6. GPX / FIT importieren

Du kannst eine bestehende Route aus Komoot, Strava, Garmin Connect oder einer anderen App importieren.

**Unterstützte Formate:** `.gpx`, `.fit`

**So geht's:**
1. Klicke das Import-Symbol (Pfeil nach oben) im Plan-Tab
2. Wähle eine `.gpx`- oder `.fit`-Datei
3. RouteShred extrahiert Start, Ziel und Wegpunkte automatisch
4. Die importierten Punkte werden in die Eingabefelder eingetragen — du kannst sie anpassen
5. Klicke **Berechnen**, um die Route mit den aktuellen Profil-Einstellungen neu zu berechnen

> **Hinweis:** Die importierte Datei bestimmt nur die Wegpunkte, nicht die eigentliche Routenführung. BRouter berechnet die optimale Route zwischen diesen Punkten entsprechend deinem Fahrrad- und Präferenzprofil neu.

---

## 7. Höhenprofil & Analyse

![Höhenprofil](./screenshots/05-elevation-profile.png)

*Abbildung: Höhenprofil mit Kennzahlen und Verlauf.*

Nach der Routenberechnung erscheint das Höhenprofil als interaktives Diagramm unterhalb der Karte.

### Höhenprofil lesen

- **X-Achse** — Distanz in Kilometern
- **Y-Achse** — Höhe in Metern über NN
- **Hover** — zeigt genaue Höhe und Distanz am Cursor-Punkt
- Der entsprechende Punkt wird gleichzeitig auf der Karte hervorgehoben

### Kennzahlen

Über dem Diagramm werden angezeigt:
- **Distanz** — Gesamtlänge in km
- **Anstieg / Abstieg** — kumulierte Höhenmeter
- **Geschätzte Zeit** — basierend auf dem Routingprofil
- **Höchster Punkt / Tiefster Punkt**

### Geländeanalyse

Unterhalb des Höhenprofils zeigt die **Geländeanalyse** die Oberflächenverteilung der Route:
- Asphalt, Schotter, Wald- und Feldwege, Trails
- Anteil in Prozent und Kilometer
- Farbkodiertes Balkendiagramm

---

## 8. Wetterwarnungen

RouteShred prüft beim Berechnen die Open-Meteo-Wettervorhersage entlang der Route und zeigt Warnungen, wenn relevante Bedingungen vorhergesagt werden:

| Warnung | Auslöser |
|---------|----------|
| 💨 Gegenwind / Rückenwind | Windstärke > Schwellenwert, Richtung relativ zur Fahrtrichtung |
| 🌧 Regen | Niederschlagswahrscheinlichkeit hoch |
| 🌡 Hitze | Temperatur > Schwellenwert |
| ☀️ UV | UV-Index hoch |
| ↔️ Seitenwind | Starker Querwind |

Warnungen erscheinen direkt unter der Persona-Auswahl. Klicke auf eine Warnung, um Details zur betroffenen Streckenposition zu sehen.

> Keine Warnungen = keine besonderen Bedingungen vorhergesagt. Wetterdaten beziehen sich auf die aktuelle Tageszeit, nicht auf einen geplanten Starttermin.

---

## 9. Export & Übertragung auf das Gerät

![Export-Bereich](./screenshots/06-export.png)

*Abbildung: TCX/GPX-Export und Geräte-Übergabe.*

### TCX herunterladen

Für Wahoo ELEMNT, Garmin, und andere Geräte. Klicke **TCX exportieren** — der Browser lädt die Datei herunter. Übertrage sie anschließend über die Geräte-App oder Garmin Connect / Wahoo Cloud.

### GPX herunterladen

Universalformat, kompatibel mit nahezu allen Apps und Geräten. Klicke **GPX exportieren**.

### Direkt an Wahoo ELEMNT senden (mobil, empfohlen)

Der schnellste Weg auf mobilen Geräten:

1. Route berechnen
2. Auf **An Wahoo senden** tippen
3. Das native Share-Sheet deines Betriebssystems öffnet sich
4. **Wahoo Companion App** auswählen
5. Die App empfängt die GPX-Datei und synchronisiert sie mit dem Gerät

> **Voraussetzungen:**
> - Mobiler Browser (iOS Safari, Chrome auf Android)
> - Wahoo Companion App installiert und mit dem ELEMNT verbunden
> - Der Button erscheint nur, wenn der Browser die Web Share API unterstützt

> **Falls Wahoo nicht in der Auswahl erscheint:** Stelle sicher, dass die Wahoo Companion App für Dateiimport registriert ist. Öffne die App einmalig und importiere eine GPX-Datei manuell — danach erkennt iOS/Android die App als Handler.

![Mobile Ansicht](./screenshots/11-mobile.png)

*Abbildung: Mobile Nutzung inkl. Share-Flow zu Wahoo.*

---

## 10. Routen speichern & verwalten

![Meine Routen](./screenshots/08-saved-routes.png)

*Abbildung: Bereich „Meine Routen" mit gespeicherten Touren.*

> Speichern erfordert ein Konto (Login).

### Route speichern

1. Route berechnen
2. Namen in das Feld oben im Plan-Tab eingeben
3. **Speichern** klicken
4. Die Route erscheint sofort im Tab **Meine Routen**

### Meine Routen

Im Tab **Meine Routen** siehst du alle deine gespeicherten Routen sowie Routen, die andere mit dir geteilt haben.

**Route laden:** Klicke auf eine Route in der Liste. Sie wird auf die Karte geladen und kann direkt weiterbearbeitet oder exportiert werden.

**Umbenennen:** Klicke das Bleistift-Symbol neben dem Routennamen, gib den neuen Namen ein, bestätige mit Enter.

**Löschen:** Klicke das Papierkorb-Symbol. Die Aktion ist nicht rückgängig zu machen.

**Sichtbarkeit:**
- 🔒 **Privat** — nur du kannst die Route sehen (Standard)
- 🌍 **Öffentlich** — jeder mit dem Link kann die Route laden (kein Login nötig)
- 👤 **Geteilt** — nur bestimmte Nutzer haben Zugriff

---

## 11. Routen teilen

### Öffentlicher Link

1. Route in **Meine Routen** auf **Öffentlich** schalten
2. **Link kopieren** klicken
3. Link per Nachricht, E-Mail oder in Strava-Kommentaren teilen
4. Empfänger öffnen den Link — die Route lädt ohne Login

### Mit einzelnen Nutzern teilen

1. In der Routendetailansicht auf **Teilen** klicken
2. E-Mail-Adresse oder Nutzername des Empfängers eingeben
3. **Hinzufügen** klicken — der Nutzer sieht die Route in seinem **Meine Routen**-Tab

Die Route bleibt unter deiner Kontrolle. Der Empfänger kann sie ansehen und laden, aber nicht bearbeiten oder löschen.

---

## 12. Gruppenfahrten

![Community und Gruppenfahrten](./screenshots/09-community.png)

*Abbildung: Community-Tab mit öffentlichen Gruppenfahrten.*

Der **Community**-Tab zeigt alle öffentlichen Gruppenfahrten und die Fahrten, an denen du teilnimmst.

### Gruppenfahrt erstellen

1. Im Community-Tab auf **+ Neue Gruppenfahrt** klicken
2. Folgende Felder ausfüllen:
   - **Titel** — z. B. „Sonntags-Ausfahrt Rennrad"
   - **Beschreibung** — Details zum Ablauf, Tempo, Verpflegung
   - **Datum & Uhrzeit** — Starttermin
   - **Treffpunkt** — Adresse oder Beschreibung
   - **Route** (optional) — wähle eine deiner gespeicherten Routen aus
   - **Sichtbarkeit** — Öffentlich oder Privat
3. **Erstellen** klicken

### Teilnehmen / Absagen

Klicke auf eine öffentliche Gruppenfahrt und dann auf **Teilnehmen**. Dein Name erscheint in der Teilnehmerliste. Mit **Absagen** trägst du dich wieder aus.

### Kommentieren

Unter jeder Gruppenfahrt gibt es einen Kommentarbereich für organisatorische Absprachen (max. 500 Zeichen pro Kommentar). Nur angemeldete Nutzer können kommentieren.

### Gruppenfahrt bearbeiten / löschen

Nur der Ersteller kann eine Gruppenfahrt bearbeiten oder löschen. Klicke auf das Stift-Symbol neben dem Titel.

---

## 13. Profil einrichten

![Setup und Profil](./screenshots/07-setup.png)

*Abbildung: Setup-Tab mit Profil- und Fahrrad-Einstellungen.*

Im **Setup**-Tab konfigurierst du dein Fahrerprofil. Die Werte werden für die Leistungszonenvorschau und beim Speichern von Routen verwendet.

### FTP (Functional Threshold Power)

Deine Schwellenleistung in Watt — die Leistung, die du theoretisch eine Stunde lang halten kannst.

- **Nicht bekannt?** Starte mit 200–250 W und passe den Wert nach einem FTP-Test an.
- **FTP-Test-Protokoll:** 5 min locker → 5 min Vollgas (als Aufwärmtest) → 10 min locker → 20 min so hart wie möglich → 5 min locker. 95 % der 20-Minuten-Durchschnittsleistung = FTP.

### Gewicht

Dein Körpergewicht in kg. Wird aktuell für zukünftige W/kg-Berechnungen vorgehalten.

### Fahrradtyp

Standard-Fahrradtyp für neue Routen (Rennrad, Gravel, MTB, …).

### Anzeigename

Wie du in Gruppenfahrten und geteilten Routen erscheinst. Kann von deinem Konto-Namen abweichen.

### Änderungen speichern

Klicke **Profil speichern**. Die Werte werden sofort für die Leistungszonenvorschau übernommen.

---

## 14. Anmeldung & Konto

RouteShred verwendet Keycloak für die Authentifizierung. Klicke auf **Anmelden** oben rechts.

### Neues Konto anlegen

Auf der Keycloak-Anmeldeseite **Registrieren** auswählen. Benötigt werden:
- Benutzername
- E-Mail-Adresse
- Passwort (min. 8 Zeichen)

Nach der Registrierung bist du sofort angemeldet.

### Angemeldet bleiben

Der Keycloak-Token ist zeitlich begrenzt. Bei längerer Inaktivität wirst du automatisch abgemeldet. Klicke erneut auf **Anmelden**, um die Session zu erneuern — deine Routen und Daten bleiben erhalten.

### Abmelden

Klicke oben rechts auf deinen Benutzernamen → **Abmelden**.

### Ohne Konto nutzen

Du kannst RouteShred vollständig ohne Konto verwenden: Routenplanung, Analyse, Export und Wahoo-Übertragung funktionieren anonym. Lediglich Speichern, Meine Routen und Community sind nicht verfügbar.

---

## 15. Tipps & Tricks

**Schneller Start per Karten-Klick:**
Klicke direkt auf die Karte, ohne Adressen einzutippen. Der erste Klick setzt den Start, der zweite das Ziel.

**Alternativroute testen:**
Ändere nach dem Berechnen die Präferenz (z. B. von Landschaftlich auf Schnellste) und klicke erneut auf Berechnen — sofortiger Vergleich.

**Custom BRouter-Profile:**
Lege eigene `.brf`-Dateien in `brouter-data/customprofiles/` ab. Sie erscheinen automatisch in der Fahrradtyp-Auswahl unter dem Namen der Datei (ohne `.brf`-Endung).

**Rückroute als separater Export:**
Wenn du die Rückroute aktiviert hast, exportiert RouteShred die Hin- und Rückroute als kombinierte GPX/TCX-Datei.

**Tile-Cache aufwärmen:**
Zoome vor dem Ausritt einmal durch das gesamte Routengebiet — die Kartenkacheln werden serverseitig gecacht und laden danach deutlich schneller.

**Browser-Tab offen lassen:**
Der Zustand der Planung (Start, Ziel, Wegpunkte) bleibt im Browser-Tab erhalten, solange du die Seite nicht schließt. Kein implizites Auto-Save.

---

## 16. Fehlerbehebung

![Hilfe-Seite](./screenshots/10-help-page.png)

*Abbildung: Hilfe-/Support-Bereich für typische Probleme.*

### Route lässt sich nicht berechnen

1. **Health-Check:** `curl http://localhost:5050/api/health` — ist der Backend-Status `OK`?
2. **BRouter prüfen:** `curl http://localhost:17777/brouter/version` — läuft BRouter?
3. **Segmente fehlen:** Ist `BROUTER_AUTO_FETCH_SEGMENTS=true` gesetzt? Beim ersten Berechnen durch ein neues Gebiet lädt BRouter das `.rd5`-Tile nach — das kann beim ersten Mal 5–30 Sekunden dauern.
4. **OSRM-Fallback:** Wenn BRouter ausfällt und `BROUTER_FALLBACK_TO_OSRM=true` gesetzt ist, wird OSRM verwendet. Die Route kann sich leicht unterscheiden.

### Höhenprofil ist flach / leer

- Open-Meteo nicht erreichbar? → Prüfe Internetzugang des Backends
- `ROUTESHRED_CACHE_DIR` nicht beschreibbar? → Verzeichnis-Berechtigungen prüfen
- Open-Elevation wird als Fallback versucht; falls beide scheitern, bleibt das Profil leer

### Wahoo-Button erscheint nicht

Der Button ist nur auf Geräten sichtbar, bei denen der Browser die Web Share API mit Dateiunterstützung meldet (`navigator.canShare({ files: [...] })`). Das funktioniert in:
- Safari auf iOS 15+
- Chrome auf Android 86+

Nicht unterstützt: Desktop-Browser, Firefox auf iOS.

### Karte zeigt nur OpenStreetMap, nicht OpenCycleMap

Der Backend-Tile-Proxy benötigt einen Thunderforest API-Key. Überprüfe:
1. `THUNDERFOREST_API_KEY` in `.env` gesetzt?
2. Backend neu gestartet nach Änderung?
3. Browser-Entwicklertools → Network → Anfragen auf `/api/tiles/...` — gibt der Server 503 zurück?

### Anmeldung schlägt fehl / "Authentication error"

1. Keycloak läuft? → `docker compose ps keycloak`
2. `REACT_APP_KEYCLOAK_URL` im Frontend stimmt mit der Keycloak-Adresse überein?
3. Browser-Konsole → Netzwerkfehler auf `/auth/realms/routeshred/...`?
4. Cookie-Blocker oder Privacy-Modus können Keycloak-Redirects blockieren

### Gespeicherte Route ist weg

Routen werden als JSON-Dateien unter `ROUTESHRED_ROUTES_DIR` gespeichert. Überprüfe:
- Wurde das `data/`-Verzeichnis versehentlich gelöscht?
- Wurde Docker mit `docker compose down -v` gestoppt (löscht Volumes)?
- In der Proxmox-Produktion: sind die Volume-Mounts in `docker-compose.proxmox.yml` korrekt?

---

*Weitere Informationen für Administratoren und Entwickler: [SETUP.md](./SETUP.md), [DEPLOYMENT.md](./DEPLOYMENT.md), [DEVELOPMENT.md](./DEVELOPMENT.md)*
