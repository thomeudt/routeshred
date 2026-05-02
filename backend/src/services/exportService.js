function escapeXml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function downsample(coords, maxPoints) {
  if (coords.length <= maxPoints) return coords;
  const result = [coords[0]];
  const step = (coords.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  result.push(coords[coords.length - 1]);
  return result;
}

async function generateTCXFile(route, metadata = {}) {
  const { name = 'Route' } = metadata;
  const coords = route && route.geometry && Array.isArray(route.geometry.coordinates)
    ? route.geometry.coordinates
    : [];

  if (coords.length < 2) {
    throw new Error('Route has no coordinates');
  }

  const points = downsample(coords, 500);
  const totalSeconds = Number(route.duration) || points.length;
  const totalDistance = Number(route.distance) || 0;
  const baseTime = Date.now();

  const trackpoints = points.map((coord, i) => {
    const fraction = points.length > 1 ? i / (points.length - 1) : 0;
    const time = new Date(baseTime + fraction * totalSeconds * 1000).toISOString();
    const ele = coord[2] != null && Number.isFinite(Number(coord[2])) ? Number(coord[2]) : 0;
    const dist = fraction * totalDistance;
    return `      <Trackpoint>
        <Time>${time}</Time>
        <Position>
          <LatitudeDegrees>${coord[1]}</LatitudeDegrees>
          <LongitudeDegrees>${coord[0]}</LongitudeDegrees>
        </Position>
        <AltitudeMeters>${ele.toFixed(1)}</AltitudeMeters>
        <DistanceMeters>${dist.toFixed(1)}</DistanceMeters>
      </Trackpoint>`;
  }).join('\n');

  const first = points[0];
  const last = points[points.length - 1];

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Courses>
    <Course>
      <Name>${escapeXml(name)}</Name>
      <Lap>
        <TotalTimeSeconds>${Math.round(totalSeconds)}</TotalTimeSeconds>
        <DistanceMeters>${totalDistance.toFixed(1)}</DistanceMeters>
        <BeginPosition>
          <LatitudeDegrees>${first[1]}</LatitudeDegrees>
          <LongitudeDegrees>${first[0]}</LongitudeDegrees>
        </BeginPosition>
        <EndPosition>
          <LatitudeDegrees>${last[1]}</LatitudeDegrees>
          <LongitudeDegrees>${last[0]}</LongitudeDegrees>
        </EndPosition>
        <Intensity>Active</Intensity>
      </Lap>
      <Track>
${trackpoints}
      </Track>
    </Course>
  </Courses>
</TrainingCenterDatabase>`;
}

async function generateGPXFile(route, metadata = {}) {
  const { name = 'Route', description = '' } = metadata;
  const coords = route && route.geometry && Array.isArray(route.geometry.coordinates)
    ? route.geometry.coordinates
    : [];

  if (coords.length < 2) {
    throw new Error('Route has no coordinates');
  }

  const points = downsample(coords, 1000);
  const timestamp = new Date().toISOString();

  const trkpts = points.map((coord) => {
    const ele = coord[2] != null && Number.isFinite(Number(coord[2])) ? Number(coord[2]) : 0;
    return `      <trkpt lat="${coord[1]}" lon="${coord[0]}">
        <ele>${ele.toFixed(1)}</ele>
      </trkpt>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteShred"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${timestamp}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <desc>${escapeXml(description)}</desc>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

module.exports = {
  generateTCXFile,
  generateGPXFile
};
