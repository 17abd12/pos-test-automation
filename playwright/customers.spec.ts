import { test, expect } from "@playwright/test";
import { authAs } from "./utils/auth";
import { stub } from "./utils/stub";

/* CUSTOMERS — port of cypress/e2e/customers.cy.ts (test plan §5).
 * Template for every page spec: authAs → stub data → goto → act + assert. */

const GROUPS = { groups: [{ id: "g1", name: "Wholesale" }, { id: "g2", name: "Retail" }] };
const emptyBuckets = { b0_15: 0, b16_30: 0, b31_45: 0, b46_60: 0, b60plus: 0 };
const CUSTOMERS = {
  customers: [
    { id: "c1", name: "Al-Madina Store", group_id: "g1", group_name: "Wholesale", display: "Al-Madina Store",
      balance: 15000, bucket_totals: { ...emptyBuckets, b0_15: 15000 }, dominant_bucket: "b0_15" },
    { id: "c2", name: "Bismillah Traders", group_id: "g2", group_name: "Retail", display: "Bismillah Traders",
      balance: 0, bucket_totals: { ...emptyBuckets }, dominant_bucket: "none" },
  ],
};

async function load(page: import("@playwright/test").Page) {
  await stub(page, "GET", /\/api\/groups$/, GROUPS);
  await stub(page, "GET", /\/api\/customers(\?.*)?$/, CUSTOMERS);
}

test.describe("Customers — manager", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "manager");
    await load(page);
    await page.goto("/customers");
    await expect(page.getByText("Al-Madina Store")).toBeVisible();
  });

  test("renders the customer list (smoke)", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
    await expect(page.getByText("Bismillah Traders")).toBeVisible();
    await expect(page.getByText("2 customers")).toBeVisible();
    // Rs.15,000.00 appears in several spots (row balance, header total, bucket) — first is enough.
    await expect(page.getByText("Rs.15,000.00").first()).toBeVisible();
  });

  test("filters the list by search text", async ({ page }) => {
    await page.getByPlaceholder("Search by customer name…").fill("madina");
    await expect(page.getByText("Al-Madina Store")).toBeVisible();
    await expect(page.getByText("Bismillah Traders")).toHaveCount(0);
  });

  test("disables submit until name and group are provided", async ({ page }) => {
    await page.getByRole("button", { name: "+ Add Customer" }).click();
    const submit = page.locator(".modal-box").getByRole("button", { name: "Add Customer", exact: true });
    await expect(submit).toBeDisabled();
    await page.getByPlaceholder("e.g. Al-Madina Store").fill("New Shop");
    await expect(submit).toBeDisabled();
    await page.locator(".modal-box select").selectOption({ label: "Wholesale" });
    await expect(submit).toBeEnabled();
  });

  test("creates a customer", async ({ page }) => {
    await stub(page, "POST", /\/api\/customers$/, { message: "ok", id: "c3" });
    await page.getByRole("button", { name: "+ Add Customer" }).click();
    await page.getByPlaceholder("e.g. Al-Madina Store").fill("New Shop");
    await page.locator(".modal-box select").selectOption({ label: "Wholesale" });

    const req = page.waitForRequest((r) => r.url().includes("/api/customers") && r.method() === "POST");
    await page.locator(".modal-box").getByRole("button", { name: "Add Customer", exact: true }).click();
    expect((await req).postDataJSON()).toMatchObject({ name: "New Shop", group_id: "g1" });
    await expect(page.getByText("Customer added")).toBeVisible();
  });

  test("renames a customer", async ({ page }) => {
    await stub(page, "PUT", /\/api\/customers\/c1$/, { message: "ok" });
    await page.locator(".rounded-2xl", { hasText: "Al-Madina Store" }).getByRole("button", { name: "Rename" }).click();
    await page.locator(".modal-box input").fill("Al-Madina Wholesale");
    const req = page.waitForRequest((r) => r.url().includes("/api/customers/c1") && r.method() === "PUT");
    await page.getByRole("button", { name: "Save Changes" }).click();
    expect((await req).postDataJSON()).toEqual({ name: "Al-Madina Wholesale" });
    await expect(page.getByText("Name updated")).toBeVisible();
  });

  test("deletes a customer after confirm", async ({ page }) => {
    await stub(page, "DELETE", /\/api\/customers\/c1$/, { message: "ok" });
    page.on("dialog", (d) => d.accept());
    await page.locator(".rounded-2xl", { hasText: "Al-Madina Store" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Customer deleted")).toBeVisible();
  });

  test("shows an error when delete is blocked", async ({ page }) => {
    await stub(page, "DELETE", /\/api\/customers\/c1$/, { message: "Cannot delete — customer has linked records" }, 400);
    page.on("dialog", (d) => d.accept());
    await page.locator(".rounded-2xl", { hasText: "Al-Madina Store" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Cannot delete")).toBeVisible();
  });
});

test.describe("Customers — cashier (read-only)", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "cashier");
    await load(page);
    await page.goto("/customers");
    await expect(page.getByText("Al-Madina Store")).toBeVisible();
  });

  test("hides write controls for cashier", async ({ page }) => {
    await expect(page.getByRole("button", { name: "+ Add Customer" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rename" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View Ledger" }).first()).toBeVisible();
  });
});
