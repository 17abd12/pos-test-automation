import { defineConfig, devices } from "@playwright/test";
import "dotenv/config"; // loads .env → process.env.JWT_SECRET for the auth helper

/* Playwright mirror of the Cypress suite. Same strategy:
 *  • protected pages need a valid token → playwright/utils/auth.ts mints one
 *    (HS256 with the app's JWT_SECRET) so page specs run offline, no DB.
 *  • data APIs are stubbed with page.route() so UI specs are deterministic.
 *  • real-backend specs (backend.spec.ts) hit the live API and self-clean.
 *
 * Run: `npm run test:pw`. The POS app must already be running at baseURL
 * (this is a tests-only repo — the app lives + runs separately).
 */
export default defineConfig({
  testDir: "./playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.PW_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",        // full step trace viewer on failures
    screenshot: "only-on-failure",      // PNG saved to test-results/ + embedded in report
    video: "retain-on-failure",         // video clip on failures
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // No webServer: the app under test runs separately (see README).
  // To auto-start it, point a command at the app dir, e.g.:
  //   webServer: { command: "npm --prefix ../pos-app run dev", url: baseURL, reuseExistingServer: true }
});
