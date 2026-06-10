import { test, expect, type Page } from "@playwright/test";
import { authAs } from "./utils/auth";
import { stub } from "./utils/stub";

/* SALE INVOICES — port of cypress/e2e/sale-invoices.cy.ts (test plan §4). */

const CUSTOMERS = { customers: [{ id: "c1", name: "Al-Madina", group_id: "g1", group_name: "Wholesale", display: "Al-Madina Store" }] };
const INVENTORY = { items: [{ id: "i1", name: "Lays Classic", cost_price: 8, sale_price: 10, no_of_units: 100, pieces_per_carton: 12, group_id: "g1", group_name: "Snacks" }] };
const GODAMS = { godams: [{ id: "gd1", name: "Main Store", location: "Hall A" }] };

async function load(page: Page) {
  await stub(page, "GET", /\/api\/customers$/, CUSTOMERS);
  await stub(page, "GET", /\/api\/inventory$/, INVENTORY);
  await stub(page, "GET", /\/api\/godams$/, GODAMS);
}
async function selectCustomer(page: Page) {
  await page.getByPlaceholder("Search customer...").fill("Al-Madina");
  await page.locator("li", { hasText: "Al-Madina Store" }).click();
  await expect(page.getByText("Selected: Al-Madina Store")).toBeVisible();
}
async function addProduct(page: Page) {
  await page.getByPlaceholder("Search any product...").fill("Lays");
  await page.locator("li", { hasText: "Lays Classic" }).click();
}

test.describe("Sale invoice — create", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "manager");
    await load(page);
    await page.goto("/sales/new");
    await expect(page.getByRole("heading", { name: "New Sale Invoice" })).toBeVisible();
  });

  test("disables product entry until a customer is selected", async ({ page }) => {
    await expect(page.getByPlaceholder("Search any product...")).toBeDisabled();
    await selectCustomer(page);
    await expect(page.getByPlaceholder("Search any product...")).toBeEnabled();
  });

  test("adds a line and computes totals", async ({ page }) => {
    await selectCustomer(page);
    await addProduct(page);
    await expect(page.getByText("Subtotal: Rs.120.00", { exact: true })).toBeVisible();
    // exact: "Total:" is a substring of "Subtotal:" — exact avoids matching both nodes.
    await expect(page.getByText("Total: Rs.120.00", { exact: true })).toBeVisible();
  });

  test("requires a customer", async ({ page }) => {
    await page.getByRole("button", { name: "Create Sale Invoice" }).click();
    await expect(page.getByText("Select a customer")).toBeVisible();
  });

  test("creates the invoice with per-piece price payload", async ({ page }) => {
    await stub(page, "POST", /\/api\/sale-invoices$/, { invoice: { id: "inv1", seq_no: "42" } });
    await selectCustomer(page);
    await addProduct(page);
    const req = page.waitForRequest((r) => r.url().includes("/api/sale-invoices") && r.method() === "POST");
    await page.getByRole("button", { name: "Create Sale Invoice" }).click();
    const body = (await req).postDataJSON();
    expect(body).toMatchObject({ customer_id: "c1", payment: "Credit", discount: 0 });
    expect(body.items[0]).toMatchObject({ inventory_id: "i1", quantity: 1, unit_type: "cartons", sale_price: 10, godam_id: "gd1" });
    await expect(page.getByText("Invoice Created!")).toBeVisible();
    await expect(page.getByText("Sale INV-42")).toBeVisible();
  });
});
