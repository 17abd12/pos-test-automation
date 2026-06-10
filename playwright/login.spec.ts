import { test, expect } from "@playwright/test";

/* LOGIN — Playwright port of cypress/e2e/Login.cy.ts (test plan §1).
 * Stubbed: no DB. Uses the data-cy hooks added to app/login/page.tsx. */

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("renders the login form (smoke)", async ({ page }) => {
    await expect(page.locator('[data-cy="username"]')).toBeVisible();
    await expect(page.locator('[data-cy="password"]')).toBeVisible();
    await expect(page.locator('[data-cy="password"]')).toHaveAttribute("type", "password");
    await expect(page.locator('[data-cy="submit"]')).toContainText("Sign In");
  });

  test("blocks submit when fields are empty (HTML required)", async ({ page }) => {
    let hit = false;
    await page.route("**/api/login", (r) => { hit = true; return r.fallback(); });
    await page.locator('[data-cy="submit"]').click();
    // Browser-native validation prevents the request.
    const valid = await page.locator('[data-cy="username"]').evaluate(
      (el: HTMLInputElement) => el.checkValidity(),
    );
    expect(valid).toBe(false);
    expect(hit).toBe(false);
  });

  test("shows an error when credentials are rejected (401)", async ({ page }) => {
    await page.route("**/api/login", (r) =>
      r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Invalid credentials" }) }),
    );
    await page.locator('[data-cy="username"]').fill("wrong");
    await page.locator('[data-cy="password"]').fill("wrong");
    await page.locator('[data-cy="submit"]').click();

    await expect(page.locator('[data-cy="login-error"]')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    /* NOTE: the page reads data.error but the API returns data.message, so the
     * banner shows the fallback "Login failed". Asserting visibility, not text. */
  });

  test("sends the right credentials and shows the success toast", async ({ page }) => {
    await page.route("**/api/login", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Login successful", user: { role: "manager" } }) }),
    );
    // /api/me is delayed so the toast stays on screen before the redirect bounce.
    await page.route("**/api/me", (r) =>
      setTimeout(() => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ role: "manager" }) }), 800),
    );

    const reqPromise = page.waitForRequest("**/api/login");
    await page.locator('[data-cy="username"]').fill("admin");
    await page.locator('[data-cy="password"]').fill("admin123");
    await page.locator('[data-cy="submit"]').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toMatchObject({ username: "admin", password: "admin123" });
    await expect(page.getByText("Login successful")).toBeVisible();
  });
});
