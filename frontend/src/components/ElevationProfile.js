import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { t } from '../i18n';
import '../styles/ElevationProfile.css';

const rawApiUrl = (process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
const API_BASE = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`)
  : '/api';
const MAX_ELEVATION_POINTS = 120;
const LEVEL_COLORS = {
  1: '#16a34a',
  2: '#65a30d',
  3: '#d97706',
  4: '#ea580c',
  5: '#dc2626'
};

const CLIMB_BANDS = [
  { level: 1, max: 220 },
  { level: 2, max: 420 },
  { level: 3, max: 650 },
  { level: 4, max: 900 },
  { level: 5, max: Number.POSITIVE_INFINITY }
];

const GRADIENT_BANDS = [
  { level: 1, max: 3 },
  { level: 2, max: 6 },
  { level: 3, max: 9 },
  { level: 4, max: 12 },
  { level: 5, max: Number.POSITIVE_INFINITY }
];

const TOUGHNESS_BANDS = [
  { level: 1, max: 180 },
  { level: 2, max: 300 },
  { level: 3, max: 430 },
  { level: 4, max: 600 },
  { level: 5, max: Number.POSITIVE_INFINITY }
];

function ElevationTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const point = payload[0].payload || {};
  const elevation = Math.round(Number(point.elevation) || 0);
  const distance = Number(label) || 0;
  const gradient = Number(point.gradient || 0);

  return (
    <div className="elevation-tooltip">
      <strong>{elevation} m</strong>
      <span>{distance.toFixed(1)} km</span>
      <span>{gradient >= 0 ? '+' : ''}{gradient.toFixed(1)}%</span>
    </div>
  );
}

function ElevationProfile({ route }) {
  const [elevationData, setElevationData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (route && route.geometry) {
      fetchElevationData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  const fetchElevationData = async () => {
    setLoading(true);
    try {
      const coordinates = downsampleCoordinates(
        route.geometry.coordinates.map(coord => [coord[1], coord[0]]),
        MAX_ELEVATION_POINTS
      );

      const response = await fetch(`${API_BASE}/elevation/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates })
      });

      const data = await response.json();

      if (data.points) {
        const chartData = data.points.map((point, idx) => {
          const distanceKm = ((idx * route.distance) / Math.max(data.points.length - 1, 1)) / 1000;
          const elevation = Math.round(point.elevation);

          if (idx === 0) {
            return { distance: distanceKm, elevation, gradient: 0 };
          }

          const previousDistanceKm = ((idx - 1) * route.distance) / Math.max(data.points.length - 1, 1) / 1000;
          const previousElevation = Math.round(data.points[idx - 1].elevation);
          const deltaDistanceMeters = Math.max(1, (distanceKm - previousDistanceKm) * 1000);
          const gradient = ((elevation - previousElevation) / deltaDistanceMeters) * 100;

          return {
            distance: distanceKm,
            elevation,
            gradient: Number(gradient.toFixed(2))
          };
        });
        setElevationData(chartData);
      }
    } catch (error) {
      console.error(`${t('elevation.error')}:`, error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="elevation-profile loading">{t('elevation.loading')}</div>;
  }

  if (elevationData.length === 0) {
    return null;
  }

  const minElevation = Math.min(...elevationData.map((entry) => entry.elevation));
  const maxElevation = Math.max(...elevationData.map((entry) => entry.elevation));
  const elevationRange = maxElevation - minElevation;
  const totalAscent = Math.round(sumPositiveAscent(elevationData));
  const distanceKm = Math.max(1, Number(route.distance || 0) / 1000);
  const climbPer10Km = (totalAscent / distanceKm) * 10;
  const maxGradient = Math.max(...elevationData.map((entry) => Math.abs(Number(entry.gradient) || 0)));
  const toughnessScore = climbPer10Km * 0.58 + maxGradient * 22 + (totalAscent / 1000) * 35;

  const climbCode = getBandCode(climbPer10Km, CLIMB_BANDS);
  const gradientCode = getBandCode(maxGradient, GRADIENT_BANDS);
  const toughnessCode = getBandCode(toughnessScore, TOUGHNESS_BANDS);
  const chartColor = LEVEL_COLORS[gradientCode.level] || '#ff5a1f';
  const lineGradientId = `elevationLineGradient-${Math.round(Number(route.distance) || 0)}-${elevationData.length}`;
  const lineGradientStops = buildLineGradientStops(elevationData);

  return (
    <div className="elevation-profile">
      <div className="elevation-profile__header">
        <div className="elevation-profile__title">
          <h3>{t('elevation.title')}</h3>
          <span>{t('elevation.units')}</span>
        </div>
        <div className="elevation-profile__meta">
          <span>min {minElevation} m</span>
          <span>max {maxElevation} m</span>
          <span>{String.fromCharCode(916)} {elevationRange} m</span>
        </div>
      </div>
      <div className="elevation-codes">
        <div className={`elevation-code code-level-${climbCode.level}`}>
          <small>{t('elevation.climbCode')}</small>
          <strong>C{climbCode.level}</strong>
          <span>{totalAscent} m | {Math.round(climbPer10Km)} m/10km</span>
        </div>
        <div className={`elevation-code code-level-${toughnessCode.level}`}>
          <small>{t('elevation.toughnessCode')}</small>
          <strong>T{toughnessCode.level}</strong>
          <span>{Math.round(toughnessScore)} pts</span>
        </div>
        <div className={`elevation-code code-level-${gradientCode.level}`}>
          <small>{t('elevation.gradientCode')}</small>
          <strong>G{gradientCode.level}</strong>
          <span>{maxGradient.toFixed(1)}% max</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={elevationData} margin={{ top: 10, right: 24, bottom: 16, left: 6 }}>
          <defs>
            <linearGradient id={lineGradientId} x1="0" y1="0" x2="1" y2="0">
              {lineGradientStops.map((stop) => (
                <stop
                  key={`${stop.offset}-${stop.color}`}
                  offset={stop.offset}
                  stopColor={stop.color}
                  stopOpacity={1}
                />
              ))}
            </linearGradient>
            <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="8%" stopColor={chartColor} stopOpacity={0.5} />
              <stop offset="90%" stopColor={chartColor} stopOpacity={0.06} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="rgba(148, 163, 184, 0.32)" />
          <XAxis
            dataKey="distance"
            tickFormatter={(value) => `${value < 10 ? value.toFixed(1) : Math.round(value)} km`}
            tickMargin={8}
            height={30}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
          />
          <YAxis
            tickFormatter={(value) => `${Math.round(value)} m`}
            tickMargin={8}
            width={62}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
          />
          <Tooltip
            content={<ElevationTooltip />}
            cursor={{ stroke: chartColor, strokeOpacity: 0.4, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="elevation"
            stroke={`url(#${lineGradientId})`}
            strokeWidth={2}
            fill="url(#elevationGradient)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function sumPositiveAscent(points) {
  let ascent = 0;
  for (let i = 1; i < points.length; i++) {
    const delta = Number(points[i].elevation) - Number(points[i - 1].elevation);
    if (delta > 0) {
      ascent += delta;
    }
  }
  return ascent;
}

function getBandCode(value, bands) {
  const numeric = Number(value) || 0;
  const match = bands.find((band) => numeric <= band.max);
  return match || bands[bands.length - 1];
}

function getGradientSegmentColor(gradientPercent) {
  const level = getBandCode(Math.abs(Number(gradientPercent) || 0), GRADIENT_BANDS).level;
  return LEVEL_COLORS[level] || '#ff5a1f';
}

function buildLineGradientStops(points) {
  if (!Array.isArray(points) || points.length <= 1) {
    return [{ offset: '0%', color: '#ff5a1f' }, { offset: '100%', color: '#ff5a1f' }];
  }

  const maxIndex = points.length - 1;
  return points.map((point, index) => ({
    offset: `${((index / maxIndex) * 100).toFixed(2)}%`,
    color: getGradientSegmentColor(point.gradient)
  }));
}

function downsampleCoordinates(coordinates, maxPoints) {
  if (coordinates.length <= maxPoints) {
    return coordinates;
  }

  const sampled = [coordinates[0]];
  const step = (coordinates.length - 1) / (maxPoints - 1);

  for (let i = 1; i < maxPoints - 1; i++) {
    sampled.push(coordinates[Math.round(i * step)]);
  }

  sampled.push(coordinates[coordinates.length - 1]);
  return sampled;
}

export default ElevationProfile;
