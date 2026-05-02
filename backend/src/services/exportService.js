const xml = require('xml');

/**
 * Generate TCX file for export to Wahoo, Garmin, etc
 * TCX (Training Center XML) is the standard format for sport watches
 */
async function generateTCXFile(route, metadata = {}) {
  const { name = 'Route', description = '' } = metadata;

  // Convert route geometry to track points
  let trackPoints = [];
  if (route.geometry && route.geometry.coordinates) {
    trackPoints = route.geometry.coordinates.map((coord, index) => ({
      LatitudeDegrees: coord[1],
      LongitudeDegrees: coord[0],
      AltitudeMeters: Math.random() * 500, // Placeholder - would need elevation data
      Time: new Date(Date.now() + index * 1000).toISOString() // Placeholder timestamps
    }));
  }

  const tcxStructure = {
    '?xml': {
      '@': {
        version: '1.0',
        encoding: 'UTF-8'
      }
    },
    'TrainingCenterDatabase': {
      '@': {
        'xmlns': 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation': 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd'
      },
      Courses: {
        Course: {
          Name: name,
          LapOrTrackpoints: {
            Track: {
              Trackpoint: trackPoints.map(tp => ({
                Time: tp.Time,
                Position: {
                  LatitudeDegrees: tp.LatitudeDegrees,
                  LongitudeDegrees: tp.LongitudeDegrees
                },
                AltitudeMeters: tp.AltitudeMeters
              }))
            }
          }
        }
      }
    }
  };

  return buildXML(tcxStructure);
}

/**
 * Generate GPX file for universal compatibility
 */
async function generateGPXFile(route, metadata = {}) {
  const { name = 'Route', description = '' } = metadata;
  const timestamp = new Date().toISOString();

  // Convert route geometry to waypoints
  let trkpts = [];
  if (route.geometry && route.geometry.coordinates) {
    trkpts = route.geometry.coordinates.map((coord, index) => ({
      '@': {
        lat: coord[1],
        lon: coord[0]
      },
      ele: Math.random() * 500, // Placeholder
      time: new Date(Date.now() + index * 1000).toISOString(),
      name: `Waypoint ${index + 1}`
    }));
  }

  const gpxStructure = {
    '?xml': {
      '@': {
        version: '1.0',
        encoding: 'UTF-8'
      }
    },
    gpx: {
      '@': {
        version: '1.1',
        creator: 'Bike Route Planner',
        'xmlns': 'http://www.topografix.com/GPX/1/1',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation': 'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd'
      },
      metadata: {
        name: name,
        desc: description,
        author: {
          name: 'Bike Route Planner'
        },
        time: timestamp
      },
      trk: {
        name: name,
        desc: description,
        trkseg: {
          trkpt: trkpts
        }
      }
    }
  };

  return buildXML(gpxStructure);
}

/**
 * Build XML string from structure object
 */
function buildXML(obj) {
  const builder = require('xml');
  return xml(obj, { declaration: true, indent: '  ' });
}

module.exports = {
  generateTCXFile,
  generateGPXFile
};
