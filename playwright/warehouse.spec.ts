import { test, expect } from "@playwright/test";
import { authAs } from "./utils/auth";
import { stub } from "./utils/stub";

/* WAREHOUSE / GODAMS — port of cypress/e2e/warehouse.cy.ts (test plan §8). */

const GODAMS = { godams: [{ id: "gd1", name: "Main Store", location: "Hall A", created_by: "admin", created_at: "2026-01-01T00:00:00Z" }] };
const STOCK = { stock: [{ id: "s1", inventory_id: "i1", item_name: "Lays Classic", sale_price: 10, cost_price: 8, pieces_per_carton: 12, group_name: "Snacks", quantity: 120, added_by: "admin", added_at: "2026-01-02T00:00:00Z" }] };

test.describe("Warehouse", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "manager");
    await stub(page, "GET", /\/api\/godams$/, GODAMS);
    await page.goto("/warehouse");
    await expect(page.getByRole("heading", { name: "Warehouse (Godam)" })).toBeVisible();
  });

  test("renders godam management (smoke)", async ({ page }) => {
    await expect(page.getByText("Register New Godam")).toBeVisible();
    await expect(page.locator("td", { hasText: "Main Store" })).toBeVisible();
  });

  test("registers a new godam", async ({ page }) => {
    await stub(page, "POST", /\/api\/godams$/, { godam: { id: "gd2", name: "Cold Store" } });
    await page.getByPlaceholder("e.g. Main Warehouse, Godam A").fill("Cold Store");
    await page.getByPlaceholder("e.g. Block B, Floor 2").fill("Block C");
    const req = page.waitForRequest((r) => r.url().includes("/api/godams") && r.method() === "POST");
    await page.getByRole("button", { name: "Register Godam" }).click();
    expect((await req).postDataJSON()).toEqual({ name: "Cold Store", location: "Block C" });
    await expect(page.getByText('Godam "Cold Store" registered')).toBeVisible();
  });

  test("shows stock for a selected godam", async ({ page }) => {
    await stub(page, "GET", /\/api\/godams\/gd1\/stock$/, STOCK);
    await page.getByRole("button", { name: "Godam Situation" }).click();
    await page.locator("select").first().selectOption({ label: "Main Store (Hall A)" });
    await expect(page.locator("td", { hasText: "Lays Classic" })).toBeVisible();
    await expect(page.getByText("Total Stock Value")).toBeVisible();
  });
});
