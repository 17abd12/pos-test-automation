import { test, expect, type Page } from "@playwright/test";
import { authAs } from "./utils/auth";
import { stub } from "./utils/stub";

/* GROUPS — port of cypress/e2e/groups.cy.ts (test plan §10). */

const GROUPS = {
  groups: [
    { id: "g1", name: "Snacks", created_at: "2026-01-01T00:00:00Z" },
    { id: "g2", name: "Drinks", created_at: "2026-02-01T00:00:00Z" },
  ],
};
async function load(page: Page) {
  await stub(page, "GET", /\/api\/groups$/, GROUPS);
  await stub(page, "GET", /\/api\/account\/g1$/, { account: { netAccount: 5000 } });
  await stub(page, "GET", /\/api\/account\/g2$/, { account: { netAccount: -2000 } });
}

test.describe("Groups — manager", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "manager");
    await load(page);
    await page.goto("/groups");
    await expect(page.getByText("Snacks")).toBeVisible();
  });

  test("renders groups + net positions (smoke)", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Product Groups" })).toBeVisible();
    await expect(page.getByText("Account Net Position: Rs.5,000")).toBeVisible();
    await expect(page.getByText("Account Net Position: (Rs.2,000)")).toBeVisible();
  });

  test("creates a group", async ({ page }) => {
    await stub(page, "POST", /\/api\/groups$/, { message: "ok" });
    await page.getByRole("button", { name: "+ New Group" }).click();
    await page.getByPlaceholder("e.g. Snacks").fill("Dairy");
    const req = page.waitForRequest((r) => r.url().includes("/api/groups") && r.method() === "POST");
    await page.getByRole("button", { name: "Create Group" }).click();
    expect((await req).postDataJSON()).toEqual({ name: "Dairy" });
    await expect(page.getByText("Group created")).toBeVisible();
  });
});

test("Groups — cashier hides New Group", async ({ context, page }) => {
  await authAs(context, "cashier");
  await load(page);
  await page.goto("/groups");
  await expect(page.getByText("Snacks")).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New Group" })).toHaveCount(0);
});
