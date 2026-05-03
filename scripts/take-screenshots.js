// Screenshot script for USER_MANUAL.md
//
// Usage (anonym):     node scripts/take-screenshots.js
// Usage (mit Login):  KC_USER=name KC_PASS=passwort node scripts/take-screenshots.js

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../docs/screenshots');
const BASE = 'http://localhost:3000';
const KC_USER = process.env.KC_USER || '';
const KC_PASS = process.env.KC_PASS || '';
const AUTHENTICATED = Boolean(KC_USER && KC_PASS);

const VP = { width: 1280, height: 800 };
const VP_MOBILE = { width: 390, height: 844 };

async function shot(page, name, label) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log(`  ✓ ${name}.png — ${label}`);
}

async function waitForMap(page) {
  await page.waitForSelector('.leaflet-container', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

// Log in via Keycloak redirect
async function login(page) {
  await page.waitForTimeout(1000);
  // Click Login button in header
  const loginBtn = page.locator('.header-btn').filter({ hasText: /login/i }).first();
  if (!await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) return;
  await loginBtn.click();
  // Wait for Keycloak login page
  await page.waitForURL(/\/realms\//, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  // Fill credentials
  const userField = page.locator('#username, input[name="username"]');
  const passField = page.locator('#password, input[name="password"]');
  if (await userField.isVisible({ timeout: 5000 }).catch(() => false)) {
    await userField.fill(KC_USER);
    await passField.fill(KC_PASS);
    await page.locator('[type="submit"], #kc-login').first().click();
    await page.waitForURL(new RegExp(BASE.replace(':', '\\:') + '|localhost:3000'), { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await waitForMap(page);
    console.log('  → logged in as', KC_USER);
  }
}

async function dismissModal(page) {
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // Click any visible "close" or backdrop
  for (const sel of [
    '[class*="modal-overlay"]', '[class*="overlay"]', '[class*="backdrop"]',
    '[aria-label*="close" i]', '[aria-label*="schließ" i]', 'button.close'
  ]) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 300 }).catch(() => false)) {
      await el.click({ force: true }).catch(() => {});
      break;
    }
  }
  await page.waitForTimeout(300);
}

async function clickTab(page, textRe) {
  const tab = page.locator('[role="tab"], .header-tabs button, nav button')
    .filter({ hasText: textRe }).first();
  if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(700);
  }
}

async function fillLocation(page, index, text) {
  const input = page.locator('.location-input input').nth(index);
  await input.waitFor({ timeout: 8000 });
  await input.click();
  // Clear first, then type character-by-character to fire React onChange per keystroke
  await input.fill('');
  await input.pressSequentially(text, { delay: 80 });
  // Wait for debounce (250ms) + geocoding API response
  const firstResult = page.locator('.location-results button').first();
  await firstResult.waitFor({ timeout: 10000 });
  await firstResult.click();
  // Wait until the input value is settled and dropdown closed
  await page.waitForSelector('.location-results', { state: 'hidden', timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function clickCalculate(page) {
  // Button text: "Route berechnen" (DE) / "Calculate Route" (EN)
  const btn = page.locator('button.btn-primary').filter({ hasText: /berech|calculat/i }).first();
  await btn.waitFor({ timeout: 8000 });
  await btn.click();
  console.log('  → route calculating...');
  // .route-stats only renders when route is set AND loading is false
  await page.waitForSelector('.route-stats, .route-stats-collapsible', { timeout: 45000 });
  await page.waitForTimeout(800);
}

async function scrollSidebarTo(page, position) {
  await page.evaluate((pos) => {
    for (const sel of [
      '.sidebar', '.route-controls', '.plan-controls',
      '.controls-panel', '.left-panel', 'aside', '.panel'
    ]) {
      const el = document.querySelector(sel);
      if (el) el.scrollTop = pos === 'bottom' ? 99999 : pos;
    }
  }, position);
  await page.waitForTimeout(400);
}

// ─── fresh page factory ──────────────────────────────────────────────────────
async function newPage(browser, viewport = VP) {
  const page = await browser.newPage();
  await page.setViewportSize(viewport);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await waitForMap(page);
  if (AUTHENTICATED) {
    await login(page);
  } else {
    await dismissModal(page);
  }
  return page;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Mode: ${AUTHENTICATED ? `authenticated (${KC_USER})` : 'anonymous'}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  try {
    // 01 — Overview, empty plan tab
    console.log('\n[01] Overview');
    {
      const page = await newPage(browser);
      await shot(page, '01-overview', 'App overview');
      await page.close();
    }

    // 02 — Location input with autocomplete
    console.log('\n[02] Location autocomplete');
    {
      const page = await newPage(browser);
      const input = page.locator('.location-input input').first();
      await input.waitFor({ timeout: 8000 }).catch(() => {});
      await input.click();
      await input.type('Tübingen', { delay: 60 });
      await page.waitForTimeout(1200);
      await shot(page, '02-location-input', 'Address autocomplete');
      await page.close();
    }

    // 03 — Personas visible (scroll sidebar)
    console.log('\n[03] Personas');
    {
      const page = await newPage(browser);
      await scrollSidebarTo(page, 200);
      await shot(page, '03-personas', 'Ride personas');
      await page.close();
    }

    // 04 — Calculated route
    console.log('\n[04] Calculated route');
    {
      const page = await newPage(browser);
      await fillLocation(page, 0, 'Tübingen');
      await fillLocation(page, 1, 'Herrenberg');
      await clickCalculate(page);
      await shot(page, '04-route-calculated', 'Route on map with elevation');
      await page.close();
    }

    // 05 — Elevation profile scrolled into view
    console.log('\n[05] Elevation profile');
    {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await waitForMap(page);
      AUTHENTICATED ? await login(page) : await dismissModal(page);
      await fillLocation(page, 0, 'Tübingen');
      await fillLocation(page, 1, 'Herrenberg');
      await clickCalculate(page);
      await scrollSidebarTo(page, 'bottom');
      await shot(page, '05-elevation-profile', 'Elevation profile');
      await page.close();
    }

    // 06 — Export section
    console.log('\n[06] Export section');
    {
      const page = await newPage(browser);
      await fillLocation(page, 0, 'Tübingen');
      await fillLocation(page, 1, 'Herrenberg');
      await clickCalculate(page);
      await scrollSidebarTo(page, 'bottom');
      await page.waitForTimeout(500);
      await shot(page, '06-export', 'Export buttons');
      await page.close();
    }

    // 07 — Setup tab
    console.log('\n[07] Setup tab');
    {
      const page = await newPage(browser);
      await clickTab(page, /setup/i);
      await shot(page, '07-setup', 'Setup tab');
      await page.close();
    }

    // Authenticated-only screenshots
    if (AUTHENTICATED) {
      // 08 — Meine Routen tab
      console.log('\n[08] Meine Routen');
      {
        const page = await newPage(browser);
        await clickTab(page, /routen|routes/i);
        await page.waitForTimeout(1200);
        await shot(page, '08-saved-routes', 'Saved routes panel');
        await page.close();
      }

      // 09 — Community tab
      console.log('\n[09] Community');
      {
        const page = await newPage(browser);
        await clickTab(page, /community/i);
        await page.waitForTimeout(1200);
        await shot(page, '09-community', 'Community / group rides');
        await page.close();
      }
    }

    // 10 — Help page
    console.log('\n[10] Help page');
    {
      const page = await browser.newPage();
      await page.setViewportSize(VP);
      await page.goto('http://localhost:5050/api/docs/manual', { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await shot(page, '10-help-page', 'User manual in browser');
      await page.close();
    }

    // 11 — Mobile view
    console.log('\n[11] Mobile');
    {
      const page = await newPage(browser, VP_MOBILE);
      await shot(page, '11-mobile', 'Mobile view');
      await page.close();
    }

  } finally {
    await browser.close();
  }

  const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png'));
  console.log(`\nDone! ${files.length} screenshots saved to docs/screenshots/`);
  files.forEach(f => console.log(`  ${f}`));
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
