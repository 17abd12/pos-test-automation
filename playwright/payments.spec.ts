import { test, expect, type Page } from "@playwright/test";
import { authAs } from "./utils/auth";
import { stub } from "./utils/stub";

/* PAYMENTS — port of cypress/e2e/payments.cy.ts (test plan §11). */

const GROUPS = { groups: [{ id: "g1", name: "Snacks" }] };
const CUSTOMERS = { customers: [{ id: "c1", display: "Al-Madina Store", group_id: "g1" }] };
const VENDORS = { vendors: [{ id: "v1", display: "Nestle", group_id: "g1" }] };

async function load(page: Page) {
  await stub(page, "GET", /\/api\/groups$/, GROUPS);
  await stub(page, "GET", /\/api\/customers$/, CUSTOMERS);
  await stub(page, "GET", /\/api\/vendors$/, VENDORS);
  await stub(page, "GET", /\/api\/payments\/customer$/, { payments: [] });
  await stub(page, "GET", /\/api\/payments\/vendor$/, { payments: [] });
}

test.describe("Payments", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "manager");
    await load(page);
    await page.goto("/payments");
    await expect(page.getByRole("heading", { name: "Record Payments" })).toBeVisible();
  });

  test("requires a party", async ({ page }) => {
    await page.getByRole("button", { name: "Record Transaction" }).click();
    await expect(page.getByText("Select a party")).toBeVisible();
  });

  test("records a customer payment", async ({ page }) => {
    await stub(page, "POST", /\/api\/payments\/customer$/, { message: "ok" });
    await page.locator("select").first().selectOption({ label: "Snacks" });
    await page.getByPlaceholder("0.00").fill("1500");
    const req = page.waitForRequest((r) => r.url().includes("/api/payments/customer") && r.method() === "POST");
    await page.getByRole("button", { name: "Record Transaction" }).click();
    expect((await req).postDataJSON()).toMatchObject({ customer_id: "c1", amount: 1500 });
    await expect(page.getByText("Payment recorded")).toBeVisible();
  });

  test("records a vendor payment", async ({ page }) => {
    await stub(page, "POST", /\/api\/payments\/vendor$/, { message: "ok" });
    await page.getByRole("button", { name: "Supplier Payment Made" }).click();
    await page.locator("select").first().selectOption({ label: "Snacks" });
    await page.getByPlaceholder("0.00").fill("3000");
    const req = page.waitForRequest((r) => r.url().includes("/api/payments/vendor") && r.method() === "POST");
    await page.getByRole("button", { name: "Record Transaction" }).click();
    expect((await req).postDataJSON()).toMatchObject({ vendor_id: "v1", amount: 3000 });
    await expect(page.getByText("Payment recorded")).toBeVisible();
  });
});
