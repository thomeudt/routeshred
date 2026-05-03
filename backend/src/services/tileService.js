const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');

const THUNDERFOREST_API_KEY = process.env.THUNDERFOREST_API_KEY || '';
const TILE_CACHE_DIR = path.join(
  process.env.ROUTESHRED_CACHE_DIR || path.resolve(__dirname, '../../../data/cache'),
  'tiles'
);
const TILE_CACHE_TTL_MS = parseInt(process.env.TILE_CACHE_TTL_MS || '7776000000', 10); // 90 days

const ALLOWED_STYLES = new Set(['cycle', 'landscape', 'outdoors', 'transport', 'transport-dark', 'spinal-map', 'pioneer', 'mobile-atlas', 'neighbourhood', 'atlas']);

function isValidTile(style, z, x, y) {
  if (!ALLOWED_STYLES.has(style)) return false;
  const max = Math.pow(2, z);
  return z >= 0 && z <= 19 && x >= 0 && x < max && y >= 0 && y < max;
}

async function fetchTile(style, z, x, y) {
  const tileDir = path.join(TILE_CACHE_DIR, style, String(z), String(x));
  const tilePath = path.join(tileDir, `${y}.png`);

  try {
    const stat = await fs.stat(tilePath);
    if (Date.now() - stat.mtimeMs < TILE_CACHE_TTL_MS) {
      const data = await fs.readFile(tilePath);
      return { data, fromCache: true };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`Tile cache read error ${style}/${z}/${x}/${y}:`, err.message);
    }
  }

  if (!THUNDERFOREST_API_KEY) {
    throw new Error('THUNDERFOREST_API_KEY not configured');
  }

  const url = `https://tile.thunderforest.com/${style}/${z}/${x}/${y}.png?apikey=${THUNDERFOREST_API_KEY}`;
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: { 'User-Agent': 'RouteShred-TileProxy/1.0' }
  });

  const data = Buffer.from(response.data);

  fs.mkdir(tileDir, { recursive: true })
    .then(() => fs.writeFile(tilePath, data))
    .catch((err) => console.warn(`Tile cache write failed ${style}/${z}/${x}/${y}:`, err.message));

  return { data, fromCache: false };
}

module.exports = { fetchTile, isValidTile };
