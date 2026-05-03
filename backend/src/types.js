'use strict';

// Central JSDoc type definitions for RouteShred backend.
// Import with: /** @typedef {import('../types').Route} Route */

/**
 * A GeoJSON LineString geometry.
 * @typedef {Object} LineStringGeometry
 * @property {'LineString'} type
 * @property {[number, number, number?][]} coordinates - [lon, lat, elevation?] tuples
 */

/**
 * A geographic point as [lat, lon].
 * @typedef {[number, number]} LatLon
 */

/**
 * A route waypoint.
 * @typedef {Object} Waypoint
 * @property {LatLon} point
 * @property {string} label
 * @property {string} [id]
 * @property {string} [purpose]
 */

/**
 * A single route leg (segment between two waypoints).
 * @typedef {Object} RouteLeg
 * @property {number} distance - metres
 * @property {number} duration - seconds
 * @property {string} summary
 * @property {unknown[]} steps
 */

/**
 * Power zone data for a route.
 * @typedef {Object} PowerZone
 * @property {string} type - 'z2' | 'sst' | 'tt' | 'threshold'
 * @property {string} label
 * @property {string} color - hex colour
 * @property {number} minWatts
 * @property {number} targetWatts
 * @property {number} maxWatts
 * @property {number} estimatedKj
 * @property {number} estimatedTss
 */

/**
 * Wind and weather conditions along a route.
 * @typedef {Object} Wind
 * @property {number} speedKmh
 * @property {number} directionDeg
 * @property {string} directionLabel
 * @property {number} gustKmh
 * @property {number|null} temperatureC
 * @property {number} precipitationMm
 * @property {number|null} uvIndex
 * @property {number|null} weatherCode
 * @property {string} source
 */

/**
 * Duration adjustments applied on top of raw routing time.
 * @typedef {Object} TempoFactors
 * @property {number} baseDuration - seconds
 * @property {number} adjustedDuration - seconds
 * @property {number} frictionDelaySeconds
 * @property {number} windEffectSeconds
 * @property {number} delaySeconds
 * @property {number} windDurationFactor
 * @property {number} avgSpeedKmh
 * @property {number} crossings
 * @property {number} trafficSignals
 * @property {number} stopOrGiveWay
 * @property {number} majorTurns
 * @property {Wind|null} wind
 */

/**
 * A single weather alert category.
 * @typedef {Object} AlertDetail
 * @property {boolean} active
 * @property {'high'|'moderate'|null} severity
 */

/**
 * @typedef {AlertDetail & { precipitationMm: number }} RainAlert
 * @typedef {AlertDetail & { windKmh: number, gustKmh: number }} StormAlert
 * @typedef {AlertDetail & { temperatureC: number|null }} HeatAlert
 * @typedef {AlertDetail & { uvIndex: number|null }} UvAlert
 * @typedef {AlertDetail & { crosswindKmh: number, windDirectionLabel: string }} SidewindAlert
 */

/**
 * Aggregated weather alerts for a route.
 * @typedef {Object} WeatherAlerts
 * @property {boolean} allClear
 * @property {number} activeCount
 * @property {string} measuredAt - ISO 8601
 * @property {string} source
 * @property {{ rain: RainAlert, storm: StormAlert, heat: HeatAlert, uv: UvAlert, sidewind: SidewindAlert }} alerts
 */

/**
 * The main route object returned by the routing engine.
 * @typedef {Object} Route
 * @property {LineStringGeometry} geometry
 * @property {number} distance - metres
 * @property {number} duration - seconds
 * @property {number} [ascent] - metres
 * @property {number} [descent] - metres
 * @property {RouteLeg[]} legs
 * @property {object|null} routeStats - highway/surface distributions
 * @property {LatLon} startPoint - [lon, lat]
 * @property {LatLon} endPoint - [lon, lat]
 * @property {Waypoint[]} [waypoints]
 * @property {string} bikeType
 * @property {string} preference - 'fastest' | 'scenic' | 'offroad'
 * @property {string} rideType - 'z2' | 'sst' | 'tt' | 'threshold'
 * @property {string} [strategy]
 * @property {string} engineUsed - 'BROUTER' | 'OSRM'
 * @property {boolean} fallbackUsed
 * @property {string|null} fallbackFrom
 * @property {string|null} fallbackReason
 * @property {string|null} [shapeWarning]
 * @property {TempoFactors|null} [tempoFactors]
 * @property {WeatherAlerts|null} [weatherAlerts]
 * @property {{ available: boolean, unsafeCrossings: number, strictSafeRouteAvailable: boolean }} railwaySafety
 * @property {PowerZone} powerZone
 * @property {string} timestamp - ISO 8601
 */

/**
 * Rider-specific settings persisted per user.
 * @typedef {Object} RiderProfile
 * @property {number} ftp - watts, 50–600
 * @property {number} weight - kg, 30–250
 */

/**
 * Full user profile stored on disk.
 * @typedef {Object} UserProfile
 * @property {RiderProfile} riderProfile
 * @property {string} bikeType
 * @property {string} rideType - 'z2' | 'sst' | 'tt' | 'threshold'
 * @property {string} displayName
 * @property {string} [email]
 * @property {string} [preferred_username]
 */

/**
 * A saved route as stored on disk.
 * @typedef {Object} SavedRoute
 * @property {string} id
 * @property {string} ownerSub
 * @property {string} ownerName
 * @property {string} createdAt - ISO 8601
 * @property {string} updatedAt - ISO 8601
 * @property {string} name
 * @property {string} description
 * @property {LatLon|null} startPoint
 * @property {string} startLabel
 * @property {LatLon|null} endPoint
 * @property {string} endLabel
 * @property {Waypoint[]} waypoints
 * @property {string} bikeType
 * @property {string} preference
 * @property {string} rideType
 * @property {RiderProfile} riderProfile
 * @property {boolean} includeReturnTrip
 * @property {'public'|'private'} visibility
 * @property {string[]} sharedWith
 * @property {Route} route
 * @property {Route|null} returnRoute
 * @property {number} distance - metres
 * @property {number} duration - seconds
 */

/**
 * Lightweight summary of a saved route (no full geometry).
 * @typedef {Object} SavedRouteSummary
 * @property {string} id
 * @property {string} ownerSub
 * @property {string} ownerName
 * @property {'own'|'public'|'shared'|'private'} access
 * @property {boolean} canEdit
 * @property {string} name
 * @property {string} startLabel
 * @property {string} endLabel
 * @property {number} distance
 * @property {number} duration
 * @property {string} bikeType
 * @property {string} preference
 * @property {string} rideType
 * @property {'public'|'private'} visibility
 * @property {string[]} sharedWith
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Authenticated user info from Keycloak.
 * @typedef {Object} KeycloakUser
 * @property {string} sub - unique user ID
 * @property {string} [email]
 * @property {string} [preferred_username]
 * @property {string} [name]
 * @property {string} [given_name]
 * @property {string} [family_name]
 */

/**
 * Auth context attached to req.auth by middleware.
 * @typedef {Object} AuthContext
 * @property {string} token
 * @property {KeycloakUser} user
 */

module.exports = {};
