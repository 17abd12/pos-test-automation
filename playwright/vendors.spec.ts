import { test, expect } from "@playwright/test";
import { authAs } from "./utils/auth";
import { stub } from "./utils/stub";

/* VENDORS / SUPPLIERS — port of cypress/e2e/vendors.cy.ts (test plan §6). */

const GROUPS = { groups: [{ id: "g1", name: "Wholesale" }, { id: "g2", name: "Retail" }] };
const VENDORS = {
  vendors: [
    { id: "v1", name: "Nestle Distribution", group_id: "g1", group_name: "Wholesale", display: "Nestle Distribution" },
    { id: "v2", name: "Unilever Supply", group_id: "g2", group_name: "Retail", display: "Unilever Supply" },
  ],
};

async function load(page: import("@playwright/test").Page) {
  await stub(page, "GET", /\/api\/groups$/, GROUPS);
  await stub(page, "GET", /\/api\/vendors(\?.*)?$/, VENDORS);
}

test.describe("Vendors — manager", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "manager");
    await load(page);
    await page.goto("/vendors");
    await expect(page.getByText("Nestle Distribution")).toBeVisible();
  });

  test("renders the supplier list (smoke)", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Suppliers" })).toBeVisible();
    await expect(page.getByText("2 Suppliers")).toBeVisible();
  });

  test("filters by search", async ({ page }) => {
    await page.getByPlaceholder("Search by name...").fill("nestle");
    await expect(page.getByText("Nestle Distribution")).toBeVisible();
    await expect(page.getByText("Unilever Supply")).toHaveCount(0);
  });

  test("creates a supplier", async ({ page }) => {
    await stub(page, "POST", /\/api\/vendors$/, { message: "ok" });
    await page.getByRole("button", { name: "+ Add Supplier" }).click();
    await page.getByPlaceholder("e.g. Nestle Distribution").fill("ABC Foods");
    await page.locator(".modal-box select").selectOption({ label: "Wholesale" });
    const req = page.waitForRequest((r) => r.url().includes("/api/vendors") && r.method() === "POST");
    await page.locator(".modal-box").getByRole("button", { name: "Add Supplier", exact: true }).click();
    expect((await req).postDataJSON()).toMatchObject({ name: "ABC Foods", group_id: "g1" });
    await expect(page.getByText("Supplier added")).toBeVisible();
  });

  test("renames a supplier", async ({ page }) => {
    await stub(page, "PUT", /\/api\/vendors\/v1$/, { message: "ok" });
    await page.locator(".card", { hasText: "Nestle Distribution" }).getByRole("button", { name: "Rename" }).click();
    await page.locator(".modal-box input").fill("Nestle Pakistan");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Name updated")).toBeVisible();
  });
});

test.describe("Vendors — cashier", () => {
  test("hides write controls", async ({ context, page }) => {
    await authAs(context, "cashier");
    await load(page);
    await page.goto("/vendors");
    await expect(page.getByText("Nestle Distribution")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Add Supplier" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rename" })).toHaveCount(0);
  });
});
