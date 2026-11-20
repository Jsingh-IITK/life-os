/**
 * Browser smoke test for the running dev server.
 *
 * Exists because curl only sees the server-rendered HTML, and the two bugs
 * that reached the user — a collapsed layout and a redirect loop — were both
 * client-side and invisible to it.
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8081';
const EMAIL = process.env.SMOKE_EMAIL ?? 'qa-smoke@life-os.dev';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'QaSmoke!2026Passw0rd';

const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(e.message));

try {
  // --- signed out ----------------------------------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // let the session read settle

  record(
    'signed-out visitor lands on sign-in',
    page.url().includes('/sign-in'),
    page.url(),
  );

  const welcome = page.getByText('Welcome back');
  record('sign-in screen is visible', await welcome.isVisible().catch(() => false));

  // The collapsed-layout bug: the app filled a small box, leaving body showing.
  const fill = await page.evaluate(() => {
    const root = document.getElementById('root') ?? document.body.firstElementChild;
    if (!root) return null;
    const r = root.getBoundingClientRect();
    return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
  });
  record(
    'app fills the viewport',
    fill !== null && fill.h >= fill.vh * 0.9 && fill.w >= fill.vw * 0.9,
    fill ? `root ${Math.round(fill.w)}x${Math.round(fill.h)} vs viewport ${fill.vw}x${fill.vh}` : 'no root',
  );

  // The stuck-splash bug.
  record(
    'loading splash has gone away',
    !(await page.getByText('Life OS', { exact: true }).isVisible().catch(() => false)),
  );

  // Protected content must not be reachable while signed out.
  await page.goto(`${BASE}/fitness`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  record(
    'protected route redirects when signed out',
    page.url().includes('/sign-in'),
    page.url(),
  );

  // --- sign in -------------------------------------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByText('Sign in', { exact: true }).last().click();
  await page.waitForTimeout(4000);

  record('sign-in leaves the auth screens', !page.url().includes('/sign-in'), page.url());
  record(
    'home screen renders after sign-in',
    await page.getByText('Take-home').isVisible().catch(() => false),
  );

  // --- tabs ----------------------------------------------------------------
  for (const tab of ['Finance', 'Fitness', 'Assistant', 'Settings']) {
    await page.getByText(tab, { exact: true }).first().click();
    await page.waitForTimeout(900);
    record(`${tab} tab opens`, await page.getByText(tab, { exact: true }).first().isVisible());
  }

  record(
    'settings shows the signed-in email',
    await page.getByText(EMAIL, { exact: false }).isVisible().catch(() => false),
  );

  // --- session persistence -------------------------------------------------
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  record(
    'session survives a reload',
    !page.url().includes('/sign-in'),
    page.url(),
  );

  // --- sign out ------------------------------------------------------------
  // Click through rather than page.goto: a full reload restarts session
  // restoration, and the button is not mounted until that finishes.
  await page.getByText('Settings', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.getByText('Sign out', { exact: true }).click();
  await page.waitForTimeout(2500);
  record('sign-out returns to sign-in', page.url().includes('/sign-in'), page.url());

  // --- noise ---------------------------------------------------------------
  const realErrors = consoleErrors.filter(
    (e) =>
      !/favicon|Download the React DevTools|was preloaded using link preload/i.test(e) &&
      // React Navigation logs this when the tabs navigator unmounts during
      // sign-out, while an action is still in flight. It self-describes as
      // development-only and does not appear in production builds.
      !/ROUTE_NAMES_CHANGED.*was not handled by any navigator/s.test(e),
  );
  record('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  record('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
} catch (err) {
  record('smoke run completed without throwing', false, String(err).slice(0, 300));
} finally {
  await page.screenshot({ path: 'scripts/.smoke-last.png', fullPage: true }).catch(() => {});
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
