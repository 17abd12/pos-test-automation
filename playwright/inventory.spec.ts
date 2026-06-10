import { test, expect } from "@playwright/test";
import { authAs } from "./utils/auth";
import { stub } from "./utils/stub";

/* PRODUCTS / INVENTORY — port of cypress/e2e/inventory.cy.ts (test plan §7).
 * Locks the carton↔piece price conversion (UI carton, API per-piece). */

const GROUPS = { groups: [{ id: "g1", name: "Snacks" }, { id: "g2", name: "Drinks" }] };
const VENDORS = { vendors: [{ id: "v1", name: "Lays Co", group_id: "g1" }] };
const INVENTORY = {
  items: [
    { id: "i1", name: "Lays Classic", no_of_units: 100, sale_price: 10, cost_price: 8, group_id: "g1", group_name: "Snacks", pieces_per_carton: 12 },
    { id: "i2", name: "Pepsi 500ml", no_of_units: 50, sale_price: 50, cost_price: 40, group_id: "g2", group_name: "Drinks", pieces_per_carton: 1 },
  ],
};

test.describe("Inventory view — manager", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "manager");
    await stub(page, "GET", /\/api\/groups$/, GROUPS);
    await stub(page, "GET", /\/api\/inventory$/, INVENTORY);
    await page.goto("/inventory/view");
    await expect(page.getByText("Lays Classic")).toBeVisible();
  });

  test("renders the table (smoke)", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Products Inventory" })).toBeVisible();
    await expect(page.getByText("Pepsi 500ml")).toBeVisible();
  });

  test("shows carton price by default, toggles to piece", async ({ page }) => {
    const row = page.locator("tr", { hasText: "Lays Classic" });
    await expect(row.getByText("Rs.120.00")).toBeVisible(); // 10 × 12
    await page.getByRole("button", { name: "Piece" }).click();
    await expect(row.getByText("Rs.10.00").first()).toBeVisible();
  });

  test("adjusts sale price, sends per-piece value", async ({ page }) => {
    await stub(page, "POST", /\/api\/inventory\/i1\/price-adjust$/, { message: "ok" });
    await page.locator("tr", { hasText: "Lays Classic" }).getByRole("button", { name: "Adjust Price" }).click();
    await page.locator('.modal-box input[type=number]').fill("240"); // carton; 240/12 = 20 per piece
    const req = page.waitForRequest((r) => r.url().includes("/price-adjust") && r.method() === "POST");
    await page.getByRole("button", { name: "Save Price" }).click();
    expect((await req).postDataJSON()).toEqual({ new_sale_price: 20 });
    await expect(page.getByText("Sale price updated")).toBeVisible();
  });
});

test.describe("Inventory add — manager", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "manager");
    await stub(page, "GET", /\/api\/groups$/, GROUPS);
    await stub(page, "GET", /\/api\/vendors$/, VENDORS);
    await stub(page, "GET", /\/api\/inventory$/, INVENTORY);
    await page.goto("/inventory/add");
    await expect(page.getByText("2 Products")).toBeVisible();
  });

  test("validates required fields with toasts", async ({ page }) => {
    await page.getByRole("button", { name: "Register New Product" }).click();
    await expect(page.getByText("Enter product name")).toBeVisible();
  });

  test("registers a product with per-piece conversion", async ({ page }) => {
    await stub(page, "POST", /\/api\/inventory$/, { message: "ok" });
    await page.getByPlaceholder("e.g. Lays Classic 30g").fill("Wavy Chips");
    await page.locator("select").first().selectOption({ label: "Snacks" });
    await page.getByPlaceholder("What you pay per carton").fill("1000"); // /10 = 100
    await page.getByPlaceholder("What you sell per carton").fill("1500"); // /10 = 150
    // pieces per carton input (the numeric one labelled Pieces per Carton):
    await page.locator("input[type=number]").first().fill("10");
    const req = page.waitForRequest((r) => r.url().includes("/api/inventory") && r.method() === "POST");
    await page.getByRole("button", { name: "Register New Product" }).click();
    expect((await req).postDataJSON().items[0]).toMatchObject({
      name: "Wavy Chips", costPrice: 100, sale_price: 150, units: 0, group_id: "g1", pieces_per_carton: 10,
    });
    await expect(page.getByText("Product added")).toBeVisible();
  });
});

test.describe("Inventory view — cashier", () => {
  test("hides manager actions", async ({ context, page }) => {
    await authAs(context, "cashier");
    await stub(page, "GET", /\/api\/groups$/, GROUPS);
    await stub(page, "GET", /\/api\/inventory$/, INVENTORY);
    await page.goto("/inventory/view");
    await expect(page.getByText("Lays Classic")).toBeVisible();
    await expect(page.getByRole("button", { name: "Adjust Price" })).toHaveCount(0);
  });
});
