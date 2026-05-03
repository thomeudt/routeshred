// Browser screencast script for docs/USER_MANUAL.md
//
// Usage (anonymous):    node scripts/record-tutorial.js
// Usage (with login):   KC_USER=name KC_PASS=password node scripts/record-tutorial.js
// Also accepted:        ROUTESHRED_TUTORIAL_USER=name ROUTESHRED_TUTORIAL_PASSWORD=password
// Optional:
//   TUTORIAL_BASE=http://localhost:3000
//   TUTORIAL_OUT=docs/tutorial/routeshred-tutorial.webm
//   TUTORIAL_PACE=1.9

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

loadDotEnv(path.resolve(ROOT, '.env'));
loadDotEnv(path.resolve(ROOT, '.env.local'));

const BASE = process.env.TUTORIAL_BASE || 'http://localhost:3000';
const OUT_FILE = path.resolve(ROOT, process.env.TUTORIAL_OUT || 'docs/tutorial/routeshred-tutorial.webm');
const VIDEO_DIR = path.resolve(ROOT, 'docs/tutorial/.playwright-video');
const KC_USER = process.env.KC_USER || process.env.ROUTESHRED_TUTORIAL_USER || process.env.TUTORIAL_USER || '';
const KC_PASS = process.env.KC_PASS || process.env.ROUTESHRED_TUTORIAL_PASSWORD || process.env.TUTORIAL_PASSWORD || '';
const AUTHENTICATED = Boolean(KC_USER && KC_PASS);
const VP = { width: 1440, height: 900 };
const PACE = Number(process.env.TUTORIAL_PACE || '1.9');
const DEMO_GEOLOCATION = {
  latitude: Number(process.env.TUTORIAL_GEO_LAT || '48.5216'),
  longitude: Number(process.env.TUTORIAL_GEO_LON || '9.0576')
};

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value.replace(/\\n/gu, '\n');
  }
}

function delay(ms) {
  return Math.round(ms * PACE);
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMap(page) {
  await page.waitForSelector('.leaflet-container', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function chapter(page, title, subtitle = '') {
  await page.evaluate(({ title, subtitle }) => {
    let overlay = document.querySelector('[data-tutorial-overlay]');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('data-tutorial-overlay', 'true');
      overlay.style.cssText = [
        'position:fixed',
        'left:34px',
        'bottom:34px',
        'z-index:999999',
        'max-width:560px',
        'padding:18px 22px',
        'border-radius:8px',
        'background:rgba(11,17,25,0.88)',
        'color:white',
        'font:500 18px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'box-shadow:0 18px 50px rgba(0,0,0,0.32)',
        'backdrop-filter:blur(8px)',
        'pointer-events:none'
      ].join(';');
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div style="font-size:24px;font-weight:750;margin-bottom:4px">${title}</div>
      ${subtitle ? `<div style="font-size:15px;opacity:.86">${subtitle}</div>` : ''}
    `;
  }, { title, subtitle });
  await page.waitForTimeout(delay(2600));
}

async function hideChapter(page) {
  await page.evaluate(() => {
    const overlay = document.querySelector('[data-tutorial-overlay]');
    if (overlay) overlay.remove();
  });
}

async function login(page) {
  const userField = page.locator('#username, input[name="username"]').first();
  const loginPageVisible = await userField.isVisible({ timeout: 1500 }).catch(() => false)
    || /\/realms\//.test(page.url());

  if (!AUTHENTICATED && loginPageVisible) {
    throw new Error('The app requires login. Run with KC_USER=... KC_PASS=... npm run record:tutorial');
  }

  const loginBtn = page.locator('.header-btn, button').filter({ hasText: /login|sign in|anmelden/i }).first();
  const appLoginVisible = await loginBtn.isVisible({ timeout: 1500 }).catch(() => false);
  const locationInputVisible = await page.locator('.location-input input').first().isVisible({ timeout: 500 }).catch(() => false);

  if (!AUTHENTICATED && !locationInputVisible && appLoginVisible) {
    throw new Error('The app requires login. Run with KC_USER=... KC_PASS=... npm run record:tutorial');
  }

  if (!AUTHENTICATED) {
    return;
  }

  if (!loginPageVisible) {
    if (!appLoginVisible && locationInputVisible) {
      return;
    }

    await chapter(page, 'Anmelden', 'Mit Konto werden gespeicherte Routen und Community-Funktionen sichtbar.');
    await page.waitForTimeout(delay(600));
    await loginBtn.click();
    await page.waitForURL(/\/realms\//, { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(delay(1000));
  }

  const passField = page.locator('#password, input[name="password"]').first();
  if (!await userField.isVisible({ timeout: 7000 }).catch(() => false)) {
    return;
  }

  await userField.fill(KC_USER);
  await page.waitForTimeout(delay(450));
  await passField.fill(KC_PASS);
  await page.waitForTimeout(delay(450));
  await page.locator('[type="submit"], #kc-login').first().click();
  await page.waitForURL(new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 15000 }).catch(() => {});
  await waitForMap(page);
}

async function dismissModal(page) {
  await page.keyboard.press('Escape').catch(() => {});
  for (const sel of [
    '[aria-label*="close" i]',
    '[aria-label*="schließ" i]',
    '[class*="modal-overlay"]',
    '[class*="overlay"]',
    'button.close'
  ]) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 400 }).catch(() => false)) {
      await el.click({ force: true }).catch(() => {});
      break;
    }
  }
  await page.waitForTimeout(400);
}

async function clickTab(page, textRe) {
  const tab = page.locator('[role="tab"], .header-tabs button, nav button, button')
    .filter({ hasText: textRe })
    .first();
  if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(delay(1200));
  }
}

async function fillLocation(page, index, text) {
  const input = page.locator('.location-input input').nth(index);
  await input.waitFor({ timeout: 8000 });
  await input.click();
  // Clear first, then type character-by-character to fire React onChange per keystroke.
  await input.fill('');
  await input.pressSequentially(text, { delay: 130 });

  // Wait for debounce (250ms) + geocoding API response. Do not silently continue:
  // if no result is selected, the calculate button stays disabled.
  const firstResult = page.locator('.location-results button').first();
  await firstResult.waitFor({ timeout: 10000 });
  await page.waitForTimeout(delay(500));
  await firstResult.click();

  // Wait until the input value is settled and dropdown closed.
  await page.waitForSelector('.location-results', { state: 'hidden', timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(delay(700));
}

async function clickCurrentLocation(page, index = 0) {
  const button = page.locator('.location-input').nth(index).locator('.location-current-btn').first();
  if (!await button.isVisible({ timeout: 3000 }).catch(() => false)) {
    return false;
  }
  await button.click();
  await page.waitForTimeout(delay(1500));
  return true;
}

async function calculateRoute(page) {
  // Button text: "Route berechnen" (DE) / "Calculate Route" (EN)
  const btn = page.locator('button.btn-primary')
    .filter({ hasText: /berech|calculat/i })
    .first();
  await btn.waitFor({ timeout: 8000 });
  await btn.evaluate((button) => {
    if (button.disabled) {
      throw new Error('Calculate button is still disabled after selecting start and destination.');
    }
  });
  await btn.click();
  console.log('  -> route calculating...');
  // .route-stats only renders when route is set AND loading is false.
  await page.waitForSelector('.route-stats, .route-stats-collapsible', { timeout: 45000 });
  await page.waitForTimeout(delay(1800));
}

async function scrollControls(page, position) {
  await page.evaluate((pos) => {
    const candidates = [
      '.sidebar',
      '.route-controls',
      '.plan-controls',
      '.controls-panel',
      '.left-panel',
      'aside',
      '.panel'
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollTo({ top: pos === 'bottom' ? el.scrollHeight : pos, behavior: 'smooth' });
      }
    }
  }, position);
  await page.waitForTimeout(delay(1800));
}

async function openDetails(page, selectorOrText) {
  const details = typeof selectorOrText === 'string' && selectorOrText.startsWith('.')
    ? page.locator(selectorOrText).first()
    : page.locator('details').filter({ hasText: selectorOrText }).first();

  if (!await details.isVisible({ timeout: 2500 }).catch(() => false)) {
    return false;
  }

  const isOpen = await details.evaluate((el) => el.open).catch(() => false);
  if (!isOpen) {
    await details.locator('summary').click();
    await page.waitForTimeout(delay(900));
  }
  return true;
}

async function demoAiRoundtripPanel(page) {
  await scrollControls(page, 640);
  const opened = await openDetails(page, '.ai-roundtrip-collapsible');
  if (!opened) {
    return;
  }

  await chapter(page, 'AI Roundtrip', 'Zielgebiet, Zeitfenster und Persona erzeugen Loop-Ideen. Die echte Strecke berechnet danach die Routing-Engine.');
  await hideChapter(page);

  const target = page.locator('.ai-roundtrip-fields input[type="text"]').first();
  if (await target.isVisible({ timeout: 2000 }).catch(() => false)) {
    await target.fill('');
    await target.pressSequentially('Schönbuch Aussicht', { delay: 95 });
    await page.waitForTimeout(delay(800));
  }

  const time = page.locator('.ai-roundtrip-fields input[type="number"]').first();
  if (await time.isVisible({ timeout: 1000 }).catch(() => false)) {
    await time.fill('120');
  }

  const persona = page.locator('.ai-roundtrip-fields select').first();
  if (await persona.isVisible({ timeout: 1000 }).catch(() => false)) {
    await persona.selectOption('endurance').catch(() => {});
  }

  await page.waitForTimeout(delay(1600));
}

async function showMapFullscreen(page) {
  const button = page.locator('.fullscreen-toggle').first();
  if (!await button.isVisible({ timeout: 2500 }).catch(() => false)) {
    return;
  }

  await chapter(page, 'Karte groß ansehen', 'Für den finalen Check lässt sich die Karte in einen fokussierten Vollbildmodus schalten.');
  await hideChapter(page);
  await button.click();
  await page.waitForTimeout(delay(1800));
  await button.click().catch(() => {});
  await page.waitForTimeout(delay(900));
}

async function runTutorial(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await login(page);
  await waitForMap(page);
  await dismissModal(page);
  await clickTab(page, /plan/i);

  await chapter(page, 'RouteShred im Überblick', 'Planung links, Karte rechts: Start, Ziel, Profil und Routenanalyse in einer Oberfläche.');
  await hideChapter(page);
  await page.mouse.move(320, 240);
  await page.waitForTimeout(delay(1400));
  await page.mouse.move(1020, 420);
  await page.waitForTimeout(delay(1400));

  await chapter(page, 'Start und Ziel setzen', 'Adressen, POIs, Kartenklicks oder GPS füllen Start, Ziel und Zwischenziele ohne Umwege.');
  await hideChapter(page);
  await clickCurrentLocation(page, 0);
  await page.waitForTimeout(delay(700));
  await fillLocation(page, 0, 'Tübingen');
  await page.waitForTimeout(delay(800));
  await fillLocation(page, 1, 'Herrenberg');
  await page.waitForTimeout(delay(1200));

  await scrollControls(page, 220);
  await chapter(page, 'Ride Persona wählen', 'Coffee, Bunch, Endurance und Gravel setzen passende Routing- und Leistungsparameter.');
  await hideChapter(page);
  const persona = page.locator('button, label').filter({ hasText: /coffee|kaffee|endurance|gravel/i }).first();
  if (await persona.isVisible({ timeout: 3000 }).catch(() => false)) {
    await persona.click().catch(() => {});
    await page.waitForTimeout(delay(1600));
  }

  if (AUTHENTICATED) {
    await demoAiRoundtripPanel(page);
    await scrollControls(page, 220);
  }

  await chapter(page, 'Route berechnen', 'Nach dem Klick erscheinen Route, Distanz, Höhenprofil, Wetterhinweise und Oberflächenanalyse.');
  await hideChapter(page);
  await calculateRoute(page);
  await showMapFullscreen(page);
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(delay(1800));

  await scrollControls(page, 'bottom');
  await chapter(page, 'Export und Geräte', 'GPX/TCX lassen sich herunterladen oder mobil an Wahoo senden.');
  await hideChapter(page);
  await page.waitForTimeout(delay(2200));

  if (AUTHENTICATED) {
    await clickTab(page, /routen|routes/i);
    await chapter(page, 'Meine Routen', 'Gespeicherte und geteilte Routen lassen sich durchsuchen und nach Startregion filtern.');
    await hideChapter(page);
    const routeSearch = page.locator('.saved-route-search input').first();
    if (await routeSearch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await routeSearch.click();
      await routeSearch.pressSequentially('Tübingen', { delay: 90 }).catch(() => {});
    }
    await page.waitForTimeout(delay(2200));

    await clickTab(page, /community/i);
    await chapter(page, 'Community und Gruppenfahrten', 'Challenge-Karten zeigen Route, Teilnehmende, Kommentare und optionale Instagram-Links.');
    await hideChapter(page);
    const communitySearch = page.locator('.group-rides-filter-search input').first();
    if (await communitySearch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await communitySearch.click();
      await communitySearch.pressSequentially('Sunday', { delay: 90 }).catch(() => {});
    }
    await page.waitForTimeout(delay(2200));
  }

  await clickTab(page, /setup/i);
  await chapter(page, 'Setup', 'FTP, Gewicht und Fahrradprofile bestimmen Wattbereiche und geben dem Planer dein Bike-Profil mit.');
  await hideChapter(page);
  await page.waitForTimeout(delay(2600));
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.mkdirSync(VIDEO_DIR, { recursive: true });

  console.log(`Recording tutorial from ${BASE}`);
  console.log(`Mode: ${AUTHENTICATED ? `authenticated (${KC_USER})` : 'anonymous'}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  let videoPath = '';
  try {
    const context = await browser.newContext({
      viewport: VP,
      permissions: ['geolocation'],
      geolocation: DEMO_GEOLOCATION,
      recordVideo: {
        dir: VIDEO_DIR,
        size: VP
      }
    });
    const page = await context.newPage();
    await runTutorial(page);
    const video = page.video();
    await page.close();
    await context.close();
    videoPath = await video.path();
  } finally {
    await browser.close();
  }

  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error('Playwright did not produce a video file.');
  }

  fs.copyFileSync(videoPath, OUT_FILE);
  console.log(`Done: ${path.relative(ROOT, OUT_FILE)}`);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  console.error(`Make sure the app is running at ${BASE}.`);
  process.exit(1);
});
