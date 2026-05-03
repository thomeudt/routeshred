const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');

const THUNDERFOREST_API_KEY = process.env.THUNDERFOREST_API_KEY || '';
const TILE_CACHE_DIR = path.join(
  process.env.ROUTESHRED_CACHE_DIR || path.resolve(__dirname, '../../../data/cache'),
  'tiles'
);
const TILE_CACHE_TTL_MS = parseInt(process.env.TILE_CACHE_TTL_MS || '7776000000', 10); // 90 days
const THUNDERFOREST_BASE_URL = parseThunderforestBaseUrl('https://tile.thunderforest.com');

const STYLE_PATHS = Object.freeze({
  cycle: 'cycle',
  landscape: 'landscape',
  outdoors: 'outdoors',
  transport: 'transport',
  'transport-dark': 'transport-dark',
  'spinal-map': 'spinal-map',
  pioneer: 'pioneer',
  'mobile-atlas': 'mobile-atlas',
  neighbourhood: 'neighbourhood',
  atlas: 'atlas'
});
const ALLOWED_STYLES = new Set(Object.keys(STYLE_PATHS));

function parseThunderforestBaseUrl(rawValue) {
  const value = String(rawValue || '').trim();
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw new Error('Invalid Thunderforest base URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Thunderforest base URL must use https');
  }

  parsed.search = '';
  parsed.hash = '';
  return parsed;
}

function isValidTile(style, z, x, y) {
  if (!ALLOWED_STYLES.has(style)) return false;
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  const max = Math.pow(2, z);
  return z >= 0 && z <= 19 && x >= 0 && x < max && y >= 0 && y < max;
}

function parseInteger(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : NaN;
  }
  if (typeof value === 'string' && /^-?\d+$/u.test(value.trim())) {
    return Number(value);
  }
  return NaN;
}

function normalizeTileRequest(style, z, x, y) {
  const requestedStyle = String(style || '').trim();
  const canonicalStyle = STYLE_PATHS[requestedStyle];
  const tileZ = parseInteger(z);
  const tileX = parseInteger(x);
  const tileY = parseInteger(y);

  if (!canonicalStyle || !isValidTile(canonicalStyle, tileZ, tileX, tileY)) {
    throw new Error('Invalid tile coordinates or style');
  }

  return {
    tileStyle: canonicalStyle,
    tileZ,
    tileX,
    tileY
  };
}

async function fetchTile(style, z, x, y) {
  const { tileStyle, tileZ, tileX, tileY } = normalizeTileRequest(style, z, x, y);

  const tileDir = path.join(TILE_CACHE_DIR, tileStyle, String(tileZ), String(tileX));
  const tilePath = path.join(tileDir, `${tileY}.png`);

  try {
    const stat = await fs.stat(tilePath);
    if (Date.now() - stat.mtimeMs < TILE_CACHE_TTL_MS) {
      const data = await fs.readFile(tilePath);
      return { data, fromCache: true };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('Tile cache read error', {
        tileStyle,
        tileZ,
        tileX,
        tileY,
        message: err.message
      });
    }
  }

  if (!THUNDERFOREST_API_KEY) {
    throw new Error('THUNDERFOREST_API_KEY not configured');
  }

  const basePath = THUNDERFOREST_BASE_URL.pathname.replace(/\/+$/u, '');
  const tilePathname = `${basePath}/${tileStyle}/${tileZ}/${tileX}/${tileY}.png`;
  const url = new URL(tilePathname, THUNDERFOREST_BASE_URL);
  url.searchParams.set('apikey', THUNDERFOREST_API_KEY);

  const response = await axios.get(url.toString(), {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: { 'User-Agent': 'RouteShred-TileProxy/1.0' }
  });

  const data = Buffer.from(response.data);

  fs.mkdir(tileDir, { recursive: true })
    .then(() => fs.writeFile(tilePath, data))
    .catch((err) => console.warn('Tile cache write failed', {
      tileStyle,
      tileZ,
      tileX,
      tileY,
      message: err.message
    }));

  return { data, fromCache: false };
}

module.exports = { fetchTile, isValidTile };
