import { test, expect, type Page } from "@playwright/test";
import { authAs } from "./utils/auth";
import { stub } from "./utils/stub";

/* PURCHASES — port of cypress/e2e/purchases.cy.ts (test plan §9). */

const GROUPS = { groups: [{ id: "g1", name: "Snacks" }] };
const VENDORS = { vendors: [{ id: "v1", name: "Nestle", group_id: "g1", group_name: "Snacks", display: "Nestle (Snacks)" }] };
const INVENTORY = { items: [{ id: "i1", name: "Lays Classic", cost_price: 8, no_of_units: 0, pieces_per_carton: 12, group_id: "g1", group_name: "Snacks" }] };
const GODAMS = { godams: [{ id: "gd1", name: "Main Store", location: "Hall A" }] };

async function load(page: Page) {
  await stub(page, "GET", /\/api\/groups$/, GROUPS);
  await stub(page, "GET", /\/api\/vendors$/, VENDORS);
  await stub(page, "GET", /\/api\/inventory$/, INVENTORY);
  await stub(page, "GET", /\/api\/godams$/, GODAMS);
  await stub(page, "GET", /\/api\/customers$/, { customers: [] });
}

test.describe("Purchases — new", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "manager");
    await load(page);
    await page.goto("/purchases/new");
    await expect(page.getByRole("heading", { name: "Record a Purchase" })).toBeVisible();
  });

  test("requires a group", async ({ page }) => {
    await page.locator('button[type=submit]').click();
    await expect(page.getByText("Select a group first")).toBeVisible();
  });

  test("records a purchase with per-piece cost", async ({ page }) => {
    await stub(page, "POST", /\/api\/purchase-invoices$/, { purchase: { id: "p1" } });
    await page.locator(".card", { hasText: "Select Group" }).locator("select").selectOption({ label: "Snacks" });
    await page.locator(".card", { hasText: "Select Supplier" }).locator("select").selectOption({ label: "Nestle" });
    await page.getByPlaceholder("Search product...").fill("Lays");
    await page.locator("li", { hasText: "Lays Classic" }).click();
    await expect(page.getByText("Total: Rs.96.00")).toBeVisible(); // 8 × 12

    const req = page.waitForRequest((r) => r.url().includes("/api/purchase-invoices") && r.method() === "POST");
    await page.locator('button[type=submit]').click();
    const body = (await req).postDataJSON();
    expect(body).toMatchObject({ vendor_id: "v1", payment: "Credit" });
    expect(body.items[0]).toMatchObject({ inventory_id: "i1", quantity: 1, unit_type: "cartons", cost_price: 8, godam_id: "gd1" });
    await expect(page.getByText("Purchase Recorded!")).toBeVisible();
  });

  test("records a cash purchase", async ({ page }) => {
    await stub(page, "POST", /\/api\/cash-purchases$/, { ok: true });
    await page.getByRole("button", { name: "Cash / Wild Purchase" }).click();
    await page.getByPlaceholder("e.g. Packing tape, Office supplies").fill("Packing tape");
    await page.getByPlaceholder("0.00").first().fill("500");
    const req = page.waitForRequest((r) => r.url().includes("/api/cash-purchases") && r.method() === "POST");
    await page.locator(".modal-box").getByRole("button", { name: "Record Purchase" }).click();
    expect((await req).postDataJSON()).toMatchObject({ description: "Packing tape", amount: 500, payment: "Cash" });
    await expect(page.getByText("Cash purchase recorded")).toBeVisible();
  });
});
