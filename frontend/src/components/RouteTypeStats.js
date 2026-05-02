import React, { useState } from 'react';
import '../styles/RouteTypeStats.css';

// ── Label mappings ────────────────────────────────────────────────────────────

const HIGHWAY_LABELS = {
  motorway: 'Autobahn',
  motorway_link: 'Autobahnauffahrt',
  trunk: 'Schnellstraße',
  trunk_link: 'Schnellstraße (Auf-/Abfahrt)',
  primary: 'Bundesstraße',
  primary_link: 'Bundesstraße (Auf-/Abfahrt)',
  secondary: 'Staatsstraße',
  secondary_link: 'Staatsstraße (Auf-/Abfahrt)',
  tertiary: 'Gemeindestraße',
  tertiary_link: 'Gemeindestraße (Auf-/Abfahrt)',
  unclassified: 'Ländlicher Weg',
  residential: 'Wohnstraße',
  service: 'Zufahrtsstraße',
  living_street: 'Spielstraße',
  cycleway: 'Radweg',
  path: 'Weg / Pfad',
  track: 'Feld- / Forstweg',
  footway: 'Fußweg',
  bridleway: 'Reitweg',
  steps: 'Treppe',
  unknown: 'Unbekannt',
};

const SURFACE_LABELS = {
  asphalt: 'Asphalt',
  paved: 'Asphalt / Beton',
  concrete: 'Beton',
  'concrete:plates': 'Betonplatten',
  compacted: 'Verdichtet',
  fine_gravel: 'Feinkies',
  gravel: 'Schotter / Kies',
  pebblestone: 'Kopfsteinpflaster',
  cobblestone: 'Kopfsteinpflaster',
  'cobblestone:flattened': 'Flachsteinpflaster',
  paving_stones: 'Pflastersteine',
  sett: 'Großsteinpflaster',
  unpaved: 'Unbefestigt',
  dirt: 'Erde',
  earth: 'Erde',
  ground: 'Naturweg',
  grass: 'Gras',
  grass_paver: 'Rasengitter',
  sand: 'Sand',
  mud: 'Schlamm',
  wood: 'Holz',
  metal: 'Metall',
  unknown: 'Unbekannt',
};

// ── Colour palette ────────────────────────────────────────────────────────────
// Highway: road quality descending (blue = fast, orange/red = rough)
const HIGHWAY_COLORS = {
  motorway:        '#3b6fd4',
  motorway_link:   '#3b6fd4',
  trunk:           '#4a85e8',
  trunk_link:      '#4a85e8',
  primary:         '#5a9cf5',
  primary_link:    '#5a9cf5',
  secondary:       '#6eb5ff',
  secondary_link:  '#6eb5ff',
  tertiary:        '#82c8a0',
  tertiary_link:   '#82c8a0',
  unclassified:    '#a8d8a8',
  residential:     '#c5e8b0',
  service:         '#d4e4a0',
  living_street:   '#e0e890',
  cycleway:        '#2ec06e',
  path:            '#e8b84b',
  track:           '#d48a2e',
  footway:         '#c07060',
  bridleway:       '#b06050',
  steps:           '#cc4444',
  unknown:         '#888888',
};

// Surface: smoothness descending (green = smooth, red = rough)
const SURFACE_COLORS = {
  asphalt:                 '#3b9cd4',
  paved:                   '#4aabe3',
  concrete:                '#5abcf0',
  'concrete:plates':       '#6aceff',
  compacted:               '#6cc87a',
  fine_gravel:             '#88c865',
  gravel:                  '#c8a84b',
  pebblestone:             '#d49030',
  cobblestone:             '#c87030',
  'cobblestone:flattened': '#d08040',
  paving_stones:           '#b8a060',
  sett:                    '#c8a060',
  unpaved:                 '#c86840',
  dirt:                    '#b85030',
  earth:                   '#b05030',
  ground:                  '#a84820',
  grass:                   '#50a850',
  grass_paver:             '#60b860',
  sand:                    '#e8c840',
  mud:                     '#906030',
  wood:                    '#c09060',
  metal:                   '#8090a0',
  unknown:                 '#888888',
};

function fallbackColor(type, palette) {
  return palette[type] || '#aaaaaa';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

function labelFor(type, map) {
  return map[type] || type.replace(/_/g, ' ');
}

// Merge small slices (< minPct) into 'Sonstige'
function mergeSmall(entries, minPct = 2) {
  const big = entries.filter((e) => e.pct >= minPct);
  const small = entries.filter((e) => e.pct < minPct);
  if (!small.length) return big;
  const otherMeters = small.reduce((s, e) => s + e.meters, 0);
  const otherPct    = small.reduce((s, e) => s + e.pct, 0);
  return [...big, { type: '_other', meters: otherMeters, pct: otherPct }];
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function StackedBar({ entries, colorPalette, labelMap }) {
  const [tooltip, setTooltip] = useState(null);
  const merged = mergeSmall(entries);

  return (
    <div className="rts-bar-wrap">
      <div className="rts-bar"
        onMouseLeave={() => setTooltip(null)}
      >
        {merged.map((entry) => {
          const color = entry.type === '_other' ? '#999' : fallbackColor(entry.type, colorPalette);
          const label = entry.type === '_other' ? 'Sonstige' : labelFor(entry.type, labelMap);
          return (
            <div
              key={entry.type}
              className="rts-bar-seg"
              style={{ width: `${Math.max(entry.pct, 0.5)}%`, background: color }}
              onMouseEnter={(e) => setTooltip({ label, meters: entry.meters, pct: entry.pct, x: e.clientX })}
            />
          );
        })}
      </div>
      {tooltip && (
        <div className="rts-tooltip">
          {tooltip.label}: {formatDistance(tooltip.meters)} ({tooltip.pct}%)
        </div>
      )}
    </div>
  );
}

function Legend({ entries, colorPalette, labelMap }) {
  const merged = mergeSmall(entries);
  return (
    <div className="rts-legend">
      {merged.map((entry) => {
        const color = entry.type === '_other' ? '#999' : fallbackColor(entry.type, colorPalette);
        const label = entry.type === '_other' ? 'Sonstige' : labelFor(entry.type, labelMap);
        return (
          <span key={entry.type} className="rts-legend-item">
            <span className="rts-legend-dot" style={{ background: color }} />
            <span className="rts-legend-label">{label}</span>
            <span className="rts-legend-pct">{entry.pct}%</span>
          </span>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function RouteTypeStats({ routeStats }) {
  if (!routeStats) return null;
  const { highwayTypes, surfaceTypes } = routeStats;
  if (!highwayTypes?.length || !surfaceTypes?.length) return null;

  return (
    <div className="rts-root">
      <div className="rts-section">
        <div className="rts-section-title">Wegtypen</div>
        <StackedBar entries={highwayTypes} colorPalette={HIGHWAY_COLORS} labelMap={HIGHWAY_LABELS} />
        <Legend entries={highwayTypes} colorPalette={HIGHWAY_COLORS} labelMap={HIGHWAY_LABELS} />
      </div>
      <div className="rts-section">
        <div className="rts-section-title">Oberfläche</div>
        <StackedBar entries={surfaceTypes} colorPalette={SURFACE_COLORS} labelMap={SURFACE_LABELS} />
        <Legend entries={surfaceTypes} colorPalette={SURFACE_COLORS} labelMap={SURFACE_LABELS} />
      </div>
    </div>
  );
}

export default RouteTypeStats;
