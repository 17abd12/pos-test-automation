import { test, expect } from "@playwright/test";

/* AUTH / ROUTE PROTECTION — port of cypress/e2e/auth.cy.ts (test plan §1).
 * No DB needed: proves middleware.ts blocks unauthenticated access. */

const PROTECTED_PAGES = [
  "/", "/sales", "/sales/new", "/customers", "/vendors",
  "/inventory/view", "/purchases", "/payments", "/expenses",
  "/warehouse", "/groups", "/reports/revenue",
];

const PROTECTED_APIS = ["/api/customers", "/api/vendors", "/api/inventory", "/api/sale-invoices"];

test.describe("Auth — route protection (no DB)", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  for (const path of PROTECTED_PAGES) {
    test(`redirects ${path} to /login when logged out`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  for (const api of PROTECTED_APIS) {
    test(`returns 401 for ${api} when logged out`, async ({ request }) => {
      const res = await request.get(api);
      expect(res.status()).toBe(401);
      expect((await res.json()).message).toBe("Unauthorized");
    });
  }

  test("allows /login while logged out", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('[data-cy="submit"]')).toBeVisible();
  });

  test("treats an invalid token as logged out", async ({ context, page }) => {
    await context.addCookies([{ name: "token", value: "not-a-real-jwt", url: "http://localhost:3000" }]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("/api/me returns 401 without a token", async ({ request }) => {
    // /api/me is not public in middleware → 401 before the handler runs.
    const res = await request.get("/api/me");
    expect(res.status()).toBe(401);
  });
});
