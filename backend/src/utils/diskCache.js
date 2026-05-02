const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const CACHE_DIR = process.env.ROUTESHRED_CACHE_DIR
  || path.resolve(__dirname, '../../../data/cache');

async function getCachedJson(namespace, key, ttlMs) {
  if (!ttlMs || ttlMs <= 0) {
    return null;
  }

  const filePath = getCachePath(namespace, key);

  try {
    const stat = await fs.stat(filePath);
    if (Date.now() - stat.mtimeMs > ttlMs) {
      return null;
    }

    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Cache read failed for ${namespace}:`, error.message);
    }
    return null;
  }
}

async function setCachedJson(namespace, key, value) {
  const filePath = getCachePath(namespace, key);

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value), 'utf8');
  } catch (error) {
    console.warn(`Cache write failed for ${namespace}:`, error.message);
  }
}

function getCachePath(namespace, key) {
  const hash = crypto
    .createHash('sha1')
    .update(typeof key === 'string' ? key : JSON.stringify(key))
    .digest('hex');

  return path.join(CACHE_DIR, namespace, `${hash}.json`);
}

module.exports = {
  getCachedJson,
  setCachedJson
};
