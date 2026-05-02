import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { t } from '../i18n';
import '../styles/ElevationProfile.css';

const rawApiUrl = (process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
const API_BASE = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`)
  : '/api';
const MAX_ELEVATION_POINTS = 120;

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
        const chartData = data.points.map((point, idx) => ({
          distance: ((idx * route.distance) / data.points.length) / 1000,
          elevation: Math.round(point.elevation)
        }));
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

  return (
    <div className="elevation-profile">
      <div className="elevation-profile__header">
        <h3>{t('elevation.title')}</h3>
        <span>{t('elevation.units')}</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={elevationData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="distance"
            tickFormatter={(value) => `${Math.round(value)} km`}
            tickMargin={8}
          />
          <YAxis
            tickFormatter={(value) => `${Math.round(value)} m`}
            tickMargin={8}
            width={56}
          />
          <Tooltip
            formatter={(value) => [`${Math.round(value)} m`, t('elevation.altitude')]}
            labelFormatter={(label) => `${Number(label).toFixed(1)} km`}
          />
          <Line
            type="monotone"
            dataKey="elevation"
            stroke="#8884d8"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
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
