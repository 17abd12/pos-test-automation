import { test, expect, type Page } from "@playwright/test";
import { authAs } from "./utils/auth";
import { stub } from "./utils/stub";

/* POS TERMINAL — port of cypress/e2e/pos.cy.ts (test plan §3 + §13 override). */

const CUSTOMERS = { customers: [{ id: "c1", name: "Al-Madina", group_id: "g1", group_name: "Wholesale", display: "Al-Madina Store" }] };
const INVENTORY = { items: [{ id: "i1", name: "Lays Classic", sale_price: 10, cost_price: 8, no_of_units: 100, pieces_per_carton: 12, group_id: "g1", group_name: "Snacks" }] };
const GODAMS = { godams: [{ id: "gd1", name: "Main Store" }] };
const ITEM_STOCK = { entries: [{ godam_id: "gd1", godam_name: "Main Store", quantity: 100 }] };

async function load(page: Page) {
  await stub(page, "GET", /\/api\/customers$/, CUSTOMERS);
  await stub(page, "GET", /\/api\/inventory$/, INVENTORY);
  await stub(page, "GET", /\/api\/godams$/, GODAMS);
  await stub(page, "GET", /\/api\/godams\/item-stock.*/, ITEM_STOCK);
}
async function selectCustomer(page: Page) {
  await page.getByPlaceholder("Search customer...").fill("Al-Madina");
  await page.getByRole("button", { name: "Al-Madina Store" }).click();
  await expect(page.getByText("Selected: Al-Madina Store")).toBeVisible();
}
async function addProduct(page: Page) {
  await page.getByPlaceholder("Search product...").fill("Lays");
  await page.getByRole("button", { name: /Lays Classic/ }).click();
}

test.describe("POS terminal", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "cashier");
    await load(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "New Sale Terminal" })).toBeVisible();
  });

  test("renders an empty cart (smoke)", async ({ page }) => {
    await expect(page.getByText("Cart is empty")).toBeVisible();
  });

  test("adds a product as a godam-tied line", async ({ page }) => {
    await selectCustomer(page);
    await addProduct(page);
    await expect(page.locator("td", { hasText: "Lays Classic" })).toBeVisible();
  });

  test("blocks checkout with empty cart", async ({ page }) => {
    await selectCustomer(page);
    await page.getByRole("button", { name: "Complete Sale & Invoice" }).click();
    await expect(page.getByText("Add at least one product")).toBeVisible();
  });

  test("rejects quantity over godam stock", async ({ page }) => {
    await selectCustomer(page);
    await addProduct(page);
    await page.locator("table input[type=number]").first().fill("200"); // 200×12 > 100
    await page.getByRole("button", { name: "Complete Sale & Invoice" }).click();
    await expect(page.getByText(/only 100 pieces/)).toBeVisible();
  });

  test("completes a sale", async ({ page }) => {
    await stub(page, "POST", /\/api\/sale-invoices$/, { invoice: { id: "inv1", seq_no: "7" } });
    await selectCustomer(page);
    await addProduct(page);
    const req = page.waitForRequest((r) => r.url().includes("/api/sale-invoices") && r.method() === "POST");
    await page.getByRole("button", { name: "Complete Sale & Invoice" }).click();
    expect((await req).postDataJSON().items[0]).toMatchObject({ inventory_id: "i1", quantity: 1, sale_price: 10, godam_id: "gd1" });
    await expect(page.getByText("Sale #7 completed")).toBeVisible();
  });

  test("requires a manager passcode for a below-cost sale", async ({ page }) => {
    await stub(page, "POST", /\/api\/sale-invoices$/, { invoice: { id: "inv2", seq_no: "8" } });
    await selectCustomer(page);
    await addProduct(page);
    await page.locator("table input[type=number]").nth(1).fill("60"); // 60/12 = 5 < cost 8
    await page.getByRole("button", { name: "Complete Sale & Invoice" }).click();
    await expect(page.getByText("Below-Cost Sale")).toBeVisible();

    // Wrong passcode rejected.
    await stub(page, "POST", /\/api\/verify-price-override$/, { message: "Incorrect passcode" }, 401);
    await page.locator('input[type=password]').fill("0000");
    await page.getByRole("button", { name: "Verify & Proceed" }).click();
    await expect(page.getByText("Incorrect passcode")).toBeVisible();

    // Correct passcode → sale posts.
    await page.unroute(/\/api\/verify-price-override$/);
    await stub(page, "POST", /\/api\/verify-price-override$/, { ok: true }, 200);
    await page.locator('input[type=password]').fill("1234");
    await page.getByRole("button", { name: "Verify & Proceed" }).click();
    await expect(page.getByText("Sale #8 completed")).toBeVisible();
  });
});
