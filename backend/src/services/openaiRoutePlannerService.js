const axios = require('axios');
const { searchPlaces } = require('./geocodingService');
const { getRoute } = require('./routingService');

const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/responses';
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-nano';
const AI_ROUNDTRIP_ENABLED = String(process.env.AI_ROUNDTRIP_ENABLED || 'false') === 'true';
const AI_ROUNDTRIP_TIMEOUT_MS = Number(process.env.AI_ROUNDTRIP_TIMEOUT_MS || 20000);
const AI_ROUNDTRIP_CANDIDATES = clamp(Number(process.env.AI_ROUNDTRIP_CANDIDATES || 1), 1, 3);
const AI_ROUNDTRIP_ROUTE_CANDIDATES = clamp(Number(process.env.AI_ROUNDTRIP_ROUTE_CANDIDATES || 1), 1, AI_ROUNDTRIP_CANDIDATES);
const AI_ROUNDTRIP_ALLOW_FALLBACK = String(process.env.AI_ROUNDTRIP_ALLOW_FALLBACK || 'true') !== 'false';
const AI_ROUNDTRIP_MAX_TIME_FACTOR = Number(process.env.AI_ROUNDTRIP_MAX_TIME_FACTOR || 1.18);

const PERSONA_PRESETS = {
  coffee: { rideType: 'z2', preference: 'scenic', speedKmh: 21, distanceFactor: 0.92 },
  bunch: { rideType: 'tt', preference: 'fastest', speedKmh: 30, distanceFactor: 1.04 },
  endurance: { rideType: 'sst', preference: 'scenic', speedKmh: 25, distanceFactor: 1.0 },
  gravel: { rideType: 'z2', preference: 'offroad', speedKmh: 20, distanceFactor: 0.9 }
};

const ROUNDTRIP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'preference', 'rideType', 'targetDistanceKm', 'waypoints'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          preference: { type: 'string', enum: ['fastest', 'scenic', 'offroad'] },
          rideType: { type: 'string', enum: ['z2', 'sst', 'tt', 'threshold'] },
          targetDistanceKm: { type: 'number', minimum: 8, maximum: 220 },
          waypoints: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'bearingDeg', 'distanceFactor', 'purpose'],
              properties: {
                label: { type: 'string' },
                bearingDeg: { type: 'integer', minimum: 0, maximum: 359 },
                distanceFactor: { type: 'number', minimum: 0.25, maximum: 1.2 },
                purpose: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
};

function getPlannerStatus() {
  return {
    enabled: AI_ROUNDTRIP_ENABLED && Boolean(OPENAI_API_KEY),
    configured: Boolean(OPENAI_API_KEY),
    model: OPENAI_MODEL
  };
}

async function planRoundtrip(input = {}) {
  if (!AI_ROUNDTRIP_ENABLED) {
    const error = new Error('AI roundtrip planning is disabled. Set AI_ROUNDTRIP_ENABLED=true.');
    error.status = 503;
    throw error;
  }

  if (!OPENAI_API_KEY) {
    const error = new Error('OpenAI API key is missing. Set OPENAI_API_KEY in the backend environment.');
    error.status = 503;
    throw error;
  }

  const start = normalizePoint(input.start);
  if (!start) {
    const error = new Error('Start point is required for roundtrip planning.');
    error.status = 400;
    throw error;
  }

  const targetQuery = String(input.target || '').trim();
  if (targetQuery.length < 3 || targetQuery.length > 160) {
    const error = new Error('Target place must be between 3 and 160 characters.');
    error.status = 400;
    throw error;
  }

  const persona = normalizePersona(input.persona);
  const preset = PERSONA_PRESETS[persona];
  const timeMinutes = clamp(parseTimeBudgetMinutes(input.timeBudgetMinutes ?? input.timeBudget), 30, 600);
  const bikeType = String(input.bikeType || 'road').trim().slice(0, 80) || 'road';
  const riderProfile = input.riderProfile && typeof input.riderProfile === 'object' ? input.riderProfile : {};
  const targetDistanceKm = getTargetDistanceKm(timeMinutes, preset, bikeType);
  const targetPlace = await resolveTargetPlace(targetQuery);

  const planContext = {
    start,
    targetPlace,
    targetQuery,
    targetDistanceKm,
    timeMinutes,
    bikeType,
    persona,
    preset
  };

  let aiPlan;
  let plannerFallbackReason = '';
  try {
    aiPlan = await requestOpenAiPlan(planContext);
  } catch (error) {
    if (!AI_ROUNDTRIP_ALLOW_FALLBACK) {
      throw error;
    }
    plannerFallbackReason = error.message;
    aiPlan = { candidates: buildFallbackCandidates(planContext) };
  }

  const plannedCandidates = sanitizeCandidates(aiPlan.candidates, {
    targetDistanceKm,
    preset,
    persona
  });

  const routedCandidates = [];
  for (const candidate of plannedCandidates.slice(0, AI_ROUNDTRIP_ROUTE_CANDIDATES)) {
    try {
      const routed = await calculateBudgetedRoundtrip({
        start,
        target: targetPlace.point,
        candidate,
        bikeType,
        riderProfile,
        timeMinutes
      });

      routedCandidates.push({
        ...candidate,
        waypoints: routed.waypoints,
        route: routed.route,
        attempts: routed.attempts,
        score: scoreCandidate(routed.route, candidate, timeMinutes)
      });
    } catch (error) {
      routedCandidates.push({
        ...candidate,
        waypoints: [],
        error: error.message,
        score: -Infinity
      });
    }
  }

  const successful = routedCandidates
    .filter((candidate) => candidate.route)
    .sort((a, b) => b.score - a.score);

  if (!successful.length) {
    const error = new Error('AI generated route ideas, but no valid roundtrip could be calculated.');
    error.status = 502;
    error.candidates = routedCandidates.map(summarizeCandidate);
    throw error;
  }

  const selected = successful[0];
  return {
    route: {
      ...selected.route,
      aiRoundtrip: {
        title: selected.title,
        description: selected.description,
        targetPlace,
        timeBudgetMinutes: timeMinutes,
        targetDistanceKm: selected.targetDistanceKm,
        score: selected.score,
        actualTimeBudgetFactor: Number(((Number(selected.route.duration) || 0) / Math.max(timeMinutes * 60, 1)).toFixed(2)),
        attempts: selected.attempts || 1,
        fallback: Boolean(plannerFallbackReason),
        fallbackReason: plannerFallbackReason
      }
    },
    selectedPlan: summarizeCandidate(selected),
    candidates: routedCandidates.map(summarizeCandidate),
    targetPlace,
    timeBudgetMinutes: timeMinutes,
    fallback: Boolean(plannerFallbackReason),
    fallbackReason: plannerFallbackReason
  };
}

async function resolveTargetPlace(query) {
  const places = await searchPlaces(query, { limit: 1, language: 'de' });
  const place = places[0];
  if (!place || !normalizePoint(place.point)) {
    const error = new Error(`Could not resolve target place "${query}".`);
    error.status = 400;
    throw error;
  }

  return {
    label: String(place.label || query).slice(0, 180),
    type: String(place.type || 'place').slice(0, 80),
    point: normalizePoint(place.point)
  };
}

async function requestOpenAiPlan(context) {
  const prompt = [
    `Plan ${AI_ROUNDTRIP_CANDIDATES} cycling loop candidate as JSON.`,
    `Target ${context.targetPlace.label} at ${context.targetPlace.point[0]},${context.targetPlace.point[1]}.`,
    `Time ${context.timeMinutes} min, distance at most about ${context.targetDistanceKm} km, bike ${context.bikeType}, persona ${context.persona}.`,
    `Use preference ${context.preset.preference} and rideType ${context.preset.rideType} unless a better fit is obvious.`,
    'Return compact relative waypoint bearings around the target place, not coordinates. Avoid wide detours.'
  ].join('\n');

  let response;
  try {
    response = await axios.post(
      OPENAI_API_URL,
      {
        model: OPENAI_MODEL,
        input: [
          {
            role: 'system',
            content: 'Output compact JSON matching the schema. Be conservative.'
          },
          { role: 'user', content: prompt }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'roundtrip_plan',
            strict: true,
            schema: ROUNDTRIP_SCHEMA
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: AI_ROUNDTRIP_TIMEOUT_MS
      }
    );
  } catch (error) {
    throw normalizeOpenAiError(error);
  }

  const text = extractOutputText(response.data);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('OpenAI returned invalid roundtrip JSON.');
  }
}

function normalizeOpenAiError(error) {
  if (error.code === 'ECONNABORTED') {
    const timeoutError = new Error(`OpenAI roundtrip planning timed out after ${AI_ROUNDTRIP_TIMEOUT_MS}ms. Increase AI_ROUNDTRIP_TIMEOUT_MS or try again.`);
    timeoutError.status = 504;
    return timeoutError;
  }

  if (error.response) {
    const message = error.response.data?.error?.message || error.response.data?.message || error.message;
    const upstreamError = new Error(`OpenAI request failed: ${message}`);
    upstreamError.status = error.response.status >= 500 ? 502 : 400;
    return upstreamError;
  }

  return error;
}

function extractOutputText(data = {}) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }

  const chunks = [];
  for (const item of Array.isArray(data.output) ? data.output : []) {
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (typeof content.text === 'string') chunks.push(content.text);
    }
  }

  const text = chunks.join('').trim();
  if (!text) {
    throw new Error('OpenAI returned no usable roundtrip plan.');
  }
  return text;
}

function sanitizeCandidates(candidates, context) {
  const source = Array.isArray(candidates) && candidates.length
    ? candidates
    : buildFallbackCandidates(context);

  return source.slice(0, AI_ROUNDTRIP_CANDIDATES).map((candidate, index) => ({
    id: `ai-${index + 1}`,
    title: String(candidate.title || `Roundtrip ${index + 1}`).trim().slice(0, 80),
    description: String(candidate.description || '').trim().slice(0, 260),
    preference: ['fastest', 'scenic', 'offroad'].includes(candidate.preference)
      ? candidate.preference
      : context.preset.preference,
    rideType: ['z2', 'sst', 'tt', 'threshold'].includes(candidate.rideType)
      ? candidate.rideType
      : context.preset.rideType,
    targetDistanceKm: clamp(Number(candidate.targetDistanceKm) || context.targetDistanceKm, 8, 220),
    waypoints: sanitizeRelativeWaypoints(candidate.waypoints)
  }));
}

function sanitizeRelativeWaypoints(waypoints) {
  const source = Array.isArray(waypoints) && waypoints.length >= 2
    ? waypoints
    : [
      { label: 'Loop arc', bearingDeg: 70, distanceFactor: 0.45, purpose: 'create compact outbound arc' },
      { label: 'Return arc', bearingDeg: 210, distanceFactor: 0.5, purpose: 'create compact return arc' },
      { label: 'Home arc', bearingDeg: 310, distanceFactor: 0.38, purpose: 'avoid direct out-and-back' }
    ];

  return source.slice(0, 3).map((waypoint, index) => ({
    label: String(waypoint.label || `AI waypoint ${index + 1}`).trim().slice(0, 80),
    bearingDeg: clamp(Math.round(Number(waypoint.bearingDeg) || 0), 0, 359),
    distanceFactor: clamp(Number(waypoint.distanceFactor) || 0.45, 0.18, 0.75),
    purpose: String(waypoint.purpose || 'shape loop').trim().slice(0, 120)
  }));
}

async function calculateBudgetedRoundtrip({ start, target, candidate, bikeType, riderProfile, timeMinutes }) {
  const attempts = [1, 0.72, 0.52];
  const attempted = [];
  let best = null;
  const maxDurationSeconds = timeMinutes * 60 * AI_ROUNDTRIP_MAX_TIME_FACTOR;

  for (const radiusScale of attempts) {
    const waypointPlan = buildWaypointPlan(start, target, candidate, radiusScale);
    const route = await getRoute(start, start, {
      waypoints: waypointPlan.map((waypoint) => waypoint.point),
      bikeType,
      preference: candidate.preference,
      rideType: candidate.rideType,
      riderProfile,
      fast: true
    });
    const duration = Number(route.duration) || 0;
    const result = { route, waypoints: waypointPlan, attempts: attempted.length + 1, radiusScale };
    attempted.push(result);

    if (!best || Math.abs(duration - timeMinutes * 60) < Math.abs(Number(best.route.duration || 0) - timeMinutes * 60)) {
      best = result;
    }

    if (duration <= maxDurationSeconds) {
      return result;
    }
  }

  return best || attempted[0];
}

function buildWaypointPlan(start, target, candidate, radiusScale = 1) {
  const startToTargetKm = Math.max(2, distanceKm(start, target));
  const availableLoopKm = Math.max(6, candidate.targetDistanceKm - (startToTargetKm * 2.25));
  const loopRadiusKm = clamp(
    Math.max(1.5, Math.min(startToTargetKm * 0.32, availableLoopKm / 6) * radiusScale),
    1.2,
    Math.max(2.5, candidate.targetDistanceKm / 5.5)
  );

  const waypoints = [];

  for (const waypoint of candidate.waypoints) {
    const point = destinationPoint(target, waypoint.bearingDeg, loopRadiusKm * waypoint.distanceFactor);
    if (isPointReasonable(point)) {
      waypoints.push({
        label: waypoint.label,
        point,
        purpose: waypoint.purpose
      });
    }
  }

  if (!waypoints.length && isPointReasonable(target)) {
    waypoints.push({
      label: 'Zielgebiet',
      point: target,
      purpose: 'fallback anchor'
    });
  }

  return waypoints.slice(0, 3);
}

function summarizeCandidate(candidate) {
  return {
    id: candidate.id,
    title: candidate.title,
    description: candidate.description,
    preference: candidate.preference,
    rideType: candidate.rideType,
    targetDistanceKm: candidate.targetDistanceKm,
    score: Number.isFinite(candidate.score) ? Math.round(candidate.score) : null,
    distance: candidate.route ? Math.round(Number(candidate.route.distance || 0)) : 0,
    duration: candidate.route ? Math.round(Number(candidate.route.duration || 0)) : 0,
    attempts: Number(candidate.attempts) || 0,
    error: candidate.error || '',
    waypoints: (candidate.waypoints || []).map((waypoint) => ({
      label: waypoint.label,
      point: waypoint.point,
      purpose: waypoint.purpose
    }))
  };
}

function scoreCandidate(route, candidate, timeMinutes) {
  const durationMinutes = Number(route.duration || 0) / 60;
  const durationFit = Math.max(0, 100 - Math.abs(durationMinutes - timeMinutes) * 1.8);
  const distanceKmValue = Number(route.distance || 0) / 1000;
  const distanceFit = Math.max(0, 60 - Math.abs(distanceKmValue - candidate.targetDistanceKm) * 1.2);
  const shapeBonus = Array.isArray(route.waypoints) && route.waypoints.length > 2 ? 10 : 0;
  return durationFit + distanceFit + shapeBonus;
}

function getTargetDistanceKm(timeMinutes, preset, bikeType) {
  const bikeAdjustment = /gravel|terra|mtb|mountain/i.test(String(bikeType || '')) ? 0.9 : 1;
  return Math.round((timeMinutes / 60) * preset.speedKmh * preset.distanceFactor * bikeAdjustment);
}

function parseTimeBudgetMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const text = String(value || '').toLowerCase().trim();
  if (!text) return 120;
  const hourMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(h|std|stunde|stunden|hour|hours)/);
  const minuteMatch = text.match(/(\d+)\s*(m|min|minute|minutes)/);
  const colonMatch = text.match(/^(\d{1,2}):(\d{2})$/);

  if (colonMatch) {
    return Number(colonMatch[1]) * 60 + Number(colonMatch[2]);
  }

  const hours = hourMatch ? Number(hourMatch[1].replace(',', '.')) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  if (hours || minutes) {
    return hours * 60 + minutes;
  }

  const numeric = Number(text.replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : 120;
}

function normalizePersona(value) {
  const persona = String(value || '').trim().toLowerCase();
  return PERSONA_PRESETS[persona] ? persona : 'endurance';
}

function normalizePoint(point) {
  if (!Array.isArray(point) || point.length < 2) {
    return null;
  }
  const lat = Number(point[0]);
  const lon = Number(point[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return [lat, lon];
}

function isPointReasonable(point) {
  return Array.isArray(point)
    && Number.isFinite(point[0])
    && Number.isFinite(point[1])
    && point[0] >= -85
    && point[0] <= 85
    && point[1] >= -180
    && point[1] <= 180;
}

function distanceKm(a, b) {
  const radius = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function destinationPoint(origin, bearingDeg, distance) {
  const radius = 6371;
  const bearing = toRad(bearingDeg);
  const angularDistance = distance / radius;
  const lat1 = toRad(origin[0]);
  const lon1 = toRad(origin[1]);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
    + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [toDeg(lat2), normalizeLon(toDeg(lon2))];
}

function normalizeLon(lon) {
  return ((lon + 540) % 360) - 180;
}

function toRad(degrees) {
  return degrees * Math.PI / 180;
}

function toDeg(radians) {
  return radians * 180 / Math.PI;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildFallbackCandidates(context) {
  return [
    {
      title: 'Balanced loop',
      description: 'A steady loop through the target area with a broad return arc.',
      preference: context.preset.preference,
      rideType: context.preset.rideType,
      targetDistanceKm: context.targetDistanceKm,
      waypoints: []
    }
  ];
}

module.exports = {
  getPlannerStatus,
  planRoundtrip
};
