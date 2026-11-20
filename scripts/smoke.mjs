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
  // React needs to attach handlers before a click registers; 'load' alone
  // fires too early and the click silently does nothing.
  await page.waitForTimeout(4000); // let the session read settle

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
  await page.waitForTimeout(4000);
  await page.getByLabel('Email', { exact: true }).fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  // Role selector rather than text: the text also matches the heading, and
  // the button is the thing under test.
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait for the condition, not a fixed delay — auth round-trip time varies.
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  record('sign-in leaves the auth screens', !page.url().includes('/sign-in'), page.url());
  record(
    'home dashboard renders after sign-in',
    await page.getByText('A little progress adds up.').isVisible().catch(() => false),
  );
  // Placeholder figures are acceptable only while they are unmistakably
  // labelled. If this notice ever disappears while the sample data is still
  // wired up, the screen is lying about whose money it shows.
  record(
    'placeholder figures carry the sample-data notice',
    await page.getByText('Sample data', { exact: false }).first().isVisible().catch(() => false),
  );
  record(
    'future modules are marked coming soon, not live',
    await page.getByText('Coming soon', { exact: true }).isVisible().catch(() => false),
  );

  // --- tabs ----------------------------------------------------------------
  // Assert each screen's own heading, not the nav label: the label stays
  // visible whether or not navigation actually happened, so the previous
  // version of this check would pass against a broken router.
  const TABS = [
    { tab: 'Finance', path: '/finance', heading: 'Make your money make sense.' },
    { tab: 'Fitness', path: '/fitness', heading: 'Train with intention.' },
    { tab: 'Assistant', path: '/assistant', heading: 'Assistant' },
    { tab: 'Settings', path: '/settings', heading: 'Settings' },
  ];
  for (const { tab, path, heading } of TABS) {
    await page.getByRole('link', { name: tab }).first().click();
    await page.waitForURL(`**${path}`, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
    record(
      `${tab} opens its own screen`,
      page.url().includes(path) && (await page.getByText(heading).first().isVisible().catch(() => false)),
      page.url(),
    );
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

  // --- design system -------------------------------------------------------
  // Backgrounds live on nested surfaces, not the shell root, so assert the
  // expected token colour appears somewhere in the rendered tree.
  const hasBg = (rgb) =>
    page.evaluate(
      (want) =>
        [...document.querySelectorAll('*')].some(
          (el) => getComputedStyle(el).backgroundColor === want,
        ),
      rgb,
    );
  const LIGHT_CANVAS = 'rgb(247, 244, 237)'; // #F7F4ED
  const DARK_CANVAS = 'rgb(25, 27, 25)'; // #191B19

  await page.getByText('Settings', { exact: true }).first().click();
  await page.waitForTimeout(900);

  await page.getByLabel('Light theme', { exact: false }).click();
  await page.waitForTimeout(700);
  const lightOk = await hasBg(LIGHT_CANVAS);
  const darkLeaked = await hasBg(DARK_CANVAS);
  record('light theme paints the warm ivory canvas', lightOk && !darkLeaked);

  await page.getByLabel('Dark theme', { exact: false }).click();
  await page.waitForTimeout(700);
  const darkOk = await hasBg(DARK_CANVAS);
  const lightLeaked = await hasBg(LIGHT_CANVAS);
  record('dark theme paints the charcoal canvas', darkOk && !lightLeaked);

  // Switching must not reload: a navigation would reset this marker.
  await page.evaluate(() => { window.__noReload = true; });
  await page.getByLabel('Light theme', { exact: false }).click();
  await page.waitForTimeout(500);
  record(
    'theme switch does not reload the page',
    await page.evaluate(() => window.__noReload === true),
  );

  await page.getByLabel('Dark theme', { exact: false }).click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  record('theme preference survives a reload', await hasBg(DARK_CANVAS));

  // --- responsive ----------------------------------------------------------
  const seesSidebar = () =>
    page.getByText('Your life, in one place').isVisible().catch(() => false);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(700);
  record('desktop shows the sidebar', await seesSidebar());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  record('mobile hides the sidebar', !(await seesSidebar()));
  record(
    'mobile keeps bottom navigation',
    await page.getByText('Finance', { exact: true }).first().isVisible().catch(() => false),
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);

  // --- sign out ------------------------------------------------------------
  // Click through rather than page.goto: a full reload restarts session
  // restoration, and the button is not mounted until that finishes.
  await page.getByText('Settings', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  const signOut = page.getByRole('button', { name: 'Sign out' });
  await signOut.waitFor({ state: 'visible' });
  await signOut.click();
  // Wait for the condition rather than a fixed delay: the preceding viewport
  // changes make the re-render time variable.
  await page.waitForURL('**/sign-in', { timeout: 10000 }).catch(() => {});
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
