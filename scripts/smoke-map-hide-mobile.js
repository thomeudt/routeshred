// Mobile smoke test for iPhone map-hide flow.
//
// Verifies that tapping the top-bar map toggle does not produce a blank screen
// and that the controls panel remains visible.
//
// Usage:
//   node scripts/smoke-map-hide-mobile.js
// Optional env:
//   SMOKE_BASE=http://localhost:3000
//   KC_USER=...
//   KC_PASS=...

const { chromium, devices } = require('playwright');

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';
const KC_USER = process.env.KC_USER || '';
const KC_PASS = process.env.KC_PASS || '';
const AUTHENTICATED = Boolean(KC_USER && KC_PASS);

async function maybeLogin(page) {
  const loginCardVisible = await page.locator('.login-screen, .login-card').first().isVisible({ timeout: 1200 }).catch(() => false);

  if (!loginCardVisible) {
    return;
  }

  if (!AUTHENTICATED) {
    throw new Error('Login is required for this environment. Set KC_USER and KC_PASS for smoke test execution.');
  }

  const loginButton = page.locator('.login-btn, .header-btn').filter({ hasText: /login|sign in|anmelden/i }).first();
  if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loginButton.click();
  }

  const userField = page.locator('#username, input[name="username"]').first();
  const passField = page.locator('#password, input[name="password"]').first();

  await userField.waitFor({ timeout: 10000 });
  await userField.fill(KC_USER);
  await passField.fill(KC_PASS);
  await page.locator('#kc-login, [type="submit"]').first().click();

  await page.waitForURL(new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 15000 }).catch(() => {});
}

async function waitForCoreUi(page) {
  await page.waitForSelector('.header, .header-top', { timeout: 15000 });
  await page.waitForSelector('.map-toggle-btn', { timeout: 15000 });
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'de-DE'
  });

  const page = await context.newPage();

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await maybeLogin(page);
    await waitForCoreUi(page);

    const toggle = page.locator('.map-toggle-btn').first();
    await toggle.click();

    // Controls-only mode must render immediately after hide.
    await page.waitForSelector('.map-container.controls-only-mode', { timeout: 6000 });
    await page.waitForSelector('.controls-panel .route-controls', { timeout: 6000 });

    // The hidden map path should not keep an active Leaflet canvas in view.
    const visibleMapCount = await page.locator('.leaflet-container:visible').count();
    if (visibleMapCount > 0) {
      throw new Error('Map is still visible after tapping hide toggle on mobile.');
    }

    // Basic blank-screen guard: controls heading must have visible text.
    const headingText = await page.locator('.route-controls .planner-heading').first().innerText();
    if (!String(headingText || '').trim()) {
      throw new Error('Controls rendered without content; possible blank-screen regression.');
    }

    console.log('PASS: iPhone map-hide toggle keeps controls visible and avoids blank screen.');
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
